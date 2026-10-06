// A Bash command read as SHELL SYNTAX, for the hooks that judge what a command does.
//
// Why this exists (2026-10-06, ~40 workers, four false denials): the gates matched TEXT where they
// meant structure — the word `at` inside a quoted string or heredoc body read as the at(1)
// scheduler, `timeout 110 mise` inside a heredoc read as a launch, `cd <dir> && …` resolved against
// the wrong cwd, an `rr … | grep -F -e '<pat>'` filter rejected because its pattern held `<`. A
// regex cannot tell a word from a command. This file can: it tokenizes the command into WORDS (quotes
// and escapes resolved), COMMANDS (split at `&&` `||` `;` `|` `&` newline and subshell parens), and
// treats heredoc bodies as DATA — never as commands — unless the heredoc feeds a shell
// (`bash <<EOF`, `eval`, `sh -c STR`), in which case that body is parsed as a nested script.
//
// CHOICE: a small hand-written parser, not a vendored one. The vendor bundle (scripts/vendor-deps.ts)
// carries zod and neverthrow only; a real shell parser (bash-parser, mvdan-sh) is hundreds of KB, a
// new supply-chain pin, and returns an AST these gates would still have to flatten. The gates need
// four things — words, command boundaries, heredoc-as-data, cwd — and nothing else, so the parser
// stays small, zero-dep, and is tested here (tests/shell-syntax.test.ts).
//
// LIMITS — it never guesses: anything it is not sure of makes parseShell return undefined, and every
// caller then keeps its previous TEXT-based, fail-closed behaviour. Unsupported: `case … esac`,
// function definitions, arrays `a=(…)`, `;;`, unterminated quotes / heredocs / substitutions.
// Not modelled: parameter expansion results (`$X` stays text and marks the command `dynamic`),
// aliases, globs, brace expansion, `cd` through variables or `pushd`/`cd -`.
//
// Errors are values (no throw, no try — the repo bans both): the Parser records its FIRST failure in
// `err`, every loop stops once it is set, and parseShell turns it into `undefined`.

import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";

export type Redirect = { readonly op: string; readonly target: string };

export type ShellCommand = {
  /** Words after leading `NAME=value` assignments, quotes and escapes resolved. */
  words: string[];
  assignments: string[];
  redirects: Redirect[];
  /** Heredoc bodies attached to this command — DATA, not commands. */
  heredocs: string[];
  /** Reserved words before the command: while until if then do else elif ! { … */
  leading: string[];
  /** The operator that ended the previous command: "" | ";" | "&&" | "||" | "|" | "&" | "\n" | "(" | ")". */
  sep: string;
  /** A word held `$…` outside single quotes, or a backtick: its value is not known statically. */
  dynamic: boolean;
  /** `for x in …` / `select`: the words are data. */
  header: boolean;
  /** Came from a nested shell string, heredoc-fed shell, `eval` or substitution body. */
  nested: boolean;
  /** Where this command runs: the start cwd moved by the `cd`s before it. */
  cwd: string;
};

export type ParsedShell = {
  commands: ShellCommand[];
  /** The cwd after every `cd` of the top level command (subshell scoping ignored, as bashCwd did). */
  endCwd: string;
};

