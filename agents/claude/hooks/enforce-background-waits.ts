// PreToolUse gate (matcher: Bash), Claude only — a long or waiting Bash call runs in the BACKGROUND.
//
// Owner, 2026-10-06: 「ctrl+b で明示的に bg にやってるけど、本来常に そうあるべき」. A foreground Bash
// call holds the whole session: the human cannot talk to the coordinator until it returns, and
// had to press ctrl+b by hand, again and again, on waits the coordinator itself had started.
// Claude Code has no setting that makes a call background by its length; this gate refuses the
// foreground form:
//
//   deny when run_in_background is not true AND
//     - this command, or any step of it (`a && b`), has MEASURED over FOREGROUND_MEASURED_MAX_MS here
//       (bash-durations.ts; record-bash-duration.ts keeps the history) — the rule that matters:
//       owner 2026-10-06 「in background が規定にならないのだけど」 after `mise run commit` (no
//       timeout, no loop, minutes long) passed the two text rules below, or
//     - timeout > FOREGROUND_MAX_MS (asking for more than the default bound announces a long call), or
//     - the command is a wait loop: `until`/`while` … `sleep`.
// A dispatched `claude -p` worker has no human session to hold and cannot receive a background
// completion notice. `run-claude.ts` marks that child with AGENT_ROUTER_WORKER=1; in that
// session all three background rules are lifted. The worker's own run-claude timeout still bounds it.
//
// An allowed foreground call has its start recorded, so its duration is measured too. A command
// never measured passes once; from then on its own history decides. run_in_background is a Claude
// Code tool field (Codex has no such mode), so this is a Claude hook (agents/claude/settings.json).
//
// THE OTHER DIRECTION (2026-10-08, firedancer coordinator): `agent-dispatch resume … &` run inside a
// call that already had run_in_background:true. The harness observes the OUTER shell; the inner `&`
// job outlives it unobserved, so its result never reached the session and nothing caught it. So when
// run_in_background is true, a shell-level `&` whose job is never `wait`ed in the same script is
// denied (unwaitedJobs below). setsid/nohup/disown are NOT this rule's: enforce-supervised-execution
// already denies them. A nested shell string (`bash -c 'x &'`) is judged like the top level, the way
// that hook judges a detacher in one; a string handed to another program (`ssh host 'x &'`) is data.
// FAIL CLOSED (run.sh --fail-closed).

import { at, num, strAt } from "../../hooks/narrow.ts";
import { effective, parseShell } from "../../hooks/shell-syntax.ts";
import { existsSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  AGENT_ROUTER_WORKER_ENV,
  AGENT_ROUTER_WORKER_VALUE,
} from "../../../tools/shared/src/worker-env.ts";
import {
  commandKey,
  judgedMs,
  recordStart,
  stateDir,
  stepKeys,
} from "./bash-durations.ts";
import { decidePre, readStdinJson } from "./lib.ts";

export const FOREGROUND_MAX_MS = 120_000;
// How long the human may be kept waiting on a call the coordinator started in front. 5 s, the
// owner's bound (2026-10-06: 「5sで終わらなかったら bg送りにしたい」 after a 20 s `bun test` showed
// "ctrl+b to run in background"); a quick read, sed or ssh probe stays under it.
export const FOREGROUND_MEASURED_MAX_MS = 5000;
const SMALL_VIEWER_MAX_BYTES = 1024 * 1024;
const WAIT_LOOP = /\b(?:until|while)\b[\s\S]*?\bsleep\b/u;

/** Why this Bash call must go to the background, or undefined when it may stay in front.
 *  `measured` is the median duration of this command's kind here, when known. */
export function backgroundReason(
  input: unknown,
  measured?: { key: string; ms: number },
  isWorker = false,
): string | undefined {
  if (isWorker) return undefined;
  if (at(input, "run_in_background") === true) return undefined;
  if (measured !== undefined && measured.ms > FOREGROUND_MEASURED_MAX_MS)
    return `\`${measured.key}\` has taken ${Math.round(measured.ms / 1000)} s here (the larger of its median and its latest run) (the foreground maximum is ${FOREGROUND_MEASURED_MAX_MS / 1000} s)`;
  const timeout = num(at(input, "timeout"));
  if (timeout !== undefined && timeout > FOREGROUND_MAX_MS)
    return `it asks for a ${Math.round(timeout / 1000)} s timeout (the foreground maximum is ${FOREGROUND_MAX_MS / 1000} s)`;
  if (WAIT_LOOP.test(strAt(input, "command") ?? ""))
    return "it is a wait loop (until/while … sleep)";
  return undefined;
}

