// Which model does a shell command ORDER from a model CLI, and is it a current one?
// Pure functions behind the gate agents/hooks/enforce-model-floor.ts; zero-dep (a hook runs before
// `mise run deps`), no node: imports even, so it is unit-testable without a process.
//
// THE POLICY (owner, 2026-10-03): work is ordered from the CURRENT generation of every model, never
// an older one that still happens to answer. A family's floor is its newest generation today
// (sol >= 6.1, grok >= 4.7, ...) so a newer one (sol 6.2, 7) passes with no edit; the floors live
// in agents/hooks/model-floor.toml and are the only thing that changes when a generation ships.
//
// WHY A TOKENIZER AND NOT A REGEX over the command string (the other gates use regexes): this gate
// denies, and a false positive here blocks an ordinary commit. A commit message, an `echo`, an
// `rr text 'codex exec -m gpt-5.6-sol'` or a heredoc body that merely MENTIONS an old order must
// pass; only a command that actually RUNS a model CLI counts. So words are cut the way a shell cuts
// them (quotes, backslashes, heredocs, comments, `;` `&` `|` `(` `)` `$(` and backticks end a
// command), wrappers (env, timeout, sudo, bash -c ...) are looked through, and only then is the
// executable's own flag list read.

import { arr, num, obj, str } from "./narrow.ts";

export type Cli = "codex" | "grok" | "claude" | "agy";
export type Vendor = "openai" | "xai" | "anthropic" | "google";

const CLIS = new Set(["codex", "grok", "claude", "agy"]);
const VENDORS = new Set(["openai", "xai", "anthropic", "google"]);

/** What the command says about the model: nothing, a literal slug, or something not inspectable. */
export type ModelRef =
  | { readonly kind: "absent" }
  | { readonly kind: "literal"; readonly slug: string }
  | { readonly kind: "unresolved"; readonly raw: string };

export interface Order {
  readonly cli: Cli;
  readonly model: ModelRef;
  /** The command must name its model (codex exec / e / review, agy -p): absent is a problem. */
  readonly needsModel: boolean;
  /** What to show a human: `codex exec`, `grok`, `claude`, `agy`. */
  readonly label: string;
}

// ---------------------------------------------------------------------------------------------
// 1. Words, the way a shell cuts them
// ---------------------------------------------------------------------------------------------

const COMMAND_END = new Set([";", "&", "|", "\n", "(", ")", "`"]);

interface Heredoc {
  readonly delimiter: string;
  readonly stripTabs: boolean;
}

/** The scanner's whole state; every reader below advances `i` and may extend the word. */
interface Scan {
  readonly src: string;
  i: number;
  word: string;
  inWord: boolean;
  words: string[];
  readonly out: string[][];
  // Heredoc delimiters seen on this line; their bodies start after its newline.
  readonly heredocs: Heredoc[];
}

function endWord(s: Scan): void {
  if (s.inWord) s.words.push(s.word);
  s.word = "";
  s.inWord = false;
}

function endCommand(s: Scan): void {
  endWord(s);
  if (s.words.length > 0) s.out.push(s.words);
  s.words = [];
}

function append(s: Scan, text: string): void {
  s.word += text;
  s.inWord = true;
}

// Outside quotes a backslash makes the next character literal (and joins `\<newline>`).
function readBackslash(s: Scan): void {
  const next = s.src.charAt(s.i + 1);
  if (next !== "\n") append(s, next);
  s.i += 2;
}

function readSingleQuoted(s: Scan): void {
  const end = s.src.indexOf("'", s.i + 1);
  const stop = end === -1 ? s.src.length : end;
  append(s, s.src.slice(s.i + 1, stop));
  s.i = stop + 1;
}

// Inside "..." a backslash only escapes these four; before anything else it stays.
const DOUBLE_QUOTE_ESCAPES = new Set(['"', "\\", "$", "`"]);