const BLANK = new Set([" ", "\t"]);
const WORD_STOP = new Set([" ", "\t", "\n", "|", "&", ";", "(", ")", "<", ">"]);
const LEADING = new Set([
  "if",
  "then",
  "else",
  "elif",
  "do",
  "while",
  "until",
  "!",
  "{",
  "}",
  "fi",
  "done",
]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/u;
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const MAX_DEPTH = 6;
// Longest first: the first prefix that matches is the operator.
const REDIRECT_OPS = [
  "&>>",
  "&>",
  "<<<",
  "<<-",
  "<<",
  "<&",
  "<>",
  ">>",
  ">&",
  ">|",
  ">",
  "<",
];

type Word = { text: string; quoted: boolean };
type Pending = { delim: string; quoted: boolean; strip: boolean };
type Operator = { op: string; len: number };
/** The command being read, shared with the helpers that replace it at an operator. */
type Slot = { cur: ShellCommand };

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

/** Index of the `)` that closes the `(` at `open`, or -1. */
function matchParen(s: string, open: number): number {
  let depth = 0;
  for (let k = open; k < s.length; k++) {
    const ch = s.charAt(k);
    if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return k;
  }
  return -1;
}

class Parser {
  private i = 0;
  private cwd: string;
  private err: string | undefined;
  readonly out: ShellCommand[] = [];
  private pending: { pending: Pending; cmd: ShellCommand }[] = [];
  private carry: string[] = [];

  constructor(
    private readonly src: string,
    startCwd: string,
    private readonly nested: boolean,
  ) {
    this.cwd = startCwd;
  }

  get endCwd(): string {
    return this.cwd;
  }

  /** The first thing this parser was not sure of, or undefined when it read everything. */
  get failure(): string | undefined {
    return this.err;
  }

  private fail(why: string): void {
    this.err ??= why;
  }

  private fresh(sep: string): ShellCommand {
    const leading = this.carry;
    this.carry = [];
    return {
      words: [],
      assignments: [],
      redirects: [],
      heredocs: [],
      leading,
      sep,
      dynamic: false,
      header: false,
      nested: this.nested,
      cwd: this.cwd,
    };
  }

  run(): void {
    this.list(false);
    if (this.err === undefined && this.pending.length > 0)
      this.fail("heredoc without body");
  }

  /** Parses commands until EOF, or until the `)` that closes a subshell / substitution. */
  private list(inParens: boolean): void {
    const slot: Slot = { cur: this.fresh("") };
    while (this.err === undefined) {
      this.skipBlanks();
      if (this.i >= this.src.length) {
        this.eof(slot.cur, inParens);
        return;
      }
      if (this.step(slot, inParens)) return;
    }
  }

  private eof(cur: ShellCommand, inParens: boolean): void {
    if (inParens) this.fail("unterminated ( )");
    else this.finish(cur, "");
  }

  /** Reads one token of a list. true when it was the `)` that closes this list. */
  private step(slot: Slot, inParens: boolean): boolean {
    const c = this.src.charAt(this.i);
    if (c === "#") {
      this.skipComment();
      return false;
    }
    const found = this.operatorAt();
    if (found !== undefined) this.operator(slot, found);
    else if (c === "(") this.openParen(slot);
    else if (c === ")") return this.closeParen(slot, inParens);
    else if (this.atRedirect()) this.redirect(slot.cur, "");
    else this.plainWord(slot.cur);
    return false;
  }

  private skipComment(): void {
    while (this.i < this.src.length && this.src.charAt(this.i) !== "\n")
      this.i++;
  }

  private operatorAt(): Operator | undefined {
    const c = this.src.charAt(this.i);
    const next = this.src.charAt(this.i + 1);
    if (c === "\n") return { op: "\n", len: 1 };
    if (c === "&" && next === "&") return { op: "&&", len: 2 };
    if (c === "|" && next === "|") return { op: "||", len: 2 };
    if (c === "|") return { op: "|", len: next === "&" ? 2 : 1 };
    if (c === ";") return { op: next === ";" ? ";;" : ";", len: 1 };
    if (c === "&" && next !== ">") return { op: "&", len: 1 };
    return undefined;
  }

  private operator(slot: Slot, found: Operator): void {
    if (found.op === ";;") {
      this.fail("case syntax");
      return;
    }
    this.i += found.len;
    this.finish(slot.cur, found.op);
    slot.cur = this.fresh(found.op);
    if (found.op === "\n") this.readHeredocs();
  }

  private openParen(slot: Slot): void {
    if (slot.cur.words.length > 0 || slot.cur.assignments.length > 0) {
      this.fail("function or array syntax");
      return;
    }
    this.i++;
    this.finish(slot.cur, "(");
    const saved = this.cwd;
    this.list(true);
    this.cwd = saved;
    slot.cur = this.fresh(")");
  }

  private closeParen(slot: Slot, inParens: boolean): boolean {
    if (!inParens) {
      this.fail("unbalanced )");
      return false;
    }
    this.i++;
    this.finish(slot.cur, ")");
    return true;
  }

  /** `<` `>` (not `<(` `>(`) and `&>` start a redirect with no leading fd. */
  private atRedirect(): boolean {
    const c = this.src.charAt(this.i);
    const next = this.src.charAt(this.i + 1);
    if (c === "<" || c === ">") return next !== "(";
    return c === "&" && next === ">";
  }

  private plainWord(cur: ShellCommand): void {
    const word = this.word(cur);
    if (this.err !== undefined) return;
    if (word.text === "" && !word.quoted) {
      this.fail("stuck");
      return;
    }
    const after = this.src.charAt(this.i);
    const fdRedirect =
      !word.quoted &&
      /^\d+$/u.test(word.text) &&
      (after === "<" || after === ">") &&
      this.src.charAt(this.i + 1) !== "(";
    if (fdRedirect) this.redirect(cur, word.text);
    else this.addWord(cur, word);
  }

  private skipBlanks(): void {
    for (;;) {
      const c = this.src.charAt(this.i);
      if (BLANK.has(c)) this.i++;
      else if (c === "\\" && this.src.charAt(this.i + 1) === "\n") this.i += 2;
      else return;
    }
  }

  private addWord(cur: ShellCommand, word: Word): void {
    const atStart = cur.words.length === 0 && !cur.header;
    if (atStart && !word.quoted && this.addReserved(cur, word.text)) return;
    cur.words.push(word.text);
  }

  /** A reserved word or `NAME=value` at the start of a command: true when it was consumed. */
  private addReserved(cur: ShellCommand, text: string): boolean {
    if (cur.assignments.length === 0 && LEADING.has(text)) {
      cur.leading.push(text);
      return true;
    }
    if (text === "for" || text === "select") {
      cur.leading.push(text);
      cur.header = true;
      return true;
    }
    if (text === "case" || text === "function") {
      this.fail(`${text} syntax`);
      return true;
    }
    if (ASSIGNMENT.test(text)) {
      cur.assignments.push(text);
      return true;
    }
    return false;
  }

  private finish(cur: ShellCommand, op: string): void {
    const empty =
      cur.words.length === 0 &&
      cur.assignments.length === 0 &&
      cur.redirects.length === 0 &&
      cur.heredocs.length === 0 &&
      !cur.header;
    if (empty) {
      // a bare `while` / `then` on its own line governs the next command
      this.carry = [...cur.leading, ...this.carry];
      return;
    }
    this.out.push(cur);
    const moves =
      cur.words[0] === "cd" &&
      !cur.dynamic &&
      op !== "|" &&
      op !== "&" &&
      cur.sep !== "|";
    if (moves) this.applyCd(cur.words.slice(1));
  }

  private applyCd(args: string[]): void {
    if (args.length === 0) {
      this.cwd = homedir();
      return;
    }
    const target = args.findLast((a) => !a.startsWith("-"));
    if (target === undefined || target === "") return;
    const path = expandHome(target);
    this.cwd = isAbsolute(path) ? resolve(path) : resolve(this.cwd, path);
  }

  // --- words ---------------------------------------------------------------------------------

  private word(cur: ShellCommand): Word {
    const w: Word = { text: "", quoted: false };
    while (this.i < this.src.length && this.err === undefined) {
      if (!this.wordPart(cur, w)) break;
    }
    return w;
  }

  /** Consumes one piece of a word into `w`; false at a word boundary. */
  private wordPart(cur: ShellCommand, w: Word): boolean {
    const c = this.src.charAt(this.i);
    const next = this.src.charAt(this.i + 1);
    if ((c === "<" || c === ">") && next === "(") {
      this.i += 2;
      this.substitution(cur);
      w.text += `${c}(…)`;
      return true;
    }
    if (WORD_STOP.has(c)) return false;
    if (c === "\\") this.escape(w);
    else if (c === "'") this.singleQuoted(w);
    else if (c === '"') {
      this.i++;
      w.quoted = true;
      w.text += this.doubleQuoted(cur);
    } else {
      const piece = this.expansion(cur);
      if (piece === undefined) {
        w.text += c;
        this.i++;
      } else w.text += piece;
    }
    return true;
  }

  private escape(w: Word): void {
    const next = this.src.charAt(this.i + 1);
    if (next === "") {
      this.fail("trailing backslash");
      return;
    }
    this.i += 2;
    w.quoted = true;
    if (next !== "\n") w.text += next;
  }

  private singleQuoted(w: Word): void {
    const close = this.src.indexOf("'", this.i + 1);
    if (close === -1) {
      this.fail("unterminated '");
      return;
    }
    w.text += this.src.slice(this.i + 1, close);
    this.i = close + 1;
    w.quoted = true;
  }

  private doubleQuoted(cur: ShellCommand): string {
    let text = "";
    while (this.err === undefined) {
      if (this.i >= this.src.length) {
        this.fail('unterminated "');
        break;
      }
      const c = this.src.charAt(this.i);
      if (c === '"') {
        this.i++;
        return text;
      }
      if (c === "\\") {
        text += this.doubleQuotedEscape();
        continue;
      }
      const piece = this.expansion(cur);
      if (piece === undefined) {
        text += c;
        this.i++;
      } else text += piece;
    }
    return text;
  }

  private doubleQuotedEscape(): string {
    const next = this.src.charAt(this.i + 1);
    if (next === "") {
      this.fail("trailing backslash");
      return "";
    }
    this.i += 2;
    if (next === "\n") return "";
    return '$`"\\'.includes(next) ? next : `\\${next}`;
  }

  /** What a `$…` or backtick at the cursor stands for, or undefined when there is none. */
  private expansion(cur: ShellCommand): string | undefined {
    const dollar = this.dollar(cur);
    if (dollar !== undefined) return dollar;
    if (this.src.charAt(this.i) === "`") return this.backtick(cur);
    return undefined;
  }

  /** `$(…)`, `${…}`, `$'…'`, `$NAME`: returns the text it stands for, or undefined if not at a `$`. */
  private dollar(cur: ShellCommand): string | undefined {
    if (this.src.charAt(this.i) !== "$") return undefined;
    const next = this.src.charAt(this.i + 1);
    if (next === "(") {
      this.i += 2;
      this.substitution(cur);
      return "$(…)";
    }
    if (next === "{") return this.braceExpansion(cur);
    if (next === "'") return this.ansiC();
    cur.dynamic = true;
    this.i++;
    return "$";
  }

  private braceExpansion(cur: ShellCommand): string {
    const s = this.src;
    let depth = 0;
    for (let j = this.i + 1; j < s.length; j++) {
      const ch = s.charAt(j);
      if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        const text = s.slice(this.i, j + 1);
        this.i = j + 1;
        cur.dynamic = true;
        return text;
      }
    }
    this.fail("unterminated ${");
    return "";
  }

  private ansiC(): string {
    const s = this.src;
    let j = this.i + 2;
    while (j < s.length && s.charAt(j) !== "'")
      j += s.charAt(j) === "\\" ? 2 : 1;
    if (j >= s.length) {
      this.fail("unterminated $'");
      return "";
    }
    const text = s.slice(this.i + 2, j);
    this.i = j + 1;
    return text;
  }

  /** A `$(…)` / `<(…)` body, parsed as commands of its own subshell. */
  private substitution(cur: ShellCommand): void {
    cur.dynamic = true;
    const saved = this.cwd;
    // a substitution is a fresh command list that ends at its `)`; its commands join this.out
    const before = this.pending;
    this.pending = [];
    this.list(true);
    if (this.pending.length > 0) this.fail("heredoc in substitution");
    this.pending = before;
    this.cwd = saved;
  }

  private backtick(cur: ShellCommand): string {
    const s = this.src;
    let j = this.i + 1;
    let inner = "";
    for (; j < s.length && s.charAt(j) !== "`"; j++) {
      const c = s.charAt(j);
      const n = s.charAt(j + 1);
      if (c === "\\" && (n === "`" || n === "\\" || n === "$")) {
        inner += n;
        j++;
      } else inner += c;
    }
    if (j >= s.length) {
      this.fail("unterminated `");
      return "";
    }
    this.i = j + 1;
    cur.dynamic = true;
    this.sub(inner);
    return "`…`";
  }

  private sub(inner: string): void {
    const p = new Parser(inner, this.cwd, true);
    p.run();
    if (p.failure === undefined) this.out.push(...p.out);
    else this.fail(p.failure);
  }

  // --- redirects and heredocs ------------------------------------------------------------------

  private redirect(cur: ShellCommand, fd: string): void {
    const op = REDIRECT_OPS.find((o) => this.src.startsWith(o, this.i));
    if (op === undefined) {
      this.fail("redirect operator");
      return;
    }
    this.i += op.length;
    this.skipBlanks();
    const target = this.word(cur);
    if (this.err !== undefined) return;
    if (target.text === "" && !target.quoted) {
      this.fail("redirect without target");
      return;
    }
    if (op === "<<" || op === "<<-") {
      const pending = {
        delim: target.text,
        quoted: target.quoted,
        strip: op === "<<-",
      };
      this.pending.push({ pending, cmd: cur });
    } else cur.redirects.push({ op: `${fd}${op}`, target: target.text });
  }

  private readHeredocs(): void {
    const queue = this.pending;
    this.pending = [];
    for (const { pending, cmd } of queue) {
      if (this.err !== undefined) return;
      this.readHeredoc(pending, cmd);
    }
  }

  private readHeredoc(p: Pending, cmd: ShellCommand): void {
    const lines: string[] = [];
    while (this.err === undefined) {
      if (this.i >= this.src.length) {
        this.fail("unterminated heredoc");
        return;
      }
      let nl = this.src.indexOf("\n", this.i);
      if (nl === -1) nl = this.src.length;
      const raw = this.src.slice(this.i, nl);
      this.i = Math.min(nl + 1, this.src.length);
      const line = p.strip ? raw.replace(/^\t+/u, "") : raw;
      if (line === p.delim) {
        this.attachHeredoc(lines.join("\n"), p, cmd);
        return;
      }
      lines.push(line);
      if (nl >= this.src.length) this.fail("unterminated heredoc");
    }
  }

  private attachHeredoc(body: string, p: Pending, cmd: ShellCommand): void {
    cmd.heredocs.push(body);
    if (!p.quoted) this.expansionsIn(body, cmd);
  }

  /** An unquoted-delimiter heredoc expands `$(…)` and backticks: those RUN, so they are commands. */
  private expansionsIn(body: string, cmd: ShellCommand): void {
    for (let j = 0; j < body.length && this.err === undefined; j++)
      j = this.expansionAt(body, j, cmd);
  }

  /** Handles the char at `j` of a heredoc body; returns the index of the last char it consumed. */
  private expansionAt(body: string, j: number, cmd: ShellCommand): number {
    const c = body.charAt(j);
    if (c === "\\") return j + 1;
    if (c === "$" && body.charAt(j + 1) === "(") {
      const k = matchParen(body, j + 1);
      if (k === -1) {
        this.fail("unterminated $( in heredoc");
        return j;
      }
      cmd.dynamic = true;
      this.sub(body.slice(j + 2, k));
      return k;
    }
    if (c === "`") {
      const k = body.indexOf("`", j + 1);
      if (k === -1) {
        this.fail("unterminated ` in heredoc");
        return j;
      }
      cmd.dynamic = true;
      this.sub(body.slice(j + 1, k));
      return k;
    }
    return j;
  }
}

