// PreToolUse gate (matcher: Bash) — in a firedancer working copy, julia runs only TRACKED code.
//
// Owner, 2026-10-08: 「scratch の利用禁止を形式的に実現してください」. That day every firefly-gdl
// number came from throwaway julia scripts in a scratchpad that called runner internals or
// reimplemented arenas; none went through launcher/launch.ts, none was a polysearch run or a
// leaderboard row (polysearch finding2610_0812efag3). polysearch's own hook only classifies WRITES
// into research_record/, so nothing stood between a scratch script and a reported number.
//
// A firedancer working copy is any directory whose root holds launcher/launch.ts AND
// packages/ModelRegistry.jl — the main checkout, a jj workspace, a git worktree
// (firedancer-simplify). A command that executes julia is allowed only when its program file is a
// TRACKED file of such a working copy: present in the parent commit (@-) of a jj working copy, in
// HEAD of a git one. A MODIFIED tracked file passes (developers edit tests); an UNTRACKED new file
// does not — commit it first. Denied:
//   (a) a program file outside every firedancer working copy (scratchpad, /tmp, $HOME/…, session
//       dirs) while `--project` points into one or the cwd is in one;
//   (b) `-e/-E/--eval/--print`, a program read from stdin or a heredoc, or a bare REPL, under the
//       same condition;
//   (c) an untracked program file inside a working copy (also when cwd and --project are outside).
// Allowed: `bun launcher/launch.ts …` (no julia here — it spawns it), tracked repo tests,
// `julia --version`/`--help`, and julia with no firedancer project when the cwd is outside too.
//
// julia is found by the command it EXECUTES (shell-syntax.ts), through the wrappers an agent puts
// in front: env/timeout/nice/sudo/time/command (effective()), plus agent-resource-run … --,
// mise exec/x … --, setsid, taskset, systemd-run, ionice, stdbuf, nohup, and `bash -c STR`. A word
// that merely spells julia (`rr text julia`, `pgrep julia`) is an argument, not a launch.
//
// The program file is judged whether or not it exists YET: `cat > x.jl <<EOF … ; julia x.jl` is the
// scratch pattern itself, and the file does not exist when the hook runs. The tracked check is the
// only process this hook spawns (one `jj file list -r @-` or `git cat-file -e HEAD:path`, only when
// a julia program file sits inside a working copy); a command without the word julia costs nothing.
//
// LIMITS: scripts that call julia from inside (`bash run.sh`, `make`, `mise run <task>`, xargs) are
// not followed — a wrapper script is itself a file this gate never reads. A path or --project built
// from `$VAR` cannot be checked; inside a firedancer context it is denied, outside it passes.
// FAIL CLOSED on hook errors (registered with run.sh --fail-closed).

import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { attempt, errorMessage } from "../../hooks/attempt.ts";
import { strAt } from "../../hooks/narrow.ts";
import {
  effective,
  parseShell,
  type ShellCommand,
} from "../../hooks/shell-syntax.ts";
import { decidePre, findExe, readStdinJson } from "./lib.ts";

const OFFICIAL_ROUTE =
  "scratch execution is banned in firedancer: measure through " +
  "`mise exec -- bun launcher/launch.ts --rev <sealed sha> <arena> launcher/model_interface_runner.jl <params.toml> <manifest> <cause>`; " +
  "put diagnostics in a tracked, committed script.";