function readDoubleQuoted(s: Scan): void {
  s.i += 1;
  let text = "";
  while (s.i < s.src.length && s.src.charAt(s.i) !== '"') {
    const c = s.src.charAt(s.i);
    const next = s.src.charAt(s.i + 1);
    const escaped = c === "\\" && s.i + 1 < s.src.length;
    // A backslash before one of the four escapable characters yields that character; before
    // anything else both characters stay; not a backslash at all: the character itself.
    if (!escaped) text += c;
    else text += DOUBLE_QUOTE_ESCAPES.has(next) ? next : c + next;
    s.i += escaped ? 2 : 1;
  }
  append(s, text);
  s.i += 1;
}

// A comment runs to the end of the line.
function skipComment(s: Scan): void {
  while (s.i < s.src.length && s.src.charAt(s.i) !== "\n") s.i += 1;
}

// `<<EOF`, `<<'EOF'`, `<<"EOF"`, `<<-EOF`: the body is data, not commands.
function readHeredocOpener(s: Scan): void {
  let j = s.i + 2;
  const stripTabs = s.src.charAt(j) === "-";
  if (stripTabs) j += 1;
  while (s.src.charAt(j) === " " || s.src.charAt(j) === "\t") j += 1;
  const quote = s.src.charAt(j);
  let delimiter = "";
  if (quote === "'" || quote === '"') {
    const end = s.src.indexOf(quote, j + 1);
    const stop = end === -1 ? s.src.length : end;
    delimiter = s.src.slice(j + 1, stop);
    j = stop + 1;
  } else {
    while (j < s.src.length && !/[\s;&|()<>]/u.test(s.src.charAt(j))) {
      delimiter += s.src.charAt(j);
      j += 1;
    }
  }
  if (delimiter !== "") s.heredocs.push({ delimiter, stripTabs });
  endWord(s);
  s.i = j;
}

// After a newline: skip each pending heredoc body, up to and including its closing delimiter line.
function skipHeredocBodies(s: Scan): void {
  for (const h of s.heredocs) {
    let closed = false;
    while (!closed && s.i < s.src.length) {
      const eol = s.src.indexOf("\n", s.i);
      const stop = eol === -1 ? s.src.length : eol;
      const line = s.src.slice(s.i, stop);
      s.i = eol === -1 ? s.src.length : eol + 1;
      closed = (h.stripTabs ? line.replace(/^\t+/u, "") : line) === h.delimiter;
    }
  }
  s.heredocs.length = 0;
}

function readSeparator(s: Scan, c: string): void {
  endCommand(s);
  s.i += 1;
  if (c === "\n" && s.heredocs.length > 0) skipHeredocBodies(s);
}

function step(s: Scan): void {
  const c = s.src.charAt(s.i);
  if (c === "\\") {
    readBackslash(s);
    return;
  }
  if (c === "'") {
    readSingleQuoted(s);
    return;
  }
  if (c === '"') {
    readDoubleQuoted(s);
    return;
  }
  if (c === "#" && !s.inWord) {
    skipComment(s);
    return;
  }
  if (
    c === "<" &&
    s.src.startsWith("<<", s.i) &&
    s.src.charAt(s.i + 2) !== "<"
  ) {
    readHeredocOpener(s);
    return;
  }
  if (c === "$" && s.src.charAt(s.i + 1) === "(") {
    endCommand(s);
    s.i += 2;
    return;
  }
  if (c === " " || c === "\t") {
    endWord(s);
    s.i += 1;
    return;
  }
  if (COMMAND_END.has(c)) {
    readSeparator(s, c);
    return;
  }
  append(s, c);
  s.i += 1;
}

/** Split a command line into simple commands, each a list of words (quotes removed). */
export function simpleCommands(command: string): string[][] {
  const s: Scan = {
    src: command,
    i: 0,
    word: "",
    inWord: false,
    words: [],
    out: [],
    heredocs: [],
  };
  while (s.i < command.length) step(s);
  endCommand(s);
  return s.out;
}

// ---------------------------------------------------------------------------------------------
// 2. Which executable is being run, through its wrappers, and what model it was told to use
// ---------------------------------------------------------------------------------------------

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/u;
const SHELLS = new Set(["bash", "sh", "zsh", "dash"]);
// Wrappers that take no argument of their own before the real command (flags are skipped).
const PLAIN_WRAPPERS = new Set([
  "sudo",
  "command",
  "time",
  "nice",
  "nohup",
  "exec",
  "setsid",
  "stdbuf",
  "builtin",
]);
// Flags of those wrappers that take a value in the next word.
const WRAPPER_VALUE_FLAGS = new Set(["-n", "-u", "-g", "-h", "-o", "-e", "-i"]);
// Wrappers whose command comes after a literal `--`.
const DASHDASH_WRAPPERS = new Set(["systemd-run", "agent-resource-run"]);