/** The script a shell-feeding command runs from text, or undefined when it is not one. */
function nestedScripts(c: ShellCommand): string[] {
  const eff = effective(c);
  if (eff === undefined) return [];
  if (eff.name === "eval") return [eff.args.join(" ")];
  if (!SHELLS.has(eff.name) && eff.name !== "source" && eff.name !== ".")
    return [];
  const scripts: string[] = [];
  const flag = eff.args.findIndex((a) => /^-[A-Za-z]*c[A-Za-z]*$/u.test(a));
  const script = flag === -1 ? undefined : eff.args[flag + 1];
  if (script !== undefined) scripts.push(script);
  scripts.push(...c.heredocs);
  return scripts;
}

/** Every command of the nested scripts `c` feeds to a shell; undefined when one is not understood. */
function expandScripts(
  c: ShellCommand,
  depth: number,
): ShellCommand[] | undefined {
  const all: ShellCommand[] = [];
  for (const script of nestedScripts(c)) {
    const p = new Parser(script, c.cwd, true);
    p.run();
    if (p.failure !== undefined) return undefined;
    const inner = expand(p.out, depth + 1);
    if (inner === undefined) return undefined;
    all.push(...inner);
  }
  return all;
}

function expand(
  commands: ShellCommand[],
  depth: number,
): ShellCommand[] | undefined {
  if (depth > MAX_DEPTH) return undefined;
  const all = [...commands];
  for (const c of commands) {
    const nested = expandScripts(c, depth);
    if (nested === undefined) return undefined;
    all.push(...nested);
  }
  return all;
}

