import { opendir, open, readlink, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { DIM, RST } from "./ansi.ts";
import { dur } from "./jobs.ts";
import { z } from "./zod.ts";

const PID_LIMIT = 8192;
const FD_LIMIT = 256;
const FDINFO_LIMIT = 4096;
const CMDLINE_LIMIT = 16384;
/** Label budget when the render has no known terminal width. */
const DEFAULT_COLUMNS = 80;
/** Cells of " │ working" after a shell row's prefix; narrower rows show the prefix alone. */
const SHELL_STATE_CELLS = 10;
/** Cells of " │ working · $ " between a shell row's prefix and its command. */
const SHELL_ACTIVITY_CELLS = 15;
const EVAL_OPEN = "eval '";
const WRAPPER_TAIL = "' < /dev/null && pwd -P >|";
const TASK_FILE = /^[a-zA-Z0-9-]+\.output$/u;
export type ShellRow = { id: string; seconds: number; command?: string };
/** `reason` names the check that failed; it is printed after `shells: unknown`. */
export type ShellScan =
  | { kind: "known"; rows: ShellRow[] }
  | { kind: "unknown"; reason: string };
const unknown = (reason: string): ShellScan => ({ kind: "unknown", reason });
const errorSchema = z.object({ code: z.string().optional() });

/** One scanned entry: `ok` when skipped or counted; otherwise the reason the whole scan is unknown. */
type Verdict = { ok: true } | { ok: false; reason: string };
const fine: Verdict = { ok: true };
const broken = (reason: string): Verdict => ({ ok: false, reason });

/** A read's outcome as a value; the caller classifies the error. */
type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };
const settle = <T>(work: Promise<T>): Promise<Settled<T>> =>
  work.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

function code(error: unknown): string {
  const parsed = errorSchema.safeParse(error);
  if (parsed.success && parsed.data.code !== undefined) return parsed.data.code;
  return error instanceof Error ? error.message : "unknown error";
}

/** Lists a directory with at most `limit` entries; undefined when it holds more. */
async function entries(
  path: string,
  limit: number,
): Promise<string[] | undefined> {
  const dir = await opendir(path);
  const names: string[] = [];
  for await (const item of dir) {
    names.push(item.name);
    if (names.length > limit) return undefined;
  }
  return names;
}
function gone(error: unknown): boolean {
  const parsed = errorSchema.safeParse(error);
  return parsed.success && parsed.data.code === "ENOENT";
}
/**
 * The kernel refuses the fd listing of a same-UID process that is not dumpable
 * (sshd-session, ssh-agent, sd-pam). Such a process is not inspectable by any
 * same-UID reader, so it is skipped rather than turning the whole scan unknown.
 */
function refused(error: unknown): boolean {
  const parsed = errorSchema.safeParse(error);
  return (
    parsed.success &&
    (parsed.data.code === "EACCES" || parsed.data.code === "EPERM")
  );
}
/** A vanished or refused process is skipped; any other read failure makes the scan unknown. */
function skippable(error: unknown, where: string): Verdict {
  if (refused(error) || gone(error)) return fine;
  return broken(`${where} unreadable: ${code(error)}`);
}

/**
 * The command a Claude Code shell runs, from the argv of its wrapper process:
 * `/usr/bin/zsh -c source …/shell-snapshots/… && … && eval '<cmd>' < /dev/null && pwd -P >| …`.
 * Undefined for any other argv, or when the wrapper's tail is not in the bounded read.
 */
export function commandFromWrapper(argv: string): string | undefined {
  if (!argv.includes("/shell-snapshots/")) return undefined;
  const start = argv.indexOf(EVAL_OPEN);
  const end = argv.lastIndexOf(WRAPPER_TAIL);
  if (start < 0 || end < start + EVAL_OPEN.length) return undefined;
  return argv.slice(start + EVAL_OPEN.length, end).replaceAll("'\\''", "'");
}

/** A holder's command line, bounded. Unreadable means no command, never an unknown scan. */
async function wrapperCommand(base: string): Promise<string | undefined> {
  const opened = await settle(open(join(base, "cmdline"), "r"));
  if (!opened.ok) return undefined;
  await using handle = opened.value;
  const buffer = Buffer.alloc(CMDLINE_LIMIT);
  const read = await settle(handle.read(buffer, 0, buffer.length, 0));
  if (!read.ok) return undefined;
  return commandFromWrapper(
    buffer.toString("utf8", 0, read.value.bytesRead).replaceAll("\0", " "),
  );
}

/**
 * One descriptor of a same-UID process. A descriptor is a holder only when its
 * target is a file directly under this session's task directory and it is open
 * for writing; the task directory itself is never listed.
 */