const MAX_DEPTH = 4;
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/u;
const JULIA_NAME = /^julia(?:-[\d.]+)?$/u;
const JULIA_WORD = /(?:^|[\s;&|(`'"])(?:\S*\/)?julia(?:-[\d.]+)?(?=[\s'")]|$)/u;

// ---------------------------------------------------------------------------------------------
// firedancer working copies

const rootOf = new Map<string, string | null>();

function isWorkingCopyRoot(dir: string): boolean {
  return (
    existsSync(join(dir, "launcher", "launch.ts")) &&
    existsSync(join(dir, "packages", "ModelRegistry.jl"))
  );
}

/** `p` with symlinks resolved as far as it exists (the rest is appended unresolved). */
function realish(p: string): string {
  let head = resolve(p);
  const tail: string[] = [];
  while (!existsSync(head) && dirname(head) !== head) {
    tail.unshift(basename(head));
    head = dirname(head);
  }
  return join(existsSync(head) ? realpathSync(head) : head, ...tail);
}

/** The firedancer working copy root containing `p`, or null. */
function workingCopyOf(p: string): string | null {
  let dir = realish(p);
  const walked: string[] = [];
  for (;;) {
    const known = rootOf.get(dir);
    let found: string | null | undefined = known;
    if (found === undefined && isWorkingCopyRoot(dir)) found = dir;
    if (found === undefined && dirname(dir) === dir) found = null;
    if (found !== undefined) {
      return cacheWorkingCopy(dir, walked, found);
    }
    walked.push(dir);
    dir = dirname(dir);
  }
}

function cacheWorkingCopy(
  dir: string,
  walked: string[],
  found: string | null,
): string | null {
  for (const w of walked) rootOf.set(w, found);
  rootOf.set(dir, found);
  return found;
}

// ---------------------------------------------------------------------------------------------
// tracked check — the one process this hook may spawn

const EXE_DIRS = [
  join(homedir(), ".local", "bin"),
  join(homedir(), ".cargo", "bin"),
  "/home/linuxbrew/.linuxbrew/bin",
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
];
const trackedCache = new Map<string, boolean | undefined>();

/** Is `rel` in the parent commit (@-) of this jj working copy / in HEAD of this git one?
 *  undefined = could not tell (no vcs binary, vcs error). */
function isTracked(root: string, rel: string): boolean | undefined {
  const key = `${root}\0${rel}`;
  if (trackedCache.has(key)) return trackedCache.get(key);
  const answer = askVcs(root, rel);
  trackedCache.set(key, answer);
  return answer;
}

function askVcs(root: string, rel: string): boolean | undefined {
  if (existsSync(join(root, ".jj"))) {
    const jj = findExe("jj", EXE_DIRS);
    if (jj === null) return undefined;
    const r = spawnSync(
      jj,
      [
        "--ignore-working-copy",
        "--no-pager",
        "--color=never",
        "file",
        "list",
        "-r",
        "@-",
        `root-file:${JSON.stringify(rel)}`,
      ],
      { cwd: root, encoding: "utf8", timeout: 5000 },
    );
    if (r.error !== undefined || r.status !== 0) return undefined;
    return r.stdout.trim() !== "";
  }
  if (existsSync(join(root, ".git"))) {
    const git = findExe("git", EXE_DIRS);
    if (git === null) return undefined;
    const r = spawnSync(
      git,
      ["--no-optional-locks", "cat-file", "-e", `HEAD:${rel}`],
      { cwd: root, encoding: "utf8", timeout: 5000 },
    );
    if (r.error !== undefined) return undefined;
    // 0 = in HEAD; 128 = path (or HEAD itself) does not exist; anything else is not an answer
    if (r.status === 0) return true;
    return r.status === 128 || r.status === 1 ? false : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// finding julia behind wrappers

type Launch = { args: string[]; env: string[]; cwd: string };

/** Drop leading flags, consuming the next word for the flags in `withValue`. */
function dropFlags(args: string[], withValue: ReadonlySet<string>): string[] {
  let rest = args;
  while (rest[0]?.startsWith("-") === true) {
    const f = rest[0];
    if (f === "--") return rest.slice(1);
    rest = rest.slice(withValue.has(f) ? 2 : 1);
  }
  return rest;
}

const NONE: ReadonlySet<string> = new Set();

function afterDashes(args: string[], withValue: ReadonlySet<string>): string[] {
  const dash = args.indexOf("--");
  return dash === -1 ? dropFlags(args, withValue) : args.slice(dash + 1);
}

function afterMise(args: string[]): string[] {
  const sub = args.findIndex((x) => !x.startsWith("-"));
  const verb = args[sub];
  if (verb !== "exec" && verb !== "x") return [];
  const rest = args.slice(sub + 1);
  const dash = rest.indexOf("--");
  if (dash !== -1) return rest.slice(dash + 1);
  // `mise exec TOOL@VER cmd …`: tool specs carry an `@`
  const flagless = dropFlags(rest, new Set(["-C", "--cd", "-E", "--env"]));
  const cmd = flagless.findIndex((x) => !x.includes("@"));
  return cmd === -1 ? [] : flagless.slice(cmd);
}

function afterTaskset(args: string[]): string[] {
  const rest = dropFlags(args, new Set(["-c", "--cpu-list"]));
  return args.includes("-c") || args.includes("--cpu-list")
    ? rest
    : rest.slice(1); // the hex mask
}

const WRAPPER_ARGS: Record<string, (args: string[]) => string[]> = {
  "agent-resource-run": (a) => afterDashes(a, new Set(["--manifest"])),
  mise: afterMise,
  setsid: (a) => dropFlags(a, NONE),
  nohup: (a) => a,
  taskset: afterTaskset,
  "systemd-run": (a) =>
    dropFlags(
      a,
      new Set([
        "-p",
        "--property",
        "-u",
        "--unit",
        "-E",
        "--setenv",
        "-H",
        "-M",
        "--slice",
        "-G",
      ]),
    ),
  ionice: (a) => dropFlags(a, new Set(["-c", "-n", "-p", "-P", "-u"])),
  stdbuf: (a) => dropFlags(a, new Set(["-i", "-o", "-e"])),
};

/** The commands a shell string runs, or undefined when it is not `sh -c STR` / unparseable. */
function shellString(args: string[], cwd: string): ShellCommand[] | undefined {
  const flag = args.findIndex((a) => /^-[A-Za-z]*c[A-Za-z]*$/u.test(a));
  const script = flag === -1 ? undefined : args[flag + 1];
  return script === undefined ? undefined : parseShell(script, cwd)?.commands;
}

/** Every julia launch in `commands` (shell strings are followed up to MAX_DEPTH). */
function juliaLaunches(commands: ShellCommand[], depth: number): Launch[] {
  const out: Launch[] = [];
  for (const command of commands) {
    out.push(...juliaLaunchesInCommand(command, depth));
  }
  return out;
}

function juliaLaunchesInCommand(c: ShellCommand, depth: number): Launch[] {
  const out: Launch[] = [];
  let words = c.words;
  const env = [...c.assignments];
  for (let guard = 0; guard < 12 && words.length > 0; guard++) {
    const eff = effective({ ...c, words });
    if (eff === undefined) return out;
    // env X=… and friends: the words the wrapper strip consumed before the program
    const consumed = words.slice(0, words.length - eff.args.length - 1);
    env.push(...consumed.filter((w) => ENV_ASSIGNMENT.test(w)));
    if (JULIA_NAME.test(eff.name)) {
      out.push({ args: eff.args, env, cwd: c.cwd });
      return out;
    }
    if (/^(?:ba|z|da|k)?sh$/u.test(eff.name)) {
      out.push(...shellLaunches(eff.args, c.cwd, depth));
      return out;
    }
    const unwrap = WRAPPER_ARGS[eff.name];
    if (unwrap === undefined) return out;
    words = unwrap(eff.args);
  }
  return out;
}

function shellLaunches(args: string[], cwd: string, depth: number): Launch[] {
  if (depth >= MAX_DEPTH) return [];
  const inner = shellString(args, cwd);
  return inner === undefined ? [] : juliaLaunches(inner, depth + 1);
}

// ---------------------------------------------------------------------------------------------
// julia's own command line

// Long options that take no value from the NEXT word (a value, if any, rides on `=`); every other
// long option takes its value from `=` or from the next word (getopt_long required_argument).
const LONG_NO_NEXT = new Set([
  "version",
  "help",
  "help-hidden",
  "interactive",
  "quiet",
  "project",
  "code-coverage",
  "track-allocation",
  "worker",
  "optimize",
  "lisp",
  "strip-metadata",
  "task-metrics",
]);
const SHORT_VALUE = new Set(["e", "E", "L", "J", "C", "t", "p", "H"]);

type JuliaArgs = {
  project: string | undefined; // "" = bare --project (the cwd's project)
  inline: boolean;
  query: boolean;
  program: string | undefined;
  loads: string[];
};

function parseJuliaArgs(args: string[]): JuliaArgs {
  const r: JuliaArgs = {
    project: undefined,
    inline: false,
    query: false,
    program: undefined,
    loads: [],
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (a === "--") {
      r.program = args[i + 1];
      return r;
    }
    if (a === "-" || !a.startsWith("-")) {
      r.program = a;
      return r;
    }
    if (a.startsWith("--")) {
      i = parseLongJuliaOption(args, i, r);
      continue;
    }
    if (a === "-v" || a === "-h") r.query = true;
    const flag = a.charAt(1);
    if (!SHORT_VALUE.has(flag)) continue;
    const value = a.length > 2 ? a.slice(2) : args[++i];
    if (flag === "e" || flag === "E") r.inline = true;
    else if (flag === "L" && value !== undefined) r.loads.push(value);
  }
  return r;
}

function parseLongJuliaOption(
  args: string[],
  index: number,
  result: JuliaArgs,
): number {
  const option = args[index] ?? "";
  const eq = option.indexOf("=");
  const name = (eq === -1 ? option : option.slice(0, eq)).slice(2);
  let value = eq === -1 ? undefined : option.slice(eq + 1);
  let nextIndex = index;
  if (value === undefined && !LONG_NO_NEXT.has(name)) {
    nextIndex++;
    value = args[nextIndex];
  }
  if (name === "project") result.project = value ?? "";
  else if (name === "eval" || name === "print") result.inline = true;
  else if (name === "load" && value !== undefined) result.loads.push(value);
  else if (name === "version" || name === "help" || name === "help-hidden")
    result.query = true;
  return nextIndex;
}

// ---------------------------------------------------------------------------------------------
// judgment

const hasVar = (s: string): boolean => /[$`]/u.test(s);

function expandHome(path: string): string {
  if (path === "~") return homedir();
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

/** Is firedancer in play for this launch: cwd or --project/JULIA_PROJECT inside a working copy? */
function inFiredancer(l: Launch, a: JuliaArgs): boolean {
  if (workingCopyOf(l.cwd) !== null) return true;
  const project =
    a.project ??
    l.env.findLast((e) => e.startsWith("JULIA_PROJECT="))?.slice(14);
  if (project === undefined || project.startsWith("@")) return false;
  if (hasVar(project)) return true; // not statically known: assume the worst
  const dir = project === "" ? l.cwd : resolve(l.cwd, expandHome(project));
  return workingCopyOf(dir) !== null;
}

/** Why this julia launch is scratch execution, or undefined. */
function judgeLaunch(l: Launch): string | undefined {
  const a = parseJuliaArgs(l.args);
  if (a.query && a.program === undefined && !a.inline) return undefined;
  const context = inFiredancer(l, a);

  if (a.inline) {
    return context ? "julia -e/-E/--eval runs an inline program" : undefined;
  }
  if (a.program === undefined || a.program === "-") {
    return context
      ? "julia reads its program from stdin/a heredoc or starts a bare REPL"
      : undefined;
  }
  for (const p of [a.program, ...a.loads]) {
    const why = judgeProgram(p, l.cwd, context);
    if (why !== undefined) return why;
  }
  return undefined;
}

function judgeProgram(
  program: string,
  cwd: string,
  context: boolean,
): string | undefined {
  if (hasVar(program))
    return context
      ? `the julia program path ${program} is not statically known`
      : undefined;
  const abs = resolve(cwd, expandHome(program));
  const root = workingCopyOf(abs);
  if (root === null) return outsideWorkingCopyReason(abs, context);
  const rel = relative(root, realish(abs));
  const tracked = isTracked(root, rel);
  if (tracked === undefined)
    return `could not verify that ${rel} is tracked in ${root} (jj/git failed) — failing closed`;
  if (tracked) return undefined;
  const missing = existsSync(abs) ? "" : "; the file does not exist on disk";
  return `${rel} is untracked in ${root} (not in @-/HEAD${missing}): commit it first`;
}

function outsideWorkingCopyReason(
  abs: string,
  context: boolean,
): string | undefined {
  if (!context) return undefined;
  return `${abs} is a julia script outside every firedancer working copy`;
}

/** Why this Bash command must be refused, or undefined. `cwd` is where the shell starts. */
export function scratchReason(
  command: string,
  cwd: string,
): string | undefined {
  if (!/julia/u.test(command)) return undefined;
  const parsed = parseShell(command, cwd);
  if (parsed === undefined) {
    // the parser is not sure what runs: judge by text, but only where firedancer is in play
    if (!JULIA_WORD.test(command)) return undefined;
    if (workingCopyOf(cwd) === null && !/firedancer/u.test(command))
      return undefined;
    return "the command could not be parsed and runs julia";
  }
  for (const launch of juliaLaunches(parsed.commands, 0)) {
    const why = judgeLaunch(launch);
    if (why !== undefined) return why;
  }
  return undefined;
}

function main(): void {
  const payload = readStdinJson();
  if (payload === undefined) {
    // FATAL: the payload is not JSON, so nothing could be classified; fail closed with the one fix
    decidePre(
      "deny",
      "official-execution: hook error while classifying the command " +
        "(invalid JSON payload) — failing closed. " +
        "Fix ~/.claude/hooks/enforce-official-execution.ts before retrying.",
    );
  }
  if (strAt(payload, "tool_name") !== "Bash") return;
  const command = strAt(payload, "tool_input", "command");
  if (command === undefined || !/julia/u.test(command)) return;
  const cwd = strAt(payload, "cwd");
  const why = scratchReason(
    command,
    cwd !== undefined && cwd !== "" ? cwd : process.cwd(),
  );
  // SINGLE-AXIS: this deny decides only whether a Julia launch follows the official execution route.
  if (why !== undefined)
    decidePre("deny", `official-execution: ${why}. ${OFFICIAL_ROUTE}`);
}

if (import.meta.main) {
  const r = await attempt(main);
  if (!r.ok) {
    // FATAL: the hook itself failed, so the command could not be classified; fail closed
    decidePre(
      "deny",
      `official-execution: hook error while classifying the command ` +
        `(${errorMessage(r.error)}) — failing closed. ` +
        `Fix ~/.claude/hooks/enforce-official-execution.ts before retrying.`,
    );
  }
  process.exit(0);
}