/** A small, read-only file view should not inherit a slow run from the command history. */
export function isSmallFileViewer(command: string): boolean {
  const parsed = parseShell(command);
  if (parsed === undefined || parsed.commands.length !== 1) return false;
  const c = parsed.commands[0];
  if (c === undefined || c.nested || c.dynamic || c.redirects.length > 0)
    return false;
  const eff = effective(c);
  if (eff === undefined) return false;
  const operands = viewerOperands(eff.name, eff.args);
  if (operands.length === 0) return false;
  return operands.every((operand) => {
    const path = isAbsolute(operand) ? operand : resolve(c.cwd, operand);
    if (!existsSync(path)) return false;
    const st = statSync(path);
    return st.isFile() && st.size < SMALL_VIEWER_MAX_BYTES;
  });
}

function viewerOperands(name: string, args: string[]): string[] {
  if (name === "cat")
    return args.some((a) => a.startsWith("-") && a !== "--")
      ? []
      : args.filter((a) => a !== "--");
  if (
    name === "tail" &&
    args.some(
      (a) => a === "-f" || a === "--follow" || a.startsWith("--follow="),
    )
  )
    return [];
  if (name === "head" || name === "tail" || name === "wc")
    return optionOperands(args);
  if (name === "jq") {
    const filter = args.findIndex((arg) => !arg.startsWith("-"));
    return filter < 0
      ? []
      : args.slice(filter + 1).filter((arg) => arg !== "-");
  }
  if (name === "sed" && args.includes("-n")) {
    const script = args.findIndex((a) => a !== "-n" && !a.startsWith("-"));
    return script < 0 ? [] : args.slice(script + 1).filter((a) => a !== "-");
  }
  return [];
}

function optionOperands(args: string[]): string[] {
  const skipNext = new Set(["-n", "-c", "--lines", "--bytes", "--files0-from"]);
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--") return [...files, ...args.slice(i + 1)];
    if (skipNext.has(arg)) {
      i++;
      continue;
    }
    if (!arg.startsWith("-") && arg !== "-") files.push(arg);
  }
  return files;
}

// --- shell-level `&` inside an already-backgrounded call ---------------------------------------
//
// shell-syntax.ts cannot express this: it records the operator that ENDED the previous command
// (`sep`), and the empty command after a trailing `&` — `a &`, or `a &⏎wait` — is dropped, so the
// job is invisible to it. This is a small local scanner for the one question "which `&` jobs are
// never waited?". It reads quotes, escapes, comments, heredoc bodies, `${…}`, `$((…))` and backticks
// as data; `&&` `&>` `>&` `<&` `|&` are not jobs. A `wait` at command position clears the jobs of
// its own scope (a `( … )` subshell is a scope of its own; a `{ … }` group is not). It never throws.

const LEADING_WORDS = new Set([
  "if",
  "then",
  "else",
  "elif",
  "do",
  "while",
  "until",
  "!",
  "{",
]);
const SHELL_NAMES = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const OPERATOR_CHARS = new Set([";", "&", "|", "(", ")", "<", ">"]);

/** Index just after the `)` that closes the `(` at `open`; the end of `s` when it never closes. */
function afterParen(s: string, open: number): number {
  let depth = 0;
  for (let k = open; k < s.length; k++) {
    const ch = s.charAt(k);
    if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return k + 1;
  }
  return s.length;
}

/** Index just after the `}` that closes the `{` at `open`; the end of `s` when it never closes. */
function afterBrace(s: string, open: number): number {
  let depth = 0;
  for (let k = open; k < s.length; k++) {
    const ch = s.charAt(k);
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return k + 1;
  }
  return s.length;
}

/** Index just after the `quote` that closes the one opened before `from`; backslash escapes unless single. */
function afterQuote(s: string, from: number, quote: string): number {
  for (let k = from; k < s.length; k++) {
    const ch = s.charAt(k);
    if (ch === "\\" && quote !== "'") k++;
    else if (ch === quote) return k + 1;
  }
  return s.length;
}

class JobScanner {
  private i = 0;
  private word = "";
  private cmdStart = true;
  /** Unwaited-job count of each open scope; index 0 is the script itself. */
  private readonly scopes: number[] = [0];
  private unwaited = 0;
  private heredocs: { delim: string; strip: boolean }[] = [];

  constructor(private readonly s: string) {}

  /** How many `&` jobs of the script are never waited in their scope. */
  run(): number {
    while (this.i < this.s.length) this.step();
    this.endWord();
    return this.unwaited + this.scopes.reduce((a, b) => a + b, 0);
  }

  private get top(): number {
    return this.scopes.length - 1;
  }

