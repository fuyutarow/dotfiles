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

const CLIS: readonly string[] = ["codex", "grok", "claude", "agy"];
const VENDORS: readonly string[] = ["openai", "xai", "anthropic", "google"];

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

/** Split a command line into simple commands, each a list of words (quotes removed). */
export function simpleCommands(command: string): string[][] {
  const out: string[][] = [];
  let words: string[] = [];
  let word = "";
  let inWord = false;
  // Heredoc delimiters seen on this line; their bodies start after its newline.
  const heredocs: Array<{ delimiter: string; stripTabs: boolean }> = [];

  const endWord = (): void => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  const endCommand = (): void => {
    endWord();
    if (words.length > 0) out.push(words);
    words = [];
  };

  let i = 0;
  const n = command.length;
  while (i < n) {
    const c = command.charAt(i);

    if (c === "\\") {
      // Outside quotes a backslash makes the next character literal (and joins `\<newline>`).
      const next = command.charAt(i + 1);
      if (next === "\n") {
        i += 2;
        continue;
      }
      word += next;
      inWord = true;
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = command.indexOf("'", i + 1);
      const stop = end === -1 ? n : end;
      word += command.slice(i + 1, stop);
      inWord = true;
      i = stop + 1;
      continue;
    }
    if (c === '"') {
      i += 1;
      while (i < n && command.charAt(i) !== '"') {
        const d = command.charAt(i);
        if (d === "\\" && i + 1 < n) {
          const e = command.charAt(i + 1);
          // Inside "..." a backslash only escapes these; elsewhere it stays.
          word += e === '"' || e === "\\" || e === "$" || e === "`" ? e : d + e;
          i += 2;
          continue;
        }
        word += d;
        i += 1;
      }
      inWord = true;
      i += 1;
      continue;
    }
    if (c === "#" && !inWord) {
      // A comment runs to the end of the line.
      while (i < n && command.charAt(i) !== "\n") i += 1;
      continue;
    }
    if (
      c === "<" &&
      command.charAt(i + 1) === "<" &&
      command.charAt(i + 2) !== "<"
    ) {
      // Heredoc: `<<EOF`, `<<'EOF'`, `<<"EOF"`, `<<-EOF`. Its body is data, not commands.
      let j = i + 2;
      const stripTabs = command.charAt(j) === "-";
      if (stripTabs) j += 1;
      while (command.charAt(j) === " " || command.charAt(j) === "\t") j += 1;
      const quote = command.charAt(j);
      let delimiter = "";
      if (quote === "'" || quote === '"') {
        const end = command.indexOf(quote, j + 1);
        const stop = end === -1 ? n : end;
        delimiter = command.slice(j + 1, stop);
        j = stop + 1;
      } else {
        while (j < n && !/[\s;&|()<>]/.test(command.charAt(j))) {
          delimiter += command.charAt(j);
          j += 1;
        }
      }
      if (delimiter !== "") heredocs.push({ delimiter, stripTabs });
      endWord();
      i = j;
      continue;
    }
    if (c === "$" && command.charAt(i + 1) === "(") {
      endCommand();
      i += 2;
      continue;
    }
    if (c === " " || c === "\t") {
      endWord();
      i += 1;
      continue;
    }
    if (COMMAND_END.has(c)) {
      endCommand();
      i += 1;
      if (c === "\n" && heredocs.length > 0) {
        // Skip each pending heredoc body, up to and including its closing delimiter line.
        for (const h of heredocs) {
          while (i < n) {
            const eol = command.indexOf("\n", i);
            const stop = eol === -1 ? n : eol;
            const line = command.slice(i, stop);
            i = eol === -1 ? n : eol + 1;
            const closing = h.stripTabs ? line.replace(/^\t+/, "") : line;
            if (closing === h.delimiter) break;
          }
        }
        heredocs.length = 0;
      }
      continue;
    }
    word += c;
    inWord = true;
    i += 1;
  }
  endCommand();
  return out;
}

