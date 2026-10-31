#!/usr/bin/env bun
import { access, readFile, realpath } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { cli } from "cleye";
import { jsonOf, jsonText, z } from "../../../hooks/zod.ts";

// Cleye handles unknown options after parsing their raw spelling.

const hard = ["fmt", "f", "fmt:check", "lint", "test", "up", "check"];
const soft = ["setup", "i", "fmt:staged", "l", "t", "u", "c"];
// A colocated jj repo (a `.jj/` beside `.git/`) runs NO git hooks, so its commit gate and its
// post-merge step exist only as these two verbs (wiring-repositories JJ-1). Hard there; not
// checked in a git-only repo.
const jj = ["commit", "pull", "push"];
const unknownArrayOrEmpty = z.unknown().transform((value) => {
  const parsed = z.array(z.unknown()).safeParse(value);
  return parsed.success ? parsed.data : [];
});

type Task = Readonly<{
  name: string;
  aliases: string[];
  source: string;
  depends: unknown[];
}>;

const TaskEntrySchema = z.object({
  name: z.string(),
  source: z.string(),
  aliases: unknownArrayOrEmpty,
  depends: unknownArrayOrEmpty,
});

function tasks(value: unknown): Task[] {
  const entries = z.array(z.unknown()).safeParse(value);
  if (!entries.success) return [];
  return entries.data.flatMap((entry) => {
    const parsed = TaskEntrySchema.safeParse(entry);
    if (!parsed.success) return [];
    return [
      {
        name: parsed.data.name,
        source: parsed.data.source,
        aliases: parsed.data.aliases.flatMap((alias) =>
          typeof alias === "string" ? [alias] : [],
        ),
        depends: parsed.data.depends,
      },
    ];
  });
}