async function inspectFd(
  pid: string,
  base: string,
  fd: string,
  taskDir: string,
  found: Map<string, string | undefined>,
): Promise<Verdict> {
  const where = `pid ${pid} fd ${fd}`;
  const target = await settle(readlink(join(base, "fd", fd)));
  if (!target.ok) return skippable(target.error, `${where} readlink`);
  if (!target.value.startsWith(`${taskDir}/`)) return fine;
  const name = target.value.slice(taskDir.length + 1);
  if (!TASK_FILE.test(name)) return fine;
  const opened = await settle(open(join(base, "fdinfo", fd), "r"));
  if (!opened.ok) return skippable(opened.error, `${where} fdinfo`);
  await using handle = opened.value;
  const buffer = Buffer.alloc(FDINFO_LIMIT);
  const read = await settle(handle.read(buffer, 0, buffer.length, 0));
  if (!read.ok) return skippable(read.error, `${where} fdinfo`);
  if (read.value.bytesRead === buffer.length)
    return broken(`${where} fdinfo over ${FDINFO_LIMIT} bytes`);
  const info = buffer.toString("utf8", 0, read.value.bytesRead);
  const flags = /^flags:\s+([0-7]+)/mu.exec(info)?.[1];
  if (flags === undefined) return broken(`${where} fdinfo has no flags`);
  // A read-only holder does not make a row.
  if ((Number.parseInt(flags, 8) & 3) === 0) return fine;
  // Only the wrapper's argv carries the command; other holders add none.
  const command = await wrapperCommand(base);
  found.set(name, found.get(name) ?? command);
  return fine;
}

/** Scans one /proc entry. Only same-UID processes are inspected. */
async function scanProcess(
  pid: string,
  proc: string,
  uid: number,
  taskDir: string,
  found: Map<string, string | undefined>,
): Promise<Verdict> {
  const base = join(proc, pid);
  const owner = await settle(stat(base));
  if (!owner.ok) return skippable(owner.error, `pid ${pid}`);
  if (owner.value.uid !== uid) return fine;
  const listed = await settle(entries(join(base, "fd"), FD_LIMIT));
  if (!listed.ok) return skippable(listed.error, `pid ${pid} fd listing`);
  // Over FD_LIMIT: skipped, a documented blind spot rather than an unknown scan; see README.
  const fds = listed.value;
  if (fds === undefined) return fine;
  const verdicts = await Promise.all(
    fds
      .filter((fd) => /^\d+$/u.test(fd))
      .map((fd) => inspectFd(pid, base, fd, taskDir, found)),
  );
  return verdicts.find((verdict) => !verdict.ok) ?? fine;
}

/** The row for one running task, or `ok` without a row when the file finished before its stat. */
async function rowOf(
  taskDir: string,
  name: string,
  command: string | undefined,
  now: number,
): Promise<{ ok: true; row?: ShellRow } | { ok: false; reason: string }> {
  const stated = await settle(stat(join(taskDir, name)));
  if (!stated.ok) {
    if (gone(stated.error)) return { ok: true };
    return { ok: false, reason: `${name} unreadable: ${code(stated.error)}` };
  }
  const birth = stated.value.birthtimeMs;
  if (!Number.isFinite(birth) || birth <= 0 || birth > now)
    return { ok: false, reason: `${name} has no usable birth time` };
  const row: ShellRow = {
    id: name.slice(0, -7),
    seconds: Math.floor((now - birth) / 1000),
  };
  if (command !== undefined) row.command = command;
  return { ok: true, row };
}

/**
 * Running shells: the same-UID processes holding a session task output file open
 * for writing, found from the bounded /proc scan. The task directory is not listed,
 * so its size cannot hide a running shell. Every unknown carries its reason.
 */
