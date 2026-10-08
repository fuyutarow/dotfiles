import {
  appendFileSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  statSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fromThrowable, z } from "../../../shared/src/zod.ts";

export type Probe<T> = { ok: true; value: T } | { ok: false; error: string };
type ProcResult<T> = { ok: true; value: T } | { ok: false; error: unknown };
export type OpenPath = { pid: number; via: string; path: string };
export type OpenPaths = { open: OpenPath[]; unknown: string[] };
export type ProcFs = {
  readText: (path: string) => string | Error;
  readlink: (path: string) => string | Error;
  readdir: (path: string) => string[] | Error;
  uid: (path: string) => number | Error;
  stat: (path: string) => { uid: number; mode: number } | Error;
};
export const procFs: ProcFs = {
  readText: (path) => readFileSync(path, "utf8"),
  readlink: readlinkSync,
  readdir: readdirSync,
  uid: (path) => statSync(path).uid,
  stat: (path) => {
    const value = statSync(path);
    return { uid: value.uid, mode: value.mode };
  },
};
export type ProcOptions = {
  procRoot?: string;
  uid?: number;
  ignoreUnreadableProcs?: readonly string[];
  fs?: ProcFs;
};
export type ProcessSnapshot = {
  environSessionIds: Probe<string[]>;
  openPaths: (dir: string) => OpenPaths;
};
const errorCode = (error: unknown): string | undefined => {
  const parsed = z.object({ code: z.string().optional() }).safeParse(error);
  return parsed.success ? parsed.data.code : undefined;
};
const gone = (error: unknown): boolean =>
  ["ENOENT", "ESRCH"].includes(errorCode(error) ?? "");
const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
const procResult = <T>(operation: () => T | Error): ProcResult<T> => {
  const result = fromThrowable(operation)();
  if (result.isErr()) return { ok: false, error: result.error };
  return result.value instanceof Error
    ? { ok: false, error: result.value }
    : { ok: true, value: result.value };
};
const cleaned = (path: string): string => path.replace(/ \(deleted\)$/u, "");
const under = (path: string, dir: string): boolean =>
  path === dir || path.startsWith(`${dir}/`);
type ProcStat = { state: string; starttime: string };
const processStat = (text: string): ProcStat | undefined => {
  const close = text.lastIndexOf(")");
  if (close < 0) return undefined;
  const fields = text
    .slice(close + 1)
    .trim()
    .split(/\s+/u);
  const state = fields[0];
  const starttime = fields[19];
  return state === undefined || starttime === undefined
    ? undefined
    : { state, starttime };
};
function traceUnknown(
  item: { uid: number | undefined; detail: string },
  root: string,
  fs: ProcFs,
): void {
  const pid = /pid (\d+)/u.exec(item.detail)?.[1];
  if (pid === undefined) {
    console.error(`proc scan unknown uid=${item.uid}: ${item.detail}`);
    return;
  }
  const base = join(root, pid);
  const comm = procResult<string>(() => fs.readText(join(base, "comm")));
  const stat = procResult<string>(() => fs.readText(join(base, "stat")));
  const cwd = procResult<string>(() => fs.readlink(join(base, "cwd")));
  appendFileSync(
    "/dev/shm/lx7-trace.txt",
    `uid=${item.uid} pid=${pid} comm=${comm.ok ? comm.value.trim() : "unavailable"} state=${stat.ok ? (processStat(stat.value)?.state ?? "malformed") : "unavailable"} cwd=${cwd.ok ? cwd.value : "unavailable"} fact=${item.detail}\n`,
  );
}

const eaccesIdentity = (base: string, fs: ProcFs): string => {
  const comm = procResult<string>(() => fs.readText(join(base, "comm")));
  const stat = procResult<string>(() => fs.readText(join(base, "stat")));
  const status = procResult<string>(() => fs.readText(join(base, "status")));
  const state = stat.ok
    ? (processStat(stat.value)?.state ?? "malformed")
    : "unavailable";
  const uidLine = status.ok
    ? (/^Uid:.*$/mu.exec(status.value)?.[0] ?? "unavailable")
    : "unavailable";
  return `comm=${comm.ok ? comm.value.trim() : "unavailable"} state=${state} uid_line=${uidLine}`;
};

/** Only an EACCES on cwd/fd/environ of an exactly allowlisted process is exempt. */
export function ignoreUnreadableProcess(
  error: unknown,
  base: string,
  names: readonly string[],
  fs: ProcFs,
): boolean {
  if (errorCode(error) !== "EACCES" || names.length === 0) return false;
  const comm = procResult<string>(() => fs.readText(join(base, "comm")));
  if (comm.ok && names.includes(comm.value.trim())) return true;
  const exe = procResult<string>(() => fs.readlink(join(base, "exe")));
  return exe.ok && names.includes(basename(cleaned(exe.value)));
}