// ---------------------------------------------------------------------------------------------
// 2. Which executable is being run, through its wrappers, and what model it was told to use
// ---------------------------------------------------------------------------------------------

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
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
  return value.replace(
    /\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/g,
    (whole, braced, bare) => {
      const name =
        typeof braced === "string"
          ? braced
          : typeof bare === "string"
            ? bare
            : "";
      return env.get(name) ?? whole;
    },
  );
}

function modelRef(raw: string | undefined, env: Map<string, string>): ModelRef {
  if (raw === undefined) return { kind: "absent" };
  // `-c model="gpt-6.1-sol"` carries TOML quotes through the shell: strip one matching pair.
  const unquoted = raw.replace(/^(["'])(.*)\1$/, "$2");
  const value = substitute(unquoted, env);
  if (value === "" || /[$`{}*?<>|;&]/.test(value))
    return { kind: "unresolved", raw };
  return { kind: "literal", slug: value };
}

/** The value of `-m X` / `--model X` / `--model=X` / `-mX` among `args`, and where it was found. */
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

/** `model="x"` / `model=x` of a `-c` override, else undefined. */
function modelOfConfig(kv: string | undefined): string | undefined {
  if (kv === undefined) return undefined;
  const eq = kv.indexOf("=");
  if (eq === -1 || kv.slice(0, eq).trim() !== "model") return undefined;
  return kv.slice(eq + 1);
}

function codexOrder(
  args: readonly string[],
  env: Map<string, string>,
): Order | undefined {
  let sub: string | undefined;
  let subSub: string | undefined;
  let rawModel: string | undefined;
  let oss = false;
  for (let k = 0; k < args.length;) {
    const a = args[k] ?? "";
    if (a === "--") break;
    const flag = modelFlag(args, k);
    if (flag !== undefined) {
      rawModel = flag.raw;
      k = flag.next;
    } else if (a === "-c" || a === "--config") {
      rawModel = modelOfConfig(args[k + 1]) ?? rawModel;
      k += 2;
    } else if (a.startsWith("--config=")) {
      rawModel = modelOfConfig(a.slice("--config=".length)) ?? rawModel;
      k += 1;
    } else if (a === "--oss") {
      oss = true;
      k += 1;
    } else if (CODEX_VALUE_FLAGS.has(a)) {
      k += 2;
    } else {
      if (!a.startsWith("-")) {
        if (sub === undefined) sub = a;
        else if (subSub === undefined) subSub = a;
      }
      k += 1;
    }
  }
  // Local open-source models (`--oss`) are not an order for a hosted model: no floor applies.
  if (oss) return undefined;
  const ordering =
    sub !== undefined &&
    CODEX_ORDERING.has(sub) &&
    !(
      (sub === "exec" || sub === "e") &&
      subSub !== undefined &&
      CODEX_NOT_A_NEW_ORDER.has(subSub)
    );
  const model = modelRef(rawModel, env);
  if (!ordering && model.kind === "absent") return undefined;
  return {
    cli: "codex",
    model,
    needsModel: ordering,
    label: `codex ${sub ?? ""}`.trim(),
  };
}

/** grok and claude: an explicit -m/--model is judged; no flag means the vendor's own default. */
function explicitOnlyOrder(
  cli: "grok" | "claude",
  args: readonly string[],
  env: Map<string, string>,
): Order | undefined {
  let rawModel: string | undefined;
  for (let k = 0; k < args.length;) {
    if (args[k] === "--") break;
    const flag = modelFlag(args, k);
    if (flag !== undefined) {
      rawModel = flag.raw;
      k = flag.next;
    } else {
      k += 1;
    }
  }
  // No flag: the CLI runs the default the vendor keeps at its newest model. Only an explicit
  // choice can be an old one.
  if (rawModel === undefined) return undefined;
  return { cli, model: modelRef(rawModel, env), needsModel: false, label: cli };
}

function agyOrder(
  args: readonly string[],
  env: Map<string, string>,
): Order | undefined {
  let rawModel: string | undefined;
  let headless = false;
  for (let k = 0; k < args.length;) {
    const a = args[k] ?? "";
    if (a === "--") break;
    const flag = modelFlag(args, k);
    if (flag !== undefined) {
      rawModel = flag.raw;
      k = flag.next;
    } else {
      if (a === "-p" || a === "--print") headless = true;
      k += 1;
    }
  }
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

function ordersInWords(
  words: readonly string[],
  env: Map<string, string>,
  out: Order[],
): void {
  let i = 0;
  for (;;) {
    while (i < words.length && ASSIGNMENT.test(words[i] ?? "")) {
      const w = words[i] ?? "";
      const eq = w.indexOf("=");
      env.set(w.slice(0, eq), w.slice(eq + 1));
      i += 1;
    }
    const word = words[i];
    if (word === undefined) return;
    const base = basename(word);

    if (CLIS.includes(base)) {
      const order = orderOf(base, words.slice(i + 1), env);
      if (order !== undefined) out.push(order);
      return;
    }
    if (SHELLS.has(base)) {
      // `bash -c '<model CLI> ...'` / `bash -lc ...`: the script is itself a command line.
      const flagAt = words.findIndex(
        (w, k) => k > i && /^-[a-z]*c[a-z]*$/.test(w),
      );
      const script = flagAt === -1 ? undefined : words[flagAt + 1];
      if (script !== undefined) ordersIn(script, out, env);
      return;
    }
    if (DASHDASH_WRAPPERS.has(base)) {
      const dd = words.indexOf("--", i);
      if (dd === -1) return;
      i = dd + 1;
      continue;
    }
    if (base === "env") {
      i += 1;
      while (i < words.length) {
        const w = words[i] ?? "";
        if (ASSIGNMENT.test(w)) {
          const eq = w.indexOf("=");
          env.set(w.slice(0, eq), w.slice(eq + 1));
          i += 1;
        } else if (w === "-u" || w === "-C" || w === "-S") {
          i += 2;
        } else if (w.startsWith("-")) {
          i += 1;
        } else {
          break;
        }
      }
      continue;
    }
    if (base === "timeout") {
      i += 1;
      while (i < words.length && (words[i] ?? "").startsWith("-")) {
        const flag = words[i] ?? "";
        i += flag === "-s" || flag === "-k" ? 2 : 1;
      }
      i += 1; // the duration
      continue;
    }
    if (PLAIN_WRAPPERS.has(base)) {
      i += 1;
      while (i < words.length && (words[i] ?? "").startsWith("-")) {
        i += WRAPPER_VALUE_FLAGS.has(words[i] ?? "") ? 2 : 1;
      }
      continue;
    }
    return;
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

const VERSION = /^\d+(?:\.\d+)*$/;

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

const OPENAI = /^gpt-(\d+(?:\.\d+)*)-([a-z][a-z0-9]*)$/;
const XAI = /^grok-(\d+(?:\.\d+)*)(?:-[a-z0-9.-]+)?$/;
// claude-opus-5-5, claude-haiku-4-5-20251001, claude-opus-4-6-thinking, claude-opus-5[1m]
const ANTHROPIC_NEW =
  /^claude-(opus|sonnet|haiku|fable|mythos)-(\d+(?:-\d{1,2})?)(?:-\d{8})?(?:-thinking)?(?:\[[a-z0-9]+\])?$/;
// claude-3-5-sonnet-20241022, claude-3-opus-20240229
const ANTHROPIC_OLD =
  /^claude-(\d+(?:-\d{1,2})?)-(opus|sonnet|haiku)(?:-\d{8})?$/;
// gemini-3.6-flash-high, gemini-3.1-pro-preview, gemini-3.5-flash-lite
const GOOGLE =
  /^gemini-(\d+(?:\.\d+)*)-(flash-lite|flash|pro)(?:-(?:minimal|low|medium|high|xhigh))?(?:-preview)?$/;

const dotted = (dashed: string): string => dashed.replace("-", ".");

/**
 * A model name's vendor, family and generation, or undefined when it is not of a shape this gate
 * knows. `agy` takes DISPLAY strings ("Claude Sonnet 4.6 (Thinking)", "Gemini 3.6 Flash (Medium)"),
 * so those are normalised first: lower-case, spaces to hyphens, the parenthesised tail dropped.
 */
export function modelName(slug: string, cli: Cli): ModelName | undefined {
  const text =
    cli === "agy"
      ? slug
          .toLowerCase()
          .replace(/\s*\([^)]*\)\s*$/, "")
          .trim()
          .replace(/\s+/g, "-")
          .replace(
            /^(claude-(?:opus|sonnet|haiku|fable|mythos))-(\d+)\.(\d+)$/,
            "$1-$2-$3",
          )
      : slug;
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

/** Validate the parsed model-floor.toml. Every problem is listed, not just the first. */
export function parseFloorConfig(raw: unknown): FloorConfig {
  const errors: string[] = [];
  const root = obj(raw);
  if (root === undefined)
    return { ok: false, errors: ["the file is not a TOML table"] };
  if (num(root["schema"]) !== 1) errors.push("`schema` must be 1");
  const rows = arr(root["family"]);
  const floors = new Map<string, FloorRow>();
  if (rows === undefined || rows.length === 0) {
    errors.push("at least one [[family]] row is required");
  } else {
    rows.forEach((row, index) => {
      const r = obj(row);
      const where = `[[family]] #${index + 1}`;
      const vendor = vendorOf(str(r?.["vendor"]));
      const family = str(r?.["family"]);
      const min = str(r?.["min"]);
      if (vendor === undefined) {
        errors.push(
          `${where}: \`vendor\` must be one of ${VENDORS.join(", ")}`,
        );
        return;
      }
      if (family === undefined || !/^[a-z][a-z0-9-]*$/.test(family)) {
        errors.push(`${where}: \`family\` must be a lowercase word`);
        return;
      }
      if (min === undefined || !VERSION.test(min)) {
        errors.push(`${where}: \`min\` must be a dotted version like "6.1"`);
        return;
      }
      const key = floorKey(vendor, family);
      if (floors.has(key))
        errors.push(`${where}: ${vendor}/${family} is listed twice`);
      floors.set(key, { vendor, family, min });
    });
  }
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

function exampleSlug(row: FloorRow): string {
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

/** One sentence naming what is wrong with this order and the smallest edit, or undefined if it passes. */
export function judge(order: Order, floors: Floors): string | undefined {
  const where = order.label;
  const model = order.model;
  const vendors = CLI_VENDORS[order.cli];
  if (model.kind === "absent") {
    if (!order.needsModel) return undefined;
    const example = firstRow(floors, vendors);
    const e = example === undefined ? "" : `, e.g. -m ${exampleSlug(example)}`;
    return `\`${where}\` names no model — a bare ${order.cli} call silently inherits its own configured default, which is not necessarily a current one (driving-${order.cli === "agy" ? "antigravity" : order.cli} C2: every embedded call passes the model explicitly). Add -m <slug> of the current generation${e}`;
  }
  if (model.kind === "unresolved") {
    return `\`${where}\`: model ${JSON.stringify(model.raw)} is not a literal name, so its generation cannot be checked — write the slug in the command (a NAME=slug assignment earlier in the same command line is followed)`;
  }
  if (
    order.cli === "claude" &&
    CLAUDE_ALIASES.has(model.slug.replace(/\[[a-z0-9]+\]$/, ""))
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
  const row = floors.get(floorKey(name.vendor, name.family));
  if (row === undefined) {
    return `\`${where}\`: family '${name.family}' of '${model.slug}' has no floor in agents/hooks/model-floor.toml (known: ${floorsOf(floors, [name.vendor])}) — a new family is added there on purpose, not allowed by default`;
  }
  if (compareVersions(name.version, row.min) < 0) {
    return `\`${where}\`: model '${model.slug}' is generation ${name.version}, below the ${row.vendor} ${row.family} floor >= ${row.min} — order ${exampleSlug(row)} or any newer ${row.family}`;
  }
  return undefined;
}