async function miseTasks(
  root: string,
): Promise<{ tasks: Task[]; error?: string }> {
  // bounded: mise tasks ls exits promptly; env failures surface via captured stderr
  const child = Bun.spawn(["mise", "tasks", "ls", "--json"], {
    cwd: root,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
    killSignal: "SIGTERM",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) return { tasks: [], error: stderr };
  const decoded = jsonText.safeParse(stdout);
  if (!decoded.success) {
    return { tasks: [], error: "mise returned invalid JSON" };
  }
  return { tasks: tasks(decoded.data) };
}

function topLevelToml(source: string): string[] {
  const lines: string[] = [];
  let inBlock = false;
  for (const line of source.split("\n")) {
    const delimiters = (line.match(/'''|"""/gu) ?? []).length;
    if (inBlock) {
      inBlock = delimiters % 2 !== 1;
      continue;
    }
    if (delimiters % 2 === 1) {
      inBlock = true;
      continue;
    }
    lines.push(line);
  }
  return lines;
}

function waivers(lines: string[]): {
  active: Set<string>;
  reasonless: string[];
} {
  const active = new Set<string>();
  const reasonless: string[] = [];
  for (const line of lines) {
    const full = line.match(
      /^\s*#\s*mise-contract:\s*waive\s+(\S+)\s+--\s+.+$/u,
    )?.[1];
    if (full !== undefined) {
      active.add(full);
      continue;
    }
    const incomplete = line.match(
      /^\s*#\s*mise-contract:\s*waive\s+(\S+)/u,
    )?.[1];
    if (incomplete !== undefined) reasonless.push(incomplete);
  }
  const verbAliases: ReadonlyArray<readonly [string, string]> = [
    ["setup", "i"],
    ["fmt", "f"],
    ["lint", "l"],
    ["test", "t"],
    ["up", "u"],
    ["check", "c"],
  ];
  for (const [verb, alias] of verbAliases) {
    if (active.has(verb)) active.add(alias);
  }
  return { active, reasonless };
}

function dependencyName(value: unknown): string | undefined {
  if (Array.isArray(value))
    return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" ? value.split(" ")[0] : undefined;
}

// --- C-A RUNTIME-DECLARED / C-B BODY-IS-DECLARATION (added 2026-07-25) -----------------
// Both come from one measured failure. `[tools]` pinning had been routed OUT of this skill
// as "model-native"; the consequence, censused across three repos on 2026-07-25, was that
// EVERY one of them invoked a runtime from a task body while declaring none of it — dotfiles
// and beateater had no [tools] section at all, consumer repository declared julia only. `mise run` then
// depends on whatever the machine happens to have, which is the exact opposite of what mise
// is for. The task graph's soundness is NOT separable from the runtime declaration: a body
// that says `bun x` is only correct if [tools] says bun.
//
// C-B is the same lesson one level down. cc:install-mcp was a ~40-line shell body that
// looped over jq output; it silently failed to prune anything, and no test existed because
// no test CAN exist for a body embedded in TOML. Bodies declare; logic lives in a script
// file where it can be imported and tested (writing-bun-scripts NO-NEW-BASH owns the rule,
// this is its mise boundary).

const BODY_MAX_LINES = 10;

// Runtime binaries whose presence a task body assumes. Key = binary in command position,
// value = the [tools] key that would declare it.
const RUNTIMES: Array<[RegExp, string]> = [
  [/(^|[|;&(]|&&|\|\|)\s*bunx?\b/mu, "bun"],
  [/(^|[|;&(]|&&|\|\|)\s*deno\b/mu, "deno"],
  [/(^|[|;&(]|&&|\|\|)\s*(node|npx)\b/mu, "node"],
  [/(^|[|;&(]|&&|\|\|)\s*(uv|uvx)\b/mu, "uv"],
  [/(^|[|;&(]|&&|\|\|)\s*julia\b/mu, "julia"],
  [/(^|[|;&(]|&&|\|\|)\s*(cargo|rustc)\b/mu, "rust"],
  [/(^|[|;&(])\s*(python[23]?|pip[23]?)\b/mu, "python"],
  [/(^|[|;&(])\s*go\b/mu, "go"],
  [/(^|[|;&(])\s*(ruby|gem|bundle)\b/mu, "ruby"],
  [/(^|[|;&(])\s*(java|javac)\b/mu, "java"],
  [/(^|[|;&(])\s*(elixir|mix)\b/mu, "elixir"],
  [/(^|[|;&(])\s*dotnet\b/mu, "dotnet"],
  [/(^|[|;&(])\s*php\b/mu, "php"],
  [/(^|[|;&(])\s*perl\b/mu, "perl"],
  [/(^|[|;&(])\s*lua\b/mu, "lua"],
  [/(^|[|;&(])\s*zig\b/mu, "zig"],
  [/(^|[|;&(])\s*Rscript\b/mu, "R"],
];

const recordSchema = z.record(z.string(), z.unknown());
const runSchema = z
  .object({ run: z.union([z.string(), z.array(z.string())]).optional() })
  .loose();

function taskBodies(
  source: string,
  split = false,
): Array<{ name: string; body: string }> {
  const config = recordSchema.safeParse(Bun.TOML.parse(source));
  if (!config.success) return [];
  const entries = recordSchema.safeParse(
    split ? config.data : (config.data["tasks"] ?? {}),
  );
  if (!entries.success) return [];
  return Object.entries(entries.data).flatMap(([name, value]) => {
    const task = runSchema.safeParse(
      typeof value === "string" ? { run: value } : value,
    );
    return task.success
      ? [task.data.run ?? []].flat().map((body) => ({ name, body }))
      : [];
  });
}

/**
 * A body reduced to text that could actually RUN a command.
 *
 * Comments go, and so do `echo`/`printf` arguments. Measured 2026-08-30: a body whose only
 * mention of `uv` was inside `echo "... (uv tool install cocoindex-code)"` was reported as
 * invoking uv. The FAIL was then written into that repo's config as deliberate debt —
 * **a false positive institutionalised as intentional non-compliance.**
 *
 * Only echo/printf are stripped, not every quoted span. `sh -c "uv ..."` really does invoke uv,
 * and blanket quote-stripping would hide it. This is the mention-vs-action cut, drawn where the
 * mention actually lives.
 */
function commandText(body: string): string {
  return body
    .split("\n")
    .map((l) => l.replace(/(^|\s)#.*$/u, "$1"))
    .join("\n")
    .replaceAll(/\b(?:echo|printf)\b[^\n;]*/gu, " ");
}

/**
 * Shell control flow at command position, after comments and quoted spans are removed.
 *
 * Stripping first is not optional: a body that MENTIONS `if` inside an echo string is not
 * branching, and reading a mention as an action is the failure this house has recorded three
 * times against itself.
 *
 * `&&` and `||` are deliberately NOT tells. `cmd_a && cmd_b` is a fail-fast sequence, not logic,
 * and flagging it would fire on almost every benign body.
 */
function controlFlow(body: string): string[] {
  const code = body
    .split("\n")
    .map((l) => l.replace(/(^|\s)#.*$/u, "$1"))
    .join("\n")
    .replaceAll(/'[^'\n]*'|"[^"\n]*"/gu, " ");
  const at = "(?:^|[\\n;|&(]|\\bthen\\b|\\bdo\\b)\\s*";
  const tells: Array<[RegExp, string]> = [
    [new RegExp(`${at}if\\b`, "mu"), "if"],
    [new RegExp(`${at}for\\b`, "mu"), "for"],
    [new RegExp(`${at}while\\b`, "mu"), "while"],
    [new RegExp(`${at}until\\b`, "mu"), "until"],
    [new RegExp(`${at}case\\b`, "mu"), "case"],
    [new RegExp(`${at}\\[\\[?\\s`, "mu"), "a [ test"],
    [new RegExp(`${at}test\\s`, "mu"), "a test command"],
  ];
  return tells.filter(([re]) => re.test(code)).map(([, label]) => label);
}

function declaredTools(source: string): Set<string> {
  const m = source.match(/\[tools\]([\s\S]*?)(?=\n\[|$)/u);
  const out = new Set<string>();
  if (m === null) return out;
  for (const line of (m[1] ?? "").split("\n")) {
    const k = line.match(/^\s*(?:"([^"]+)"|([A-Za-z0-9_.-]+))\s*=/u);
    if (k !== null) out.add((k[1] ?? k[2] ?? "").toLowerCase());
  }
  return out;
}

// --- C-C HOUSE-PINNED (added 2026-10-05; owner decision revised 2026-10-17) ---------------
// Bun must equal the dotfiles mise.toml house value, now an exact patch pin raised deliberately.
// A matching exact house pin is intentional and exempt from the patch-pin warning.
// Transition: the previous house value "1.4" warns until registered consumers migrate.
// A later ticket removes that exception; all other mismatches fail now.
// Other tools still warn on patch pins, since their owners choose the version.
const HOUSE_TOML = join(import.meta.dir, "..", "..", "..", "..", "mise.toml");
// preset sync replaces this declaration with the pin from its recorded source commit.
const embeddedHousePin: string | undefined = undefined;
async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}
function toolPins(source: string): Map<string, string> {
  const m = source.match(/\[tools\]([\s\S]*?)(?=\n\[|$)/u);
  const out = new Map<string, string>();
  for (const line of (m?.[1] ?? "").split("\n")) {
    const k = line.match(
      /^\s*(?:"([^"]+)"|([A-Za-z0-9_.-]+))\s*=\s*"([^"]*)"/u,
    );
    if (k !== null) out.set((k[1] ?? k[2] ?? "").toLowerCase(), k[3] ?? "");
  }
  return out;
}
async function checkPins(source: string): Promise<[number, number]> {
  let failures = 0;
  let warnings = 0;
  const house =
    embeddedHousePin ??
    ((await exists(HOUSE_TOML))
      ? toolPins(await readFile(HOUSE_TOML, "utf8")).get("bun")
      : undefined);
  if (house === undefined || house === "") {
    process.stdout.write("FAIL  pin: cannot determine the house bun pin\n");
    return [1, 0];
  }
  for (const [tool, pin] of toolPins(source)) {
    if (tool === "bun" && house !== undefined && pin !== house) {
      const migrating = house === "1.4.3" && pin === "1.4";
      process.stdout.write(
        `${migrating ? "WARN" : "FAIL"}  pin: bun = "${pin}" — the house pin is bun = "${house}"; edit mise.toml [tools] to bun = "${house}"${migrating ? " (previous house pin temporarily accepted during migration)" : " (raise the house pin deliberately)"}\n`,
      );
      warnings += migrating ? 1 : 0;
      failures += migrating ? 0 : 1;
    } else if (
      !(tool === "bun" && pin === house) &&
      /^\d+\.\d+\.\d+$/u.test(pin)
    ) {
      process.stdout.write(
        `WARN  pin: ${tool} = "${pin}" is a patch pin — it is never bumped and mise auto_install reinstalls it; pin the minor ("${pin.split(".").slice(0, 2).join(".")}")\n`,
      );
      warnings += 1;
    }
  }
  return [failures, warnings];
}

// Returns [failures, warnings] and prints its own lines, matching this script's style.
function checkBodies(
  source: string,
  bodies = taskBodies(source),
): [number, number] {
  let failures = 0;
  const warnings = 0;
  const tools = declaredTools(source);

  const needed = new Map<string, string[]>();
  for (const { name, body } of bodies) {
    const cmd = commandText(body);
    recordRuntimeUsers(cmd, name, needed);
    const lines = body.split("\n").filter((l) => l.trim() !== "").length;
    if (lines > BODY_MAX_LINES) {
      process.stdout.write(
        `FAIL  body: task '${name}' has ${lines} lines (max ${BODY_MAX_LINES}) — ` +
          `a TOML-embedded body cannot be imported or tested; move the logic to a ` +
          `script file and leave a one-line launcher\n`,
      );
      failures += 1;
    }
    // Length is the weaker half of C-B and always was: the rule reads "over 10 non-blank lines,
    // OR any branching/parsing logic". Only the count was ever enforced, so a 4-line body with a
    // shell test passed. Measured 2026-08-30: exactly such a body broke a sibling gate's parser.
    const flow = controlFlow(body);
    if (flow.length > 0 && lines <= BODY_MAX_LINES) {
      process.stdout.write(
        `FAIL  body: task '${name}' branches in TOML (${flow.join(", ")}) — ` +
          `length is not the rule, testability is; a body with control flow cannot be ` +
          `imported or tested. Move it to a script file and leave a one-line launcher\n`,
      );
      failures += 1;
    }
  }

  for (const [tool, users] of needed) {
    if (tools.has(tool)) {
      process.stdout.write(
        `OK    tools: ${tool} declared (used by ${users.length} task(s))\n`,
      );
    } else {
      process.stdout.write(
        `FAIL  tools: task(s) ${users.join(" ")} invoke '${tool}' but [tools] does not ` +
          `declare it — mise run then depends on whatever the machine happens to have\n`,
      );
      failures += 1;
    }
  }
  return [failures, warnings];
}

function recordRuntimeUsers(
  command: string,
  taskName: string,
  needed: Map<string, string[]>,
): void {
  for (const [pattern, tool] of RUNTIMES) {
    if (!pattern.test(command)) continue;
    const users = needed.get(tool);
    if (users === undefined) needed.set(tool, [taskName]);
    else users.push(taskName);
  }
}

function reportJjTokens(
  tokens: string[],
  resolved: Set<string>,
  activeWaivers: Set<string>,
): number {
  let failures = 0;
  for (const token of tokens) {
    if (resolved.has(token)) {
      process.stdout.write(`OK    ${token} (jj repo)\n`);
      continue;
    }
    if (activeWaivers.has(token)) {
      process.stdout.write(`WAIVE ${token} (mise.toml waiver)\n`);
      continue;
    }
    let explanation = "the alpha bookmark has no guarded push entrypoint";
    if (token === "commit") explanation = "every commit skips hook:pre-commit";
    else if (token === "pull")
      explanation = "a fetch never runs hook:post-merge";
    process.stdout.write(
      `FAIL  ${token} — unresolved in a jj repo: jj runs no git hooks, so without it ` +
        `${explanation} ` +
        `(template: templates/*.mise.toml [tasks.${token}])\n`,
    );
    failures += 1;
  }
  return failures;
}

// POSIX shell builtins and file/process plumbing supplied by the host OS. Runtimes,
// package managers, VCS and downloaders are never covered by this exemption.
const osCommands = new Set([
  "sh",
  "env",
  "cd",
  "exit",
  "echo",
  "printf",
  "true",
  "false",
  "mkdir",
  "rm",
  "cp",
  "test",
  ":",
]);
const exactVersion = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u;

type ShellWord = { text: string; dynamic: boolean };

function substitutionEnd(source: string, start: number): number {
  let depth = 1;
  let quote = "";
  let i = start;
  for (; i < source.length; i++) {
    const char = source[i];
    if (char === "\\" && quote !== "'") {
      i++;
      continue;
    }
    if (char === quote && quote !== "") quote = "";
    else if ((char === "'" || char === '"') && quote === "") quote = char;
    else if (quote === "" && char === "(") depth++;
    else if (quote === "" && char === ")" && --depth === 0) break;
  }
  return i;
}

// Keep quoted JavaScript/JSON as one word. Inspect substitutions recursively,
// including those in assignments and double quotes; never execute input.
function shellCommands(source: string): {
  commands: ShellWord[][];
  substitutions: string[];
} {
  const commands: ShellWord[][] = [];
  const substitutions: string[] = [];
  let words: ShellWord[] = [];
  let word = "";
  let dynamic = false;
  let started = false;
  let quote = "";
  const flushWord = () => {
    if (started) words.push({ text: word, dynamic });
    word = "";
    dynamic = false;
    started = false;
  };
  const flushCommand = () => {
    flushWord();
    if (words.length > 0) commands.push(words);
    words = [];
  };
  let i = 0;
  const advance = () => {
    const char = source[i] ?? "";
    if (char === "\\" && quote !== "'") {
      const next = source[++i] ?? "";
      if (next !== "\n") {
        word += next;
        started = true;
      }
    } else if (char === quote && quote !== "") {
      quote = "";
    } else if ((char === "'" || char === '"') && quote === "") {
      quote = char;
      started = true;
    } else if (quote === "'") {
      word += char;
    } else if (char === "$" && source[i + 1] === "(") {
      const start = i + 2;
      i = substitutionEnd(source, start);
      substitutions.push(source.slice(start, i));
      word += "DYNAMIC";
      dynamic = true;
      started = true;
    } else if (char === "`" && quote !== "'") {
      const start = ++i;
      while (i < source.length && source[i] !== "`") i++;
      substitutions.push(source.slice(start, i));
      word += "DYNAMIC";
      dynamic = true;
      started = true;
    } else if (quote !== "") {
      word += char;
      if (char === "$") dynamic = true;
    } else if (char === "#" && !started) {
      while (i < source.length && source[i] !== "\n") i++;
      flushCommand();
    } else if (/[;|&\n()]/u.test(char)) {
      flushCommand();
    } else if (/\s/u.test(char)) {
      flushWord();
    } else {
      word += char;
      started = true;
      if (char === "$") dynamic = true;
    }
  };
  for (; i < source.length; i++) advance();
  flushCommand();
  return { commands, substitutions };
}

function npmFindings(
  name: string,
  tail: ShellWord[],
  allowed: Set<string>,
): string[] {
  const runner = name === "bunx" ? -1 : tail.findIndex((w) => w.text === "x");
  if (name !== "bunx" && runner < 0) return [];
  const args = tail.slice(runner + 1);
  const findings: string[] = [];
  if (!args.some((w) => w.text === "--no-install"))
    findings.push("npm execution must use --no-install");
  const bin = args.find((w) => !w.text.startsWith("-"));
  if (bin !== undefined && !bin.dynamic && !allowed.has(bin.text))
    findings.push(`undeclared npm command ${bin.text}`);
  return findings;
}

export function commandFindings(
  command: string,
  allowed: Set<string>,
): string[] {
  const findings: string[] = [];
  // Tera exec() has its own quoted shell prefix. Inspect that prefix separately.
  for (const match of command.matchAll(/exec\(command=['"]([^'"]*)['"]/gu))
    findings.push(...commandFindings(match[1] ?? "", allowed));
  const shell = shellCommands(
    command.replaceAll(/\{\{[\s\S]*?\}\}/gu, "DYNAMIC"),
  );
  for (const substitution of shell.substitutions)
    findings.push(...commandFindings(substitution, allowed));
  const inspect = (words: ShellWord[]) => {
    let index = 0;
    while (/^[A-Za-z_]\w*=/u.test(words[index]?.text ?? "")) index++;
    const executable = words[index];
    if (executable === undefined || executable.dynamic) return;
    const name = executable.text;
    if (
      ["if", "then", "elif", "else", "do", "!", "exec", "command"].includes(
        name,
      )
    ) {
      inspect(words.slice(index + 1));
      return;
    }
    if (["fi", "done"].includes(name)) return;
    if (!allowed.has(name) && !osCommands.has(name))
      findings.push(`undeclared command ${name}`);
    const tail = words.slice(index + 1);
    if (name === "env") {
      inspect(tail.filter((w) => !w.text.startsWith("-")));
    } else if (name === "fnox" && tail[0]?.text === "exec") {
      const separator = tail.findIndex((w) => w.text === "--");
      if (separator >= 0) inspect(tail.slice(separator + 1));
    } else if (["sh", "bash"].includes(name)) {
      const option = tail.findIndex((w) => /^-[a-z]*c[a-z]*$/u.test(w.text));
      const body = tail[option + 1];
      if (option >= 0 && body !== undefined && !body.dynamic)
        findings.push(...commandFindings(body.text, allowed));
    } else if (name === "bunx" || name === "bun") {
      findings.push(...npmFindings(name, tail, allowed));
    }
  };
  for (const words of shell.commands) inspect(words);
  return findings;
}

// Binding resolution is deliberately outside coverage, as in reference checker's checker.
type SourceToken = {
  text: string;
  kind: "word" | "string" | "template" | "punct";
  dynamic: boolean;
  interpolations?: SourceToken[][];
};
class SourceLexer {
  i = 0;
  tokens: SourceToken[] = [];
  constructor(readonly source: string) {}
  skipComment(): boolean {
    const line = this.source.startsWith("//", this.i);
    if (!line && !this.source.startsWith("/*", this.i)) return false;
    const end = this.source.indexOf(line ? "\n" : "*/", this.i + 2);
    const extra = line ? 0 : 2;
    this.i = end < 0 ? this.source.length : end + extra;
    return true;
  }
  regex(): boolean {
    if (this.source[this.i] !== "/") return false;
    const previous = this.tokens.at(-1)?.text;
    if (
      previous !== undefined &&
      !["=", "(", ",", ":", "return", "[", "!", "&&", "||", "?", "=>"].includes(
        previous,
      )
    )
      return false;
    this.i++;
    let bracket = false;
    while (this.i < this.source.length) {
      const c = this.source[this.i++];
      if (c === "\\") {
        this.i++;
        continue;
      }
      if (c === "[") bracket = true;
      if (c === "]") bracket = false;
      if (c === "/" && !bracket) break;
    }
    while (/[a-z]/iu.test(this.source[this.i] ?? "")) this.i++;
    this.tokens.push({ text: "REGEX", kind: "word", dynamic: true });
    return true;
  }
  interpolation(): SourceToken[] {
    // Keep expression tokens separate: they must not become the surrounding call's argv
    // or displace a shell template's tag. advance() also handles nested templates/regexes.
    const outer = this.tokens;
    this.tokens = [];
    let depth = 1;
    while (this.i < this.source.length) {
      const c = this.source[this.i] ?? "";
      if (c === "{") depth++;
      if (c === "}") depth--;
      if (depth === 0) {
        this.i++;
        break;
      }
      this.advance();
    }
    const tokens = this.tokens;
    this.tokens = outer;
    return tokens;
  }
  quoted(): SourceToken {
    const quote = this.source[this.i++];
    let text = "";
    let dynamic = false;
    const interpolations: SourceToken[][] = [];
    while (this.i < this.source.length && this.source[this.i] !== quote) {
      const part = this.quotedPart(quote);
      text += part.text;
      dynamic ||= part.dynamic;
      if (part.interpolation !== undefined)
        interpolations.push(part.interpolation);
    }
    this.i++;
    return {
      text,
      kind: quote === "`" ? "template" : "string",
      dynamic,
      interpolations,
    };
  }
  quotedPart(quote: string | undefined): {
    text: string;
    dynamic: boolean;
    interpolation?: SourceToken[];
  } {
    if (this.source[this.i] === "\\") {
      const escaped = this.source[++this.i] ?? "";
      this.i++;
      return {
        text: { n: "\n", r: "\r", t: "\t" }[escaped] ?? escaped,
        dynamic: false,
      };
    }
    if (quote === "`" && this.source.startsWith("${", this.i)) {
      this.i += 2;
      return {
        text: "$DYNAMIC",
        dynamic: true,
        interpolation: this.interpolation(),
      };
    }
    return { text: this.source[this.i++] ?? "", dynamic: false };
  }
  advance(): void {
    const c = this.source[this.i] ?? "";
    if (/\s/u.test(c)) {
      this.i++;
      return;
    }
    if (this.skipComment() || this.regex()) return;
    if (["'", '"', "`"].includes(c)) {
      this.tokens.push(this.quoted());
      return;
    }
    const word = this.source.slice(this.i).match(/^[\w$]+/u)?.[0];
    this.tokens.push({
      text: word ?? c,
      kind: word === undefined ? "punct" : "word",
      dynamic: false,
    });
    this.i += word?.length ?? 1;
  }
  run(): SourceToken[] {
    while (this.i < this.source.length) this.advance();
    return this.tokens;
  }
}
function closingToken(tokens: SourceToken[], start: number): number {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const stack: string[] = [];
  for (let i = start; i < tokens.length; i++) {
    const token = tokens[i];
    if (token?.kind !== "punct") continue;
    const end = pairs[token.text];
    if (end !== undefined) stack.push(end);
    else if (token.text === stack.at(-1)) stack.pop();
    if (stack.length === 0) return i;
  }
  return tokens.length;
}
function literalToken(token: SourceToken | undefined): string | undefined {
  return token !== undefined &&
    ["string", "template"].includes(token.kind) &&
    !token.dynamic
    ? token.text
    : undefined;
}
function argvCommand(tokens: SourceToken[]): string {
  return tokens
    .map((token) => {
      const literal = literalToken(token);
      return literal === undefined
        ? "$DYNAMIC"
        : `'${literal.replaceAll("'", "'\\''")}'`;
    })
    .join(" ");
}
function shellTemplate(tokens: SourceToken[], index: number): boolean {
  const previous = tokens[index - 1];
  if (previous?.text === "$") return true;
  if (previous?.text !== ")") return false;
  const open = tokens.findIndex(
    (t, i) => t.text === "(" && closingToken(tokens, i) === index - 1,
  );
  if (open < 0) return false;
  if (tokens[open - 1]?.text === "$") return true;
  return tokens[open - 2]?.text === "." && shellTemplate(tokens, open - 2);
}
function arrayArguments(tokens: SourceToken[], start: number): SourceToken[] {
  const close = closingToken(tokens, start);
  const result: SourceToken[] = [];
  let pos = start + 1;
  while (pos < close) {
    const arg = tokens[pos];
    if (arg !== undefined) result.push(arg);
    pos = nextArgument(tokens, pos, close);
  }
  return result;
}
function nextArgument(
  tokens: SourceToken[],
  start: number,
  end: number,
): number {
  let i = start;
  while (i < end && tokens[i]?.text !== ",") {
    if (["[", "{", "("].includes(tokens[i]?.text ?? ""))
      i = closingToken(tokens, i);
    i++;
  }
  return i + 1;
}
function callFindings(
  tokens: SourceToken[],
  index: number,
  allowed: Set<string>,
): string[] {
  const token = tokens[index];
  if (
    token === undefined ||
    ![
      "spawn",
      "spawnSync",
      "which",
      "exec",
      "execSync",
      "execFile",
      "execFileSync",
    ].includes(token.text)
  )
    return [];
  const open =
    index +
    (token.kind === "string" && tokens[index + 1]?.text === "]" ? 2 : 1);
  if (tokens[open]?.text !== "(") return [];
  if (
    ["exec", "execSync", "execFile", "execFileSync"].includes(token.text) &&
    tokens[index - 1]?.text === "." &&
    !["cp", "child_process", "childProcess"].includes(
      tokens[index - 2]?.text ?? "",
    )
  )
    return [];
  let first = open + 1;
  if (tokens[first]?.text === "{") {
    const cmd = tokens
      .slice(first, closingToken(tokens, open))
      .findIndex((t, n, arr) => t.text === "cmd" && arr[n + 1]?.text === ":");
    if (cmd < 0) return [];
    first += cmd + 2;
  }
  if (tokens[first]?.text === "[") {
    const args = arrayArguments(tokens, first);
    return literalToken(args[0]) === undefined
      ? []
      : commandFindings(argvCommand(args), allowed);
  }
  const command = literalToken(tokens[first]);
  if (command === undefined) return [];
  if (["exec", "execSync"].includes(token.text))
    return commandFindings(command, allowed);
  const findings =
    allowed.has(command) || osCommands.has(command)
      ? []
      : [`undeclared command ${command}`];
  const literal = tokens[first];
  if (
    literal !== undefined &&
    tokens[first + 1]?.text === "," &&
    tokens[first + 2]?.text === "[" &&
    ["sh", "bash", "env", "fnox", "bun", "bunx"].includes(command)
  )
    findings.push(
      ...commandFindings(
        argvCommand([literal, ...arrayArguments(tokens, first + 2)]),
        allowed,
      ),
    );
  return findings;
}
export const coverage =
  "mise-contract: literal command names only; aliases, function arguments and imported/dynamic command expressions are outside coverage. JS/TS, including template interpolations, is inspected lexically; binding resolution is not covered.";
function tokenFindings(tokens: SourceToken[], allowed: Set<string>): string[] {
  return tokens.flatMap((token, index) => [
    ...(token.kind === "template" && shellTemplate(tokens, index)
      ? commandFindings(token.text, allowed)
      : callFindings(tokens, index, allowed)),
    ...(token.interpolations ?? []).flatMap((expression) =>
      tokenFindings(expression, allowed),
    ),
  ]);
}
export function sourceFindings(
  source: string,
  allowed: Set<string>,
  _filename = "source.ts",
): string[] {
  return tokenFindings(new SourceLexer(source).run(), allowed);
}

const toolConfigSchema = z.object({
  tools: z
    .record(
      z.string(),
      z.union([z.string(), z.object({ version: z.string() }).loose()]),
    )
    .default({}),
  task_config: z
    .object({ includes: z.array(z.string()).default([]) })
    .default({ includes: [] }),
  tasks: z.record(z.string(), z.unknown()).default({}),
  settings: z
    .object({ activate_aggressive: z.boolean().optional() })
    .optional(),
  min_version: z.string().optional(),
});
export type ToolPolicy = {
  taskDirectory?: string;
  requirePinned?: boolean;
  requireNpmLock?: boolean;
  requireAggressive?: boolean;
  requireMinVersion?: boolean;
};

async function matchingFiles(root: string, pattern: string): Promise<string[]> {
  const glob = new Bun.Glob(pattern);
  const files: string[] = [];
  for await (const file of glob.scan({
    cwd: root,
    absolute: true,
    onlyFiles: true,
    followSymlinks: false,
  })) {
    const rel = relative(root, file);
    if (
      !rel
        .split("/")
        .some((part) =>
          ["node_modules", ".git", ".jj", ".state"].includes(part),
        )
    )
      files.push(file);
  }
  return files.toSorted();
}
async function includedFiles(root: string, include: string): Promise<string[]> {
  const exact = resolve(root, include);
  if (include.endsWith(".toml") && (await exists(exact))) return [exact];
  return matchingFiles(
    root,
    include.includes("*") ? include : `${include}/**/*.toml`,
  );
}
async function taskSources(
  root: string,
  includes: string[],
): Promise<string[]> {
  const files = new Set(await matchingFiles(root, "mise/tasks/**/*.toml"));
  for (const include of includes) {
    for (const file of await includedFiles(root, include)) files.add(file);
  }
  return [...files].toSorted();
}

const packageSchema = z.object({
  scripts: z.record(z.string(), z.string()).default({}),
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
});
const lockSchema = z.object({
  workspaces: z.record(
    z.string(),
    z.object({
      dependencies: z.record(z.string(), z.string()).optional(),
      devDependencies: z.record(z.string(), z.string()).optional(),
    }),
  ),
  packages: z.record(z.string(), z.array(z.unknown())),
});
const metadataSchema = z.object({
  bin: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
});

function npmAuthority(
  name: string,
  version: string,
  lock: ReturnType<typeof lockSchema.safeParse> | undefined,
  policy: ToolPolicy,
  allowed: Set<string>,
): string[] {
  const entry = lock?.success === true ? lock.data.packages[name] : undefined;
  const workspace =
    lock?.success === true ? lock.data.workspaces[""] : undefined;
  const locked =
    exactVersion.test(version) &&
    (workspace?.devDependencies?.[name] ?? workspace?.dependencies?.[name]) ===
      version &&
    entry?.[0] === `${name}@${version}`;
  if (!locked)
    return policy.requireNpmLock === true
      ? [`missing exact locked npm dependency ${name}`]
      : [];
  const metadata = metadataSchema.safeParse(entry?.[2]);
  if (!metadata.success || metadata.data.bin === undefined) return [];
  const bins =
    typeof metadata.data.bin === "string"
      ? [basename(name)]
      : Object.keys(metadata.data.bin);
  return bins.flatMap((bin) => {
    const findings = allowed.has(bin)
      ? [`duplicate tool authority ${bin}`]
      : [];
    allowed.add(bin);
    return findings;
  });
}
function npmAuthorities(
  dependencies: Record<string, string>,
  lock: ReturnType<typeof lockSchema.safeParse> | undefined,
  policy: ToolPolicy,
  allowed: Set<string>,
): string[] {
  return Object.entries(dependencies).flatMap(([name, version]) =>
    npmAuthority(name, version, lock, policy, allowed),
  );
}

export async function checkTools(
  root: string,
  policy: ToolPolicy = {},
): Promise<string[]> {
  const parsed = toolConfigSchema.safeParse(
    Bun.TOML.parse(await Bun.file(join(root, "mise.toml")).text()),
  );
  if (!parsed.success) return ["invalid mise tool configuration"];
  const config = parsed.data;
  if (
    (policy.requireAggressive === true &&
      config.settings?.activate_aggressive !== true) ||
    (policy.requireMinVersion === true &&
      !/^\d{4}\.\d+\.\d+$/u.test(config.min_version ?? ""))
  )
    return ["invalid mise tool configuration"];
  const problems: string[] = [];
  if (policy.taskDirectory !== undefined) {
    if (Object.keys(config["tasks"]).length > 0)
      problems.push(`task bodies must live in ${policy.taskDirectory}`);
    if (
      JSON.stringify(config.task_config.includes) !==
      JSON.stringify([policy.taskDirectory])
    )
      problems.push(`task includes must be exactly ${policy.taskDirectory}`);
  }
  const allowed = new Set(["mise"]);
  for (const [name, tool] of Object.entries(config.tools)) {
    const version = typeof tool === "string" ? tool : tool.version;
    if (policy.requirePinned === true && !/^\d+\.\d+(?:\.\d+)?$/u.test(version))
      problems.push(`unpinned tool ${name}`);
    if (policy.requireNpmLock === true && name.startsWith("npm:"))
      problems.push(`npm tool must use package.json and lockfile: ${name}`);
    allowed.add(basename(name));
    if (name === "rust") {
      allowed.add("cargo");
      allowed.add("rustc");
    }
    if (name === "python") allowed.add("python3");
    if (name === "uv") allowed.add("uvx");
  }
  if (allowed.has("bun")) allowed.add("bunx");
  const pkgPath = join(root, "package.json");
  if (await exists(pkgPath)) {
    const parsedPackage = jsonOf(packageSchema).safeParse(
      await Bun.file(pkgPath).text(),
    );
    if (!parsedPackage.success) return [...problems, "invalid package.json"];
    const pkg = parsedPackage.data;
    const lockPath = join(root, "bun.lock");
    // Bun's text lock is JSONC (comments/trailing commas); TOML is not its grammar.
    const lock = (await exists(lockPath))
      ? lockSchema.safeParse(Bun.JSON5.parse(await Bun.file(lockPath).text()))
      : undefined;
    problems.push(
      ...npmAuthorities(
        { ...pkg.dependencies, ...pkg.devDependencies },
        lock,
        policy,
        allowed,
      ),
    );
    for (const command of Object.values(pkg.scripts))
      problems.push(
        ...commandFindings(command, allowed).map((p) => `package.json: ${p}`),
      );
  } else if (policy.requireNpmLock === true)
    problems.push("invalid package.json");
  const rootSource = await Bun.file(join(root, "mise.toml")).text();
  for (const { name, body } of taskBodies(rootSource))
    problems.push(
      ...commandFindings(body, allowed).map((p) => `mise.toml:${name}: ${p}`),
    );
  for (const file of await taskSources(root, config.task_config.includes)) {
    const source = await Bun.file(file).text();
    for (const { name, body } of taskBodies(source, true))
      problems.push(
        ...commandFindings(body, allowed).map(
          (p) => `${relative(root, file)}:${name}: ${p}`,
        ),
      );
    for (const match of source.matchAll(/exec\(command=['"]([^'"]*)['"]/gu))
      problems.push(
        ...commandFindings(match[1] ?? "", allowed).map(
          (p) => `${relative(root, file)}: ${p}`,
        ),
      );
  }
  for (const file of await matchingFiles(
    root,
    "**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
  ))
    problems.push(
      ...sourceFindings(await Bun.file(file).text(), allowed, file).map(
        (p) => `${relative(root, file)}: ${p}`,
      ),
    );
  return problems;
}

async function reportAuthority(
  root: string,
  policy: ToolPolicy,
): Promise<number> {
  const problems = await checkTools(root, policy);
  for (const problem of problems)
    process.stdout.write(`FAIL  authority: ${problem}\n`);
  return problems.length;
}
async function check(
  rootInput: string,
  policy?: ToolPolicy,
): Promise<{ failures: number; environmentFailure: boolean }> {
  // Real path: mise reports each task's source by its real path, so a root reached through a
  // symlink (macOS /var -> /private/var, a linked checkout) otherwise matches none of its own
  // tasks and reads as "contract not adopted".
  // Messages keep the path the caller gave; only the source match uses the real path.
  const root = resolve(rootInput);
  if (!(await exists(root))) {
    process.stdout.write(`ENV cannot cd to ${rootInput}\n`);
    return { failures: 0, environmentFailure: true };
  }
  const realRoot = await realpath(root);
  const listed = await miseTasks(root);
  if (listed.error !== undefined) {
    process.stdout.write(
      `ENV mise tasks ls failed in ${root}: ${listed.error}\n`,
    );
    if (listed.error.includes("not trusted"))
      process.stdout.write(
        `ENV   hint: run \`mise trust ${root}/mise.toml\` ([env] blocks need trust before mise lists tasks)\n`,
      );
    return { failures: 0, environmentFailure: true };
  }
  const local = listed["tasks"].filter(
    (task) =>
      task.source.startsWith(`${realRoot}/`) ||
      task.source.startsWith(`${root}/`),
  );
  if (local.length === 0) {
    process.stdout.write(
      `FAIL  ${root}: no local mise tasks (contract not adopted)\n`,
    );
    return { failures: 1, environmentFailure: false };
  }
  const resolved = new Set(
    local.flatMap((task) => [task.name, ...task.aliases]),
  );
  const tomlPath = `${root}/mise.toml`;
  const waiver = (await exists(tomlPath))
    ? waivers(topLevelToml(await readFile(tomlPath, "utf8")))
    : { active: new Set<string>(), reasonless: [] };
  let failures = 0;
  let warnings = 0;
  for (const token of waiver.reasonless) {
    process.stdout.write(
      `WARN  waiver for '${token}' has no ' -- <reason>' — inert (reason is required)\n`,
    );
    warnings += 1;
  }
  for (const token of waiver.active) {
    if (![...hard, ...soft, ...jj].includes(token)) {
      process.stdout.write(
        `WARN  waiver names unknown token '${token}' — inert (not in the contract)\n`,
      );
      warnings += 1;
    }
  }
  for (const token of hard) {
    if (resolved.has(token)) process.stdout.write(`OK    ${token}\n`);
    else if (waiver.active.has(token))
      process.stdout.write(`WAIVE ${token} (mise.toml waiver)\n`);
    else {
      process.stdout.write(
        `FAIL  ${token} — unresolved: mise run ${token} would die with 'no task ${token} found'\n`,
      );
      failures += 1;
    }
  }
  for (const token of soft) {
    if (resolved.has(token)) process.stdout.write(`OK    ${token}\n`);
    else if (waiver.active.has(token)) process.stdout.write(`WAIVE ${token}\n`);
    else {
      process.stdout.write(`WARN  ${token} — unresolved (soft token)\n`);
      warnings += 1;
    }
  }
  if (await exists(`${root}/.jj`))
    failures += reportJjTokens(jj, resolved, waiver.active);
  if (await exists(tomlPath)) {
    const source = await readFile(tomlPath, "utf8");
    const parsedConfig = toolConfigSchema.safeParse(Bun.TOML.parse(source));
    if (!parsedConfig.success) return { failures: 0, environmentFailure: true };
    const config = parsedConfig.data;
    const bodies = taskBodies(source);
    for (const file of await taskSources(root, config.task_config.includes)) {
      bodies.push(
        ...taskBodies(await Bun.file(file).text(), true).map(
          ({ name, body }) => ({
            name: relative(root, file) + ":" + name,
            body,
          }),
        ),
      );
    }
    const [bodyFailures, bodyWarnings] = checkBodies(source, bodies);
    if (policy !== undefined) failures += await reportAuthority(root, policy);
    failures += bodyFailures;
    warnings += bodyWarnings;
    const [pinFailures, pinWarnings] = await checkPins(source);
    failures += pinFailures;
    warnings += pinWarnings;
  }

  // `hook:<event>` names mirror git's own hook file names 1:1 (.githooks/pre-commit ->
  // hook:pre-commit), so the hyphen is git's, not a separator. Exempt ONLY git's documented hook
  // names (githooks(5)); `hook:my-thing` still warns. Shape of these tasks: wiring-repositories HOOK-1.
  const GIT_HOOKS = new Set([
    "applypatch-msg",
    "pre-applypatch",
    "post-applypatch",
    "pre-commit",
    "pre-merge-commit",
    "prepare-commit-msg",
    "commit-msg",
    "post-commit",
    "pre-rebase",
    "post-checkout",
    "post-merge",
    "pre-push",
    "pre-receive",
    "update",
    "proc-receive",
    "post-receive",
    "post-update",
    "reference-transaction",
    "push-to-checkout",
    "pre-auto-gc",
    "post-rewrite",
    "sendemail-validate",
    "fsmonitor-watchman",
    "post-index-change",
  ]);
  const hyphens = local
    .map((task) => task.name)
    .filter((name) => name.includes("-"))
    .filter(
      (name) => !(name.startsWith("hook:") && GIT_HOOKS.has(name.slice(5))),
    );
  if (hyphens.length > 0) {
    process.stdout.write(
      `WARN  grammar: hyphen in task name (colon-only rule): ${hyphens.join(" ")}\n`,
    );
    warnings += 1;
  }
  const checkTask = local.find((task) => task.name === "check");
  if (checkTask?.depends.length === 0) {
    process.stdout.write(
      "WARN  grammar: check has empty depends (check = all-gates aggregate)\n",
    );
    warnings += 1;
  }
  const badDependencies = new Set<string>();
  for (const dependency of local.flatMap((task) => task.depends)) {
    const name = dependencyName(dependency);
    if (name !== undefined && !name.includes("*") && !resolved.has(name))
      badDependencies.add(name);
  }
  if (badDependencies.size > 0) {
    process.stdout.write(
      `WARN  grammar: depends reference unresolved task(s): ${[...badDependencies].join(" ")}\n`,
    );
    warnings += 1;
  }
  process.stdout.write(
    `—     mise-contract: ${failures} hard, ${warnings} warn (${root})\n`,
  );
  return { failures, environmentFailure: false };
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "mise-contract.ts",
      parameters: ["[roots...]"],
      flags: {
        tools: {
          type: Boolean,
          description:
            "Audit literal command authority in tasks, package scripts and JS/TS",
        },
        taskDirectory: {
          type: String,
          description:
            "Require split tasks and includes only in this directory (enables tool audit)",
        },
        requirePinned: { type: Boolean },
        requireNpmLock: { type: Boolean },
        requireAggressive: { type: Boolean },
        requireMinVersion: { type: Boolean },
      },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (Bun.which("mise") === null) {
    process.stdout.write("ENV mise not installed\n");
    process.exit(2);
  }
  let failures = 0;
  let environmentFailure = false;
  for (const root of parsed._.length === 0 ? ["."] : parsed._) {
    const enabled =
      parsed.flags.taskDirectory !== undefined ||
      [
        parsed.flags.tools,
        parsed.flags.requirePinned,
        parsed.flags.requireNpmLock,
        parsed.flags.requireAggressive,
        parsed.flags.requireMinVersion,
      ].some((flag) => flag === true);
    const policy: ToolPolicy = {
      ...(parsed.flags.taskDirectory === undefined
        ? {}
        : { taskDirectory: parsed.flags.taskDirectory }),
      requirePinned: parsed.flags.requirePinned ?? false,
      requireNpmLock: parsed.flags.requireNpmLock ?? false,
      requireAggressive: parsed.flags.requireAggressive ?? false,
      requireMinVersion: parsed.flags.requireMinVersion ?? false,
    };
    const result = await check(root, enabled ? policy : undefined);
    failures += result.failures;
    environmentFailure ||= result.environmentFailure;
  }
  let code: number;
  if (environmentFailure) code = 2;
  else if (failures === 0) code = 0;
  else code = 1;
  process.exit(code);
}

if (import.meta.main)
  await main().catch((error) => {
    process.stderr.write(
      `ENV ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(2);
  });