/** One same-uid scan supplies BOTH environment liveness and cwd/fd evidence. */
export function collectProcesses(options: ProcOptions = {}): ProcessSnapshot {
  const root = options.procRoot ?? "/proc";
  const uid = options.uid ?? process.getuid?.() ?? 0;
  const fs = options.fs ?? procFs;
  const allow = options.ignoreUnreadableProcs ?? [];
  const paths: OpenPath[] = [];
  const ids: string[] = [];
  const unknown: { uid: number | undefined; detail: string }[] = [];
  const initialStats = new Map<number, ProcResult<ProcStat>>();
  const eaccesOutcomes = new Map<number, "gone" | "ignored" | "unknown">();
  const names = procResult<string[]>(() => fs.readdir(root));
  if (!names.ok)
    unknown.push({
      uid: undefined,
      detail: `${root}: ${message(names.error)}`,
    });
  for (const name of names.ok ? names.value : []) {
    if (!/^\d+$/u.test(name)) continue;
    const pid = Number(name);
    const base = join(root, name);
    const owner = procResult<number>(() => fs.uid(base));
    // Only a process positively identified as ours can affect the verdict.
    if (!owner.ok) continue;
    if (owner.value !== uid) continue;
    const initialStat = procResult<ProcStat>(() => {
      const text = fs.readText(join(base, "stat"));
      if (text instanceof Error) return text;
      const value = processStat(text);
      return value ?? new Error(`pid ${pid}: missing proc stat fields`);
    });
    initialStats.set(pid, initialStat);
    if (initialStat.ok && initialStat.value.state === "Z") continue;
    const sameUidEacces = (): "gone" | "ignored" | "unknown" => {
      const cached = eaccesOutcomes.get(pid);
      if (cached !== undefined) return cached;
      const before = initialStats.get(pid);
      let outcome: "gone" | "ignored" | "unknown" = "unknown";
      if (before?.ok !== true) {
        eaccesOutcomes.set(pid, outcome);
        return outcome;
      }
      const current = procResult<ProcStat>(() => {
        const text = fs.readText(join(base, "stat"));
        if (text instanceof Error) return text;
        const value = processStat(text);
        return value ?? new Error(`pid ${pid}: missing proc stat fields`);
      });
      const allowlistedComm = (): boolean => {
        const comm = procResult<string>(() => fs.readText(join(base, "comm")));
        return comm.ok && allow.includes(comm.value.trim());
      };
      if (!current.ok && gone(current.error)) outcome = "gone";
      else if (current.ok && current.value.state === "Z") outcome = "gone";
      else if (current.ok && current.value.starttime !== before.value.starttime)
        outcome = "gone";
      else if (current.ok && allowlistedComm()) outcome = "ignored";
      eaccesOutcomes.set(pid, outcome);
      return outcome;
    };
    const probe = <T>(via: string, read: () => T | Error): T | undefined => {
      const result = procResult<T>(read);
      if (result.ok) return result.value;
      const unreadable =
        errorCode(result.error) === "EACCES" ? sameUidEacces() : null;
      if (
        !gone(result.error) &&
        unreadable !== "gone" &&
        unreadable !== "ignored" &&
        (unreadable === null
          ? !ignoreUnreadableProcess(result.error, base, allow, fs)
          : true)
      )
        unknown.push({
          uid: owner.value,
          detail: `pid ${pid} ${via}: ${message(result.error)}${errorCode(result.error) === "EACCES" ? ` [${eaccesIdentity(base, fs)}]` : ""}`,
        });
      return undefined;
    };
    const environ = probe("environ", () => fs.readText(join(base, "environ")));
    ids.push(
      ...(environ?.split("\0") ?? [])
        .filter((entry) => entry.startsWith("CLAUDE_CODE_SESSION_ID="))
        .map((entry) => entry.slice("CLAUDE_CODE_SESSION_ID=".length)),
    );
    const pathProbe = (via: string) => {
      const path = probe(via, () => {
        const value = fs.readlink(join(base, via));
        return value instanceof Error ? value : cleaned(value);
      });
      if (path !== undefined && path.startsWith("/"))
        paths.push({ pid, via, path });
    };
    pathProbe("exe");
    pathProbe("cwd");
    const fds = probe("fd", () => fs.readdir(join(base, "fd")));
    for (const fd of fds ?? []) pathProbe(`fd/${fd}`);
  }
  if (process.env.RECLAIM_PROC_TRACE === "1" && unknown.length > 0)
    unknown.forEach((item) => {
      traceUnknown(item, root, fs);
    });
  return {
    environSessionIds:
      unknown.length === 0
        ? { ok: true, value: ids }
        : { ok: false, error: unknown.map(({ detail }) => detail).join("; ") },
    openPaths: (dir) => ({
      open: paths.filter((p) => under(p.path, resolve(dir))),
      unknown: unknown.map(({ detail }) => detail),
    }),
  };
}

export function openPathsUnder(
  dir: string,
  uid = process.getuid?.() ?? 0,
  options: Omit<ProcOptions, "uid"> = {},
): OpenPaths {
  return collectProcesses({ ...options, uid }).openPaths(dir);
}
