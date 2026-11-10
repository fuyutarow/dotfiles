import { opendir, open, readlink, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { dur } from "./jobs.ts";
import { z } from "./zod.ts";

const PID_LIMIT = 8192;
const FD_LIMIT = 256;
const TASK_LIMIT = 2048;
const CMDLINE_LIMIT = 16384;
/** Label budget when the render has no known terminal width. */
const DEFAULT_COLUMNS = 80;
const EVAL_OPEN = "eval '";
const WRAPPER_TAIL = "' < /dev/null && pwd -P >|";
export type ShellRow = { id: string; seconds: number; command?: string };
export type ShellScan =
  | { kind: "known"; rows: ShellRow[] }
  | { kind: "unknown" };
const unknown: ShellScan = { kind: "unknown" };
const errorSchema = z.object({ code: z.string().optional() });

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
  const opened = await open(join(base, "cmdline"), "r").then(
    (handle) => ({ handle }),
    () => null,
  );
  if (opened === null) return undefined;
  await using handle = opened.handle;
  const buffer = Buffer.alloc(CMDLINE_LIMIT);
  const bytes = await handle.read(buffer, 0, buffer.length, 0).then(
    (read) => read.bytesRead,
    () => null,
  );
  if (bytes === null) return undefined;
  return commandFromWrapper(
    buffer.toString("utf8", 0, bytes).replaceAll("\0", " "),
  );
}

/** Read only same-UID proc entries. Any incomplete scan is unknown, never an empty result. */
export async function scanShells(
  cwd: string | undefined,
  session: string | undefined,
  options: { proc?: string; temp?: string; uid?: number; now?: number } = {},
): Promise<ShellScan> {
  const uid = options.uid ?? process.getuid?.();
  if (
    uid === undefined ||
    cwd === undefined ||
    session === undefined ||
    !/^[a-zA-Z0-9-]+$/u.test(session)
  )
    return unknown;
  const proc = options.proc ?? "/proc";
  const slug = cwd.replaceAll(/[^a-zA-Z0-9]/gu, "-");
  const taskDir = join(
    options.temp ?? tmpdir(),
    `claude-${uid}`,
    slug,
    session,
    "tasks",
  );
  const work = async (): Promise<ShellScan> => {
    const names = await entries(taskDir, TASK_LIMIT);
    const processes = await entries(proc, PID_LIMIT);
    if (names === undefined || processes === undefined) return unknown;
    const taskSet = new Set(
      names.filter((name) => /^[a-zA-Z0-9-]+\.output$/u.test(name)),
    );
    const pids = processes.filter((name) => /^\d+$/u.test(name));
    const found = new Map<string, { command: string | undefined }>();
    for (let offset = 0; offset < pids.length; offset += 32) {
      const outcomes = await Promise.all(
        pids.slice(offset, offset + 32).map(async (pid) => {
          const base = join(proc, pid);
          return Promise.try(async () => {
            if ((await stat(base)).uid !== uid) return true;
            const listed = await entries(join(base, "fd"), FD_LIMIT).then(
              (fds) => ({ failed: false as const, fds }),
              (error: unknown) => ({ failed: true as const, error }),
            );
            if (listed.failed)
              return refused(listed.error) || gone(listed.error);
            // undefined: over FD_LIMIT. Skipped, not evidence of an unreadable source; see README.
            if (listed.fds === undefined) return true;
            const fds = listed.fds;
            const results = await Promise.all(
              fds.map(async (fd) =>
                Promise.try(async () => {
                  const linked = await readlink(join(base, "fd", fd)).then(
                    (target) => ({ failed: false as const, target }),
                    (error: unknown) => ({ failed: true as const, error }),
                  );
                  if (linked.failed)
                    return refused(linked.error) || gone(linked.error);
                  const target = linked.target;
                  const name = target.startsWith(`${taskDir}/`)
                    ? target.slice(taskDir.length + 1)
                    : "";
                  if (!taskSet.has(name)) return true;
                  await using handle = await open(
                    join(base, "fdinfo", fd),
                    "r",
                  );
                  const buffer = Buffer.alloc(4096);
                  const read = await handle.read(buffer, 0, buffer.length, 0);
                  if (read.bytesRead === buffer.length) return false;
                  const info = buffer.toString("utf8", 0, read.bytesRead);
                  const flags = /^flags:\s+([0-7]+)/mu.exec(info)?.[1];
                  if (flags === undefined) return false;
                  if ((Number.parseInt(flags, 8) & 3) !== 0) {
                    // Only the wrapper's argv carries the command; other holders add no command.
                    const command = await wrapperCommand(base);
                    const known = found.get(name);
                    if (known === undefined) found.set(name, { command });
                    else known.command ??= command;
                    // known.command stays undefined until a wrapper argv supplies one.
                  }
                  return true;
                }).catch(gone),
              ),
            );
            return results.every(Boolean);
          }).catch(gone);
        }),
      );
      if (!outcomes.every(Boolean)) return unknown;
    }
    const now = options.now ?? Temporal.Now.instant().epochMilliseconds;
    const rows = await Promise.all(
      [...found].map(async ([name, { command }]) => {
        const birth = (await stat(join(taskDir, name))).birthtimeMs;
        if (!Number.isFinite(birth) || birth <= 0 || birth > now) return null;
        const row: ShellRow = {
          id: name.slice(0, -7),
          seconds: Math.floor((now - birth) / 1000),
        };
        if (command !== undefined) row.command = command;
        return row;
      }),
    );
    if (rows.some((row) => row === null)) return unknown;
    return {
      kind: "known",
      rows: rows
        .filter((row) => row !== null)
        .toSorted((a, b) => b.seconds - a.seconds),
    };
  };
  return work().catch(() => unknown);
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
  if (scan.kind === "unknown") return "shells: unknown";
  const width = columns ?? DEFAULT_COLUMNS;
  return scan.rows
    .map((row) => {
      const prefix = `sh_${row.id} ${dur(row.seconds)}`;
      const command =
        row.command === undefined
          ? undefined
          : compactCommand(row.command, width - cells(prefix) - 1);
      return command === undefined ? prefix : `${prefix} ${command}`;
    })
    .join("\n");
}