/**
 * The command as syntax, or undefined when this parser is not sure of it (callers then keep their
 * text-based, fail-closed behaviour). `commands` holds every command that EXECUTES: the top level,
 * `$(…)` / backtick / `<(…)` bodies, and nested shell scripts (`sh -c STR`, heredoc into a shell,
 * `eval`) with `nested: true`. Heredoc bodies fed to anything else are data on `heredocs`.
 */
export function parseShell(
  command: string,
  startCwd: string = process.cwd(),
): ParsedShell | undefined {
  const p = new Parser(command, resolve(startCwd), false);
  p.run();
  if (p.failure !== undefined) return undefined;
  const commands = expand(p.out, 0);
  if (commands === undefined) return undefined;
  return { commands, endCwd: p.endCwd };
}

export type Effective = { readonly name: string; readonly args: string[] };

const SUDO_WITH_VALUE = new Set([
  "-u",
  "-g",
  "-h",
  "-p",
  "-C",
  "-D",
  "-R",
  "-T",
  "-U",
]);
const FLAG_ONLY_WRAPPERS = new Set(["command", "builtin", "exec", "time"]);

function dropFlags(args: string[]): string[] {
  let rest = args;
  while (rest[0]?.startsWith("-") === true) rest = rest.slice(1);
  return rest;
}