  /** The text from the cursor to `to` is data: it joins the current word as an opaque piece. */
  private opaque(to: number): void {
    this.i = to;
    this.word += "\0";
  }

  private endWord(): void {
    if (this.word === "") return;
    if (this.cmdStart && this.word === "wait") this.scopes[this.top] = 0;
    this.cmdStart = this.cmdStart && LEADING_WORDS.has(this.word);
    this.word = "";
  }

  private step(): void {
    const c = this.s.charAt(this.i);
    if (c === " " || c === "\t") {
      this.endWord();
      this.i++;
    } else if (c === "\n") this.newline();
    else if (c === "#" && this.word === "") this.skipComment();
    else if (c === "\\") this.opaque(this.i + 2);
    else if (c === "'" || c === '"' || c === "`")
      this.opaque(afterQuote(this.s, this.i + 1, c));
    else if (c === "$") this.dollar();
    else if (OPERATOR_CHARS.has(c)) this.operator(c);
    else {
      this.word += c;
      this.i++;
    }
  }

  private skipComment(): void {
    const nl = this.s.indexOf("\n", this.i);
    this.i = nl === -1 ? this.s.length : nl;
  }

  private newline(): void {
    this.endWord();
    this.i++;
    this.cmdStart = true;
    const queue = this.heredocs;
    this.heredocs = [];
    for (const h of queue) this.skipHeredoc(h);
  }

  /** A heredoc body is data: skip lines up to the one that is the delimiter. */
  private skipHeredoc(h: { delim: string; strip: boolean }): void {
    while (this.i < this.s.length) {
      let nl = this.s.indexOf("\n", this.i);
      if (nl === -1) nl = this.s.length;
      const raw = this.s.slice(this.i, nl);
      this.i = Math.min(nl + 1, this.s.length);
      if ((h.strip ? raw.replace(/^\t+/u, "") : raw) === h.delim) return;
    }
  }

  private dollar(): void {
    const next = this.s.charAt(this.i + 1);
    if (next === "(" && this.s.charAt(this.i + 2) === "(")
      this.opaque(afterParen(this.s, this.i + 1)); // $(( arithmetic ))
    else if (next === "{") this.opaque(afterBrace(this.s, this.i + 1));
    else if (next === "(") this.openScope(2);
    else {
      this.word += "$";
      this.i++;
    }
  }

  private openScope(width: number): void {
    this.endWord();
    this.scopes.push(0);
    this.i += width;
    this.cmdStart = true;
  }

  private closeScope(): void {
    this.endWord();
    if (this.scopes.length > 1) this.unwaited += this.scopes.pop() ?? 0;
    this.cmdStart = false;
    this.i++;
  }

  private operator(c: string): void {
    const next = this.s.charAt(this.i + 1);
    if (c === "(" && next === "(") {
      // (( arithmetic )) at command position; `& ` in it is bitwise-and
      this.endWord();
      this.opaque(afterParen(this.s, this.i));
      return;
    }
    if (c === "(") this.openScope(1);
    else if (c === ")") this.closeScope();
    else if (c === ";") this.separate(1);
    else if (c === "|") this.separate(next === "|" || next === "&" ? 2 : 1);
    else if (c === "&") this.ampersand(next);
    else this.redirect(c, next);
  }

  /** `;` `|` `||` `|&`: the next word starts a command. */
  private separate(width: number): void {
    this.endWord();
    this.i += width;
    this.cmdStart = true;
  }

  private ampersand(next: string): void {
    this.endWord();
    if (next === "&") {
      this.i += 2; // &&
      this.cmdStart = true;
    } else if (next === ">") {
      this.i += this.s.charAt(this.i + 2) === ">" ? 3 : 2; // &> &>>
      this.cmdStart = false;
    } else if (this.i > 0 && /[<>]/u.test(this.s.charAt(this.i - 1))) {
      this.i++; // >&2  2>&1  <&3
      this.cmdStart = false;
    } else {
      this.scopes[this.top] = (this.scopes[this.top] ?? 0) + 1;
      this.i++;
      this.cmdStart = true;
    }
  }

  private redirect(c: string, next: string): void {
    this.endWord();
    const heredoc =
      c === "<" && next === "<" && this.s.charAt(this.i + 2) !== "<";
    if (heredoc) this.readHeredocDelimiter();
    else this.i += c === "<" && next === "<" ? 3 : 1;
  }