const basename = (word: string): string =>
  word.slice(word.lastIndexOf("/") + 1);

function substitute(value: string, env: Map<string, string>): string {
  return value.replaceAll(
    /\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/gu,
    (whole, braced, bare) => {
      // Exactly one of the two groups matched: ${NAME} or $NAME.
      const name = typeof braced === "string" ? braced : String(bare);
      return env.get(name) ?? whole;
    },
  );
}

function modelRef(raw: string | undefined, env: Map<string, string>): ModelRef {
  if (raw === undefined) return { kind: "absent" };
  // `-c model="gpt-6.1-sol"` carries TOML quotes through the shell: strip one matching pair.
  const unquoted = raw.replace(/^(["'])(.*)\1$/u, "$2");
  const value = substitute(unquoted, env);
  if (value === "" || /[$`{}*?<>|;&]/u.test(value))
    return { kind: "unresolved", raw };
  return { kind: "literal", slug: value };
}

/** The value of `-m X` / `--model X` / `--model=X` / `-mX` at args[k], and where reading resumes. */
function modelFlag(
  args: readonly string[],
  k: number,
): { raw: string; next: number } | undefined {
  const a = args[k] ?? "";
  if (a === "-m" || a === "--model")
    return { raw: args[k + 1] ?? "", next: k + 2 };
  if (a.startsWith("--model="))
    return { raw: a.slice("--model=".length), next: k + 1 };
  if (a.startsWith("-m") && !a.startsWith("--") && a.length > 2) {
    return { raw: a.slice(2), next: k + 1 };
  }
  return undefined;
}

/** `model="x"` / `model=x` of a `-c` override, else undefined. */
function modelOfConfig(kv: string | undefined): string | undefined {
  if (kv === undefined) return undefined;
  const eq = kv.indexOf("=");
  if (eq === -1 || kv.slice(0, eq).trim() !== "model") return undefined;
  return kv.slice(eq + 1);
}

const CODEX_VALUE_FLAGS = new Set([
  "-c",
  "--config",
  "-i",
  "--image",
  "-p",
  "--profile",
  "-s",
  "--sandbox",
  "-C",
  "--cd",
  "-a",
  "--ask-for-approval",
  "-o",
  "--output-last-message",
  "--output-schema",
  "--color",
  "--local-provider",
  "--enable",
  "--disable",
  "--add-dir",
]);
const CODEX_ORDERING = new Set(["exec", "e", "review"]);
const CODEX_NOT_A_NEW_ORDER = new Set(["resume", "fork", "help"]);

interface CodexArgs {
  sub: string | undefined;
  subSub: string | undefined;
  rawModel: string | undefined;
  oss: boolean;
}

// One step of reading codex's arguments; returns where reading resumes.
function readCodexArg(
  args: readonly string[],
  k: number,
  into: CodexArgs,
): number {
  const a = args[k] ?? "";
  const flag = modelFlag(args, k);
  if (flag !== undefined) {
    into.rawModel = flag.raw;
    return flag.next;
  }
  if (a === "-c" || a === "--config") {
    into.rawModel = modelOfConfig(args[k + 1]) ?? into.rawModel;
    return k + 2;
  }
  if (a.startsWith("--config=")) {
    into.rawModel = modelOfConfig(a.slice("--config=".length)) ?? into.rawModel;
    return k + 1;
  }
  if (a === "--oss") {
    into.oss = true;
    return k + 1;
  }
  if (CODEX_VALUE_FLAGS.has(a)) return k + 2;
  if (!a.startsWith("-")) {
    if (into.sub === undefined) into.sub = a;
    else into.subSub ??= a;
  }
  return k + 1;
}

function codexOrder(
  args: readonly string[],
  env: Map<string, string>,
): Order | undefined {
  const into: CodexArgs = {
    sub: undefined,
    subSub: undefined,
    rawModel: undefined,
    oss: false,
  };
  for (let k = 0; k < args.length && args[k] !== "--";)
    k = readCodexArg(args, k, into);
  // Local open-source models (`--oss`) are not an order for a hosted model: no floor applies.
  if (into.oss) return undefined;
  const { sub, subSub } = into;
  const isExec = sub === "exec" || sub === "e";
  const continuesSession =
    isExec && subSub !== undefined && CODEX_NOT_A_NEW_ORDER.has(subSub);
  const ordering =
    sub !== undefined && CODEX_ORDERING.has(sub) && !continuesSession;
  const model = modelRef(into.rawModel, env);
  if (!ordering && model.kind === "absent") return undefined;
  return {
    cli: "codex",
    model,
    needsModel: ordering,
    label: `codex ${sub ?? ""}`.trim(),
  };
}

interface FlagScan {
  rawModel: string | undefined;
  headless: boolean;
}

function scanFlags(args: readonly string[]): FlagScan {
  const found: FlagScan = { rawModel: undefined, headless: false };
  for (let k = 0; k < args.length && args[k] !== "--";) {
    const flag = modelFlag(args, k);
    if (flag !== undefined) found.rawModel = flag.raw;
    if (args[k] === "-p" || args[k] === "--print") found.headless = true;
    k = flag?.next ?? k + 1;
  }
  return found;
}

/** grok and claude: an explicit -m/--model is judged; no flag means the vendor's own default. */
function explicitOnlyOrder(
  cli: "grok" | "claude",
  args: readonly string[],
  env: Map<string, string>,
): Order | undefined {
  const { rawModel } = scanFlags(args);
  // No flag: the CLI runs the default the vendor keeps at its newest model. Only an explicit
  // choice can be an old one.
  if (rawModel === undefined) return undefined;
  return { cli, model: modelRef(rawModel, env), needsModel: false, label: cli };
}

function agyOrder(
  args: readonly string[],
  env: Map<string, string>,
): Order | undefined {
  const { rawModel, headless } = scanFlags(args);
  if (!headless && rawModel === undefined) return undefined;
  return {
    cli: "agy",
    model: modelRef(rawModel, env),
    needsModel: headless,
    label: "agy -p",
  };
}

/** The order a model CLI's own arguments make, by executable name. */
function orderOf(
  exe: string,
  args: readonly string[],
  env: Map<string, string>,
): Order | undefined {
  if (exe === "codex") return codexOrder(args, env);
  if (exe === "agy") return agyOrder(args, env);
  if (exe === "grok") return explicitOnlyOrder("grok", args, env);
  if (exe === "claude") return explicitOnlyOrder("claude", args, env);
  return undefined;
}

function recordAssignment(word: string, env: Map<string, string>): void {
  const eq = word.indexOf("=");
  env.set(word.slice(0, eq), word.slice(eq + 1));
}

function skipAssignments(
  words: readonly string[],
  from: number,
  env: Map<string, string>,
): number {
  let i = from;
  while (i < words.length && ASSIGNMENT.test(words[i] ?? "")) {
    recordAssignment(words[i] ?? "", env);
    i += 1;
  }
  return i;
}

function skipEnv(
  words: readonly string[],
  from: number,
  env: Map<string, string>,
): number {
  let i = from + 1;
  while (i < words.length) {
    const w = words[i] ?? "";
    if (ASSIGNMENT.test(w)) recordAssignment(w, env);
    if (ASSIGNMENT.test(w)) i += 1;
    else if (w === "-u" || w === "-C" || w === "-S") i += 2;
    else if (w.startsWith("-")) i += 1;
    else return i;
  }
  return i;
}

function skipTimeout(words: readonly string[], from: number): number {
  let i = from + 1;
  while (i < words.length && (words[i] ?? "").startsWith("-")) {
    const flag = words[i] ?? "";
    i += flag === "-s" || flag === "-k" ? 2 : 1;
  }
  return i + 1; // the duration
}

function skipPlainWrapper(words: readonly string[], from: number): number {
  let i = from + 1;
  while (i < words.length && (words[i] ?? "").startsWith("-")) {
    i += WRAPPER_VALUE_FLAGS.has(words[i] ?? "") ? 2 : 1;
  }
  return i;
}

/** Where the wrapped command starts, or undefined when this word is not a wrapper we look through. */
function unwrap(
  words: readonly string[],
  i: number,
  base: string,
  env: Map<string, string>,
): number | undefined {
  if (DASHDASH_WRAPPERS.has(base)) {
    const dd = words.indexOf("--", i);
    return dd === -1 ? undefined : dd + 1;
  }
  if (base === "env") return skipEnv(words, i, env);
  if (base === "timeout") return skipTimeout(words, i);
  if (PLAIN_WRAPPERS.has(base)) return skipPlainWrapper(words, i);
  return undefined;
}

function addOrder(out: Order[], order: Order | undefined): void {
  if (order !== undefined) out.push(order);
}

// `bash -c '<model CLI> ...'` / `bash -lc ...`: the script is itself a command line.
function ordersInShellScript(
  words: readonly string[],
  shellAt: number,
  env: Map<string, string>,
  out: Order[],
): void {
  const flagAt = words.findIndex(
    (w, k) => k > shellAt && /^-[a-z]*c[a-z]*$/u.test(w),
  );
  const script = flagAt === -1 ? undefined : words[flagAt + 1];
  if (script !== undefined) ordersIn(script, out, env);
}

function ordersInWords(
  words: readonly string[],
  env: Map<string, string>,
  out: Order[],
): void {
  let i = 0;
  for (;;) {
    i = skipAssignments(words, i, env);
    const word = words[i];
    if (word === undefined) return;
    const base = basename(word);
    if (CLIS.has(base)) {
      addOrder(out, orderOf(base, words.slice(i + 1), env));
      return;
    }
    if (SHELLS.has(base)) {
      ordersInShellScript(words, i, env, out);
      return;
    }
    const next = unwrap(words, i, base, env);
    if (next === undefined) return;
    i = next;
  }
}

/** Every model-CLI order a command line contains (nested `bash -c` strings included). */
export function ordersIn(
  command: string,
  out: Order[] = [],
  env: Map<string, string> = new Map(),
): Order[] {
  for (const words of simpleCommands(command)) ordersInWords(words, env, out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// 3. Model names: vendor, family, generation
// ---------------------------------------------------------------------------------------------

const VERSION = /^\d+(?:\.\d+)*$/u;

/** Compare dotted versions numerically, padding with zeros: 6 < 6.1 < 6.2 < 7, and 6 === 6.0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let k = 0; k < len; k += 1) {
    const d = (pa[k] ?? 0) - (pb[k] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export interface ModelName {
  readonly vendor: Vendor;
  readonly family: string;
  readonly version: string;
}

// `claude -p --model opus` and friends name no generation: the CLI resolves them to the newest.
const CLAUDE_ALIASES = new Set([
  "opus",
  "sonnet",
  "haiku",
  "fable",
  "mythos",
  "opusplan",
  "default",
  "best",
]);

const OPENAI = /^gpt-(\d+(?:\.\d+)*)-([a-z][a-z0-9]*)$/u;
const XAI = /^grok-(\d+(?:\.\d+)*)(?:-[a-z0-9.-]+)?$/u;
// claude-opus-5-5, claude-haiku-4-5-20251001, claude-opus-4-6-thinking, claude-opus-5[1m]
const ANTHROPIC_NEW =
  /^claude-(opus|sonnet|haiku|fable|mythos)-(\d+(?:-\d{1,2})?)(?:-\d{8})?(?:-thinking)?(?:\[[a-z0-9]+\])?$/u;
// claude-3-5-sonnet-20241022, claude-3-opus-20240229
const ANTHROPIC_OLD =
  /^claude-(\d+(?:-\d{1,2})?)-(opus|sonnet|haiku)(?:-\d{8})?$/u;
// gemini-3.6-flash-high, gemini-3.1-pro-preview, gemini-3.5-flash-lite
const GOOGLE =
  /^gemini-(\d+(?:\.\d+)*)-(flash-lite|flash|pro)(?:-(?:minimal|low|medium|high|xhigh))?(?:-preview)?$/u;

const dotted = (dashed: string): string => dashed.replace("-", ".");

/** `agy` takes DISPLAY strings ("Claude Sonnet 4.6 (Thinking)"): lower-case, hyphenate, drop the tail. */
function agyForm(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/u, "")
    .trim()
    .replaceAll(/\s+/gu, "-")
    .replace(
      /^(claude-(?:opus|sonnet|haiku|fable|mythos))-(\d+)\.(\d+)$/u,
      "$1-$2-$3",
    );
}

/**
 * A model name's vendor, family and generation, or undefined when it is not of a shape this gate
 * knows.
 */
export function modelName(slug: string, cli: Cli): ModelName | undefined {
  const text = cli === "agy" ? agyForm(slug) : slug;
  const openai = OPENAI.exec(text);
  if (openai?.[1] !== undefined && openai[2] !== undefined) {
    return { vendor: "openai", family: openai[2], version: openai[1] };
  }
  const xai = XAI.exec(text);
  if (xai?.[1] !== undefined)
    return { vendor: "xai", family: "grok", version: xai[1] };
  const anthropic = ANTHROPIC_NEW.exec(text);
  if (anthropic?.[1] !== undefined && anthropic[2] !== undefined) {
    return {
      vendor: "anthropic",
      family: anthropic[1],
      version: dotted(anthropic[2]),
    };
  }
  const old = ANTHROPIC_OLD.exec(text);
  if (old?.[1] !== undefined && old[2] !== undefined) {
    return { vendor: "anthropic", family: old[2], version: dotted(old[1]) };
  }
  const google = GOOGLE.exec(text);
  if (google?.[1] !== undefined && google[2] !== undefined) {
    return { vendor: "google", family: google[2], version: google[1] };
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// 4. Floors
// ---------------------------------------------------------------------------------------------

export interface FloorRow {
  readonly vendor: Vendor;
  readonly family: string;
  readonly min: string;
}
export type Floors = ReadonlyMap<string, FloorRow>;
const floorKey = (vendor: string, family: string): string =>
  `${vendor}:${family}`;

export type FloorConfig =
  | { readonly ok: true; readonly floors: Floors }
  | { readonly ok: false; readonly errors: string[] };

/** The vendor a config word names, or undefined (a lookup, not a type guard). */
function vendorOf(value: string | undefined): Vendor | undefined {
  if (
    value === "openai" ||
    value === "xai" ||
    value === "anthropic" ||
    value === "google"
  ) {
    return value;
  }
  return undefined;
}

/** One [[family]] row: the floor it declares, or the problem with it. */
function parseRow(row: unknown, where: string): FloorRow | string {
  const r = obj(row);
  const vendor = vendorOf(str(r?.["vendor"]));
  const family = str(r?.["family"]);
  const min = str(r?.["min"]);
  if (vendor === undefined)
    return `${where}: \`vendor\` must be one of ${[...VENDORS].join(", ")}`;
  if (family === undefined || !/^[a-z][a-z0-9-]*$/u.test(family)) {
    return `${where}: \`family\` must be a lowercase word`;
  }
  if (min === undefined || !VERSION.test(min)) {
    return `${where}: \`min\` must be a dotted version like "6.1"`;
  }
  return { vendor, family, min };
}

/** Validate the parsed model-floor.toml. Every problem is listed, not just the first. */
export function parseFloorConfig(raw: unknown): FloorConfig {
  const root = obj(raw);
  if (root === undefined)
    return { ok: false, errors: ["the file is not a TOML table"] };
  const errors: string[] = [];
  if (num(root["schema"]) !== 1) errors.push("`schema` must be 1");
  const rows = arr(root["family"]) ?? [];
  if (rows.length === 0) errors.push("at least one [[family]] row is required");
  const floors = new Map<string, FloorRow>();
  rows.forEach((row, index) => {
    const parsed = parseRow(row, `[[family]] #${index + 1}`);
    if (typeof parsed === "string") {
      errors.push(parsed);
      return;
    }
    const key = floorKey(parsed.vendor, parsed.family);
    if (floors.has(key))
      errors.push(`[[family]] #${index + 1}: ${key} is listed twice`);
    floors.set(key, parsed);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, floors };
}

// Which vendors' models each CLI can run. An unknown name is a problem for the single-vendor
// CLIs; `agy` is a multi-vendor gateway that also serves open-weight models, which have no
// generation ordering, so a name it cannot read is left to `agy models` to accept or reject.
const CLI_VENDORS: Readonly<Record<Cli, readonly Vendor[]>> = {
  codex: ["openai"],
  grok: ["xai"],
  claude: ["anthropic"],
  agy: ["google", "anthropic"],
};

/** The floor row of a parsed model name's family, or undefined when that family has none. */
export function floorOf(floors: Floors, name: ModelName): FloorRow | undefined {
  return floors.get(floorKey(name.vendor, name.family));
}

/** The oldest slug that still meets a floor, e.g. `gpt-6.1-sol`. */
export function exampleSlug(row: FloorRow): string {
  if (row.vendor === "openai") return `gpt-${row.min}-${row.family}`;
  if (row.vendor === "xai") return `grok-${row.min}`;
  if (row.vendor === "anthropic")
    return `claude-${row.family}-${row.min.replace(".", "-")}`;
  return `gemini-${row.min}-${row.family}`;
}

function floorsOf(floors: Floors, vendors: readonly Vendor[]): string {
  const parts: string[] = [];
  for (const row of floors.values()) {
    if (vendors.includes(row.vendor)) parts.push(`${row.family} >= ${row.min}`);
  }
  return parts.join(", ");
}

function firstRow(
  floors: Floors,
  vendors: readonly Vendor[],
): FloorRow | undefined {
  for (const row of floors.values())
    if (vendors.includes(row.vendor)) return row;
  return undefined;
}

// What to tell a caller whose order names no model.
function nameAModel(order: Order, floors: Floors): string {
  const example = firstRow(floors, CLI_VENDORS[order.cli]);
  const e = example === undefined ? "" : `, e.g. -m ${exampleSlug(example)}`;
  const skill = order.cli === "agy" ? "antigravity" : order.cli;
  const contract =
    order.cli === "codex" ? "codex-run CLI contract C1" : `driving-${skill} C2`;
  return `\`${order.label}\` names no model — a bare ${order.cli} call silently inherits its own configured default, which is not necessarily a current one (${contract}: every embedded call passes the model explicitly). Add -m <slug> of the current generation${e}`;
}

/** One sentence naming what is wrong with this order and the smallest edit, or undefined if it passes. */
export function judge(order: Order, floors: Floors): string | undefined {
  const where = order.label;
  const model = order.model;
  const vendors = CLI_VENDORS[order.cli];
  if (model.kind === "absent")
    return order.needsModel ? nameAModel(order, floors) : undefined;
  if (model.kind === "unresolved") {
    return `\`${where}\`: model ${JSON.stringify(model.raw)} is not a literal name, so its generation cannot be checked — write the slug in the command (a NAME=slug assignment earlier in the same command line is followed)`;
  }
  if (
    order.cli === "claude" &&
    CLAUDE_ALIASES.has(model.slug.replace(/\[[a-z0-9]+\]$/u, ""))
  ) {
    return undefined;
  }
  const name = modelName(model.slug, order.cli);
  if (name === undefined) {
    if (order.cli === "agy") return undefined;
    return `\`${where}\`: model '${model.slug}' is not a current-generation ${order.cli} name (floors: ${floorsOf(floors, vendors)})`;
  }
  if (!vendors.includes(name.vendor)) {
    return `\`${where}\`: model '${model.slug}' is a ${name.vendor} model, which ${order.cli} does not run (floors: ${floorsOf(floors, vendors)})`;
  }
  const row = floorOf(floors, name);
  if (row === undefined) {
    return `\`${where}\`: family '${name.family}' of '${model.slug}' has no floor in agents/hooks/model-floor.toml (known: ${floorsOf(floors, [name.vendor])}) — a new family is added there on purpose, not allowed by default`;
  }
  if (compareVersions(name.version, row.min) < 0) {
    return `\`${where}\`: model '${model.slug}' is generation ${name.version}, below the ${row.vendor} ${row.family} floor >= ${row.min} — order ${exampleSlug(row)} or any newer ${row.family}`;
  }
  return undefined;
}