export async function scanShells(
  cwd: string | undefined,
  session: string | undefined,
  options: {
    proc?: string;
    temp?: string;
    uid?: number;
    now?: number;
    projectDir?: string | undefined;
  } = {},
): Promise<ShellScan> {
  const uid = options.uid ?? process.getuid?.();
  if (uid === undefined) return unknown("no process uid");
  if (cwd === undefined) return unknown("session cwd unknown");
  if (session === undefined) return unknown("session id unknown");
  if (!/^[a-zA-Z0-9-]+$/u.test(session))
    return unknown("session id has characters outside [a-zA-Z0-9-]");
  const proc = options.proc ?? "/proc";
  // Claude Code names the task directory after the project root, not the shell's directory.
  const root =
    options.projectDir !== undefined && options.projectDir !== ""
      ? options.projectDir
      : cwd;
  const slug = root.replaceAll(/[^a-zA-Z0-9]/gu, "-");
  const taskDir = join(
    options.temp ?? tmpdir(),
    `claude-${uid}`,
    slug,
    session,
    "tasks",
  );
  const work = async (): Promise<ShellScan> => {
    // Existence only: the directory is never listed, so its size cannot hide a shell.
    const tasks = await settle(stat(taskDir));
    if (!tasks.ok) return unknown(`tasks dir unreadable: ${code(tasks.error)}`);
    const listed = await settle(entries(proc, PID_LIMIT));
    if (!listed.ok) return unknown(`/proc unreadable: ${code(listed.error)}`);
    if (listed.value === undefined)
      return unknown(`/proc has more than ${PID_LIMIT} entries`);
    const pids = listed.value.filter((name) => /^\d+$/u.test(name));
    const found = new Map<string, string | undefined>();
    for (let offset = 0; offset < pids.length; offset += 32) {
      const verdicts = await Promise.all(
        pids
          .slice(offset, offset + 32)
          .map((pid) => scanProcess(pid, proc, uid, taskDir, found)),
      );
      const failed = verdicts.find((verdict) => !verdict.ok);
      if (failed !== undefined && !failed.ok) return unknown(failed.reason);
    }
    const now = options.now ?? Temporal.Now.instant().epochMilliseconds;
    const rows: ShellRow[] = [];
    for (const [name, command] of found) {
      const next = await rowOf(taskDir, name, command, now);
      if (!next.ok) return unknown(next.reason);
      if (next.row !== undefined) rows.push(next.row);
    }
    return {
      kind: "known",
      rows: rows.toSorted((a, b) => b.seconds - a.seconds),
    };
  };
  return work().catch((error: unknown) =>
    unknown(`scan failed: ${code(error)}`),
  );
}

const cells = (text: string) => Array.from(text).length;

/** `/abs/dir/name` becomes `name`, keeping shell quotes; other tokens are unchanged. */
function shortenToken(token: string): string {
  const match = /^(["']?)((?:~)?\/.*?)(["']?)$/u.exec(token);
  if (match === null) return token;
  const path = (match[2] ?? "").replace(/\/+$/u, "");
  const name = basename(path);
  return name === "" || name === "/" ? token : `${match[1]}${name}${match[3]}`;
}

/**
 * Compact a command for one row: whole tokens only, absolute paths reduced to
 * their basename, and a trailing " …" when tokens were dropped. Undefined when
 * even the first token does not fit, so the caller omits the command.
 */
export function compactCommand(
  command: string,
  budget: number,
): string | undefined {
  const tokens = command
    .split(/\s+/u)
    .filter((token) => token !== "")
    .map((token) => shortenToken(token));
  if (tokens.length === 0) return undefined;
  const whole = tokens.join(" ");
  if (cells(whole) <= budget) return whole;
  let kept = 0;
  let length = 0;
  for (const token of tokens) {
    const next = kept === 0 ? cells(token) : length + 1 + cells(token);
    // Reserve room for " …" while tokens remain after this one.
    const reserve = kept + 1 < tokens.length ? 2 : 0;
    if (next + reserve > budget) break;
    length = next;
    kept += 1;
  }
  if (kept === 0) return undefined;
  return `${tokens.slice(0, kept).join(" ")} …`;
}

/**
 * One line per running shell, identified by task id and elapsed time.
 * `columns` bounds the command to the remaining row width.
 */
export function shellLines(scan: ShellScan, columns?: number): string {
  if (scan.kind === "unknown") return `shells: unknown (${scan.reason})`;
  const width = columns ?? DEFAULT_COLUMNS;
  // Align the rows as columns: ids left-aligned, ages right-aligned, so every "│" lines up
  // (12m59s over 2m15s). Ids and ages are ASCII, so string length is cell width.
  const ages = scan.rows.map((row) => dur(row.seconds));
  const idWidth = Math.max(0, ...scan.rows.map((row) => row.id.length));
  const ageWidth = Math.max(0, ...ages.map((age) => age.length));
  return scan.rows
    .map((row, index) => {
      const prefix = `sh_${row.id.padEnd(idWidth)} ${(ages[index] ?? "").padStart(ageWidth)}`;
      // Same shape as a worker row ("│ working · <activity>"): a running shell's activity is its command.
      const room = width - cells(prefix);
      if (room < SHELL_STATE_CELLS) return prefix;
      const lead = `${prefix} ${DIM}│${RST} working`;
      if (row.command === undefined) return lead;
      const command = compactCommand(row.command, room - SHELL_ACTIVITY_CELLS);
      return command === undefined ? lead : `${lead} · $ ${command}`;
    })
    .join("\n");
}