function dropSudo(args: string[]): string[] {
  let rest = args;
  for (;;) {
    const f = rest[0];
    if (f === undefined || !f.startsWith("-")) return rest;
    rest = rest.slice(SUDO_WITH_VALUE.has(f) ? 2 : 1);
  }
}

function dropNice(args: string[]): string[] {
  if (args[0] === "-n") return args.slice(2);
  if (/^-\d+$/u.test(args[0] ?? "")) return args.slice(1);
  return args;
}

function dropEnv(args: string[]): string[] {
  let rest = args;
  for (;;) {
    const f = rest[0];
    if (f === undefined || !(f.startsWith("-") || ASSIGNMENT.test(f)))
      return rest;
    rest = rest.slice(f === "-u" ? 2 : 1);
  }
}

function dropTimeout(args: string[]): string[] {
  let rest = args;
  for (;;) {
    const f = rest[0];
    if (f === undefined || !f.startsWith("-")) break;
    rest = rest.slice(f === "-k" || f === "-s" ? 2 : 1);
  }
  return rest.slice(1); // the duration
}

function dropUvRun(args: string[]): string[] {
  let rest = args.slice(1);
  while (rest[0]?.startsWith("--") === true) rest = rest.slice(1);
  return rest;
}

/** What follows a wrapper command, or undefined when `name` is not a wrapper. */
function unwrap(name: string, rest: string[]): string[] | undefined {
  if (name === "sudo") return dropSudo(rest);
  if (FLAG_ONLY_WRAPPERS.has(name)) return dropFlags(rest);
  if (name === "nice") return dropNice(rest);
  if (name === "env") return dropEnv(rest);
  if (name === "timeout") return dropTimeout(rest);
  if (name === "uv" && rest[0] === "run") return dropUvRun(rest);
  return undefined;
}

/**
 * What a command really runs: wrappers (`sudo command time nice exec builtin env timeout`,
 * `uv run`) stripped, the program name reduced to its basename. undefined for a `for` header or an
 * empty command.
 */
export function effective(c: ShellCommand): Effective | undefined {
  if (c.header) return undefined;
  let w = c.words;
  for (let guard = 0; guard < 12; guard++) {
    const first = w[0];
    if (first === undefined) return undefined;
    const name = basename(first);
    const rest = unwrap(name, w.slice(1));
    if (rest === undefined) return { name, args: w.slice(1) };
    w = rest;
  }
  return undefined;
}

/** Every write target a redirect names, resolved against the cwd of ITS command (not the session's). */
export function redirectWritePaths(parsed: ParsedShell): string[] {
  return parsed.commands.flatMap((c) =>
    c.redirects
      .filter(
        (r) => /[>]/u.test(r.op) && !r.op.endsWith("&") && r.target !== "",
      )
      .map((r) => {
        const target = expandHome(r.target);
        return isAbsolute(target) ? resolve(target) : resolve(c.cwd, target);
      }),
  );
}