  /** `<<DELIM` / `<<-DELIM` / `<<'DELIM'`: queue the body to skip at the next newline. */
  private readHeredocDelimiter(): void {
    this.i += 2;
    const strip = this.s.charAt(this.i) === "-";
    if (strip) this.i++;
    while (/[ \t]/u.test(this.s.charAt(this.i))) this.i++;
    let raw = "";
    while (this.i < this.s.length) {
      const ch = this.s.charAt(this.i);
      if (/[\s;&|()<>]/u.test(ch)) break;
      raw += ch;
      this.i++;
    }
    this.heredocs.push({ delim: raw.replaceAll(/["'\\]/gu, ""), strip });
  }
}

/** The scripts a shell-feeding command runs from text: `sh -c STR`, a heredoc fed to a shell, `eval`. */
function nestedScriptTexts(command: string): string[] {
  const parsed = parseShell(command);
  if (parsed === undefined) return [];
  return parsed.commands.flatMap((c) => {
    const eff = effective(c);
    if (eff === undefined) return [];
    if (eff.name === "eval") return [eff.args.join(" ")];
    if (!SHELL_NAMES.has(eff.name)) return [];
    const flag = eff.args.findIndex((a) => /^-[A-Za-z]*c[A-Za-z]*$/u.test(a));
    const script = flag === -1 ? undefined : eff.args[flag + 1];
    return (script === undefined ? [] : [script]).concat(c.heredocs);
  });
}

/** Why a command that already runs in the background must not start a shell-level `&` job it never
 *  waits, or undefined when it starts none. Judged by what the command EXECUTES. */
export function unwaitedJobs(command: string): string | undefined {
  if (!command.includes("&")) return undefined;
  const top = new JobScanner(command).run();
  const nested =
    top > 0
      ? 0
      : nestedScriptTexts(command).reduce(
          (n, script) => n + new JobScanner(script).run(),
          0,
        );
  if (top === 0 && nested === 0) return undefined;
  return (
    `this call already runs with run_in_background: true, and its command starts ${top + nested} ` +
    `shell-level background job${top + nested === 1 ? "" : "s"} (\`&\`)${top === 0 ? " inside a nested shell string" : ""} ` +
    `that it never \`wait\`s for. The harness observes only the outer shell: the inner \`&\` job outlives it ` +
    `unobserved, so its exit status and output never reach this session. Fix, in order: ` +
    `(1) drop the \`&\` — the call is already backgrounded and you are re-invoked when it exits; ` +
    `(2) to run several in parallel but observed, end the script with \`wait\` (\`a & b & wait\`); ` +
    `(3) for work that must outlive this session, a NAMED transient unit: \`systemd-run --user --unit=<name> …\`.`
  );
}

const payload = import.meta.main ? readStdinJson() : undefined;
const input = at(payload, "tool_input");
const isBash = strAt(payload, "tool_name") === "Bash";
const isWorker =
  process.env[AGENT_ROUTER_WORKER_ENV] === AGENT_ROUTER_WORKER_VALUE;
const command = isBash ? (strAt(input, "command") ?? "") : "";
const key = isBash ? commandKey(command) : undefined;
const dir = stateDir();
// Judged by the slowest known of the whole command and each of its steps: a compound call first
// seen as a whole still goes to the background when one of its steps (`bun test`) is known slow.
const measured = [
  ...new Set([...(key === undefined ? [] : [key]), ...stepKeys(command)]),
]
  .flatMap((k) => {
    const ms = judgedMs(dir, k);
    return ms === undefined ? [] : [{ key: k, ms }];
  })
  .toSorted((a, b) => b.ms - a.ms)[0];
const inner =
  isBash && at(input, "run_in_background") === true
    ? unwaitedJobs(command)
    : undefined;
// SINGLE-AXIS: one question (may a backgrounded call start work the harness cannot see?)
if (inner !== undefined) decidePre("deny", `background-waits: ${inner}`);
const historyForCall = isSmallFileViewer(command) ? undefined : measured;
const why = isBash
  ? backgroundReason(input, historyForCall, isWorker)
  : undefined;
// SINGLE-AXIS: one question (may this call hold the session?) — its triggers share one resend
if (why !== undefined)
  decidePre(
    "deny",
    `background-waits: this Bash call must not hold the session — ${why}. Resend it with ` +
      `run_in_background: true (you are re-invoked when it exits; read its output file then). ` +
      `The human should never have to press ctrl+b on a wait you started.`,
  );
// Allowed in front: measure it (record-bash-duration.ts closes the record on PostToolUse).
const toolUseId = strAt(payload, "tool_use_id");
if (
  key !== undefined &&
  toolUseId !== undefined &&
  at(input, "run_in_background") !== true
)
  recordStart(dir, toolUseId, key, Temporal.Now.instant().epochMilliseconds);
