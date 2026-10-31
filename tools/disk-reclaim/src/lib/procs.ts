import {
  appendFileSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  statSync,
} from "node:fs";
import { consola } from "consola";
import { basename, join, resolve } from "node:path";
import { fromThrowable, z } from "@dotfiles/shared/src/zod.ts";

export type Probe<T> = { ok: true; value: T } | { ok: false; error: string };
type ProcResult<T> = { ok: true; value: T } | { ok: false; error: unknown };
export type OpenPath = { pid: number; via: string; path: string };
export type OpenPaths = { open: OpenPath[]; unknown: string[] };
export type ProcessFact = {
  pid: number;
  comm: string | undefined;
  exe: string | undefined;
  cwd: string | undefined;
  environ: string | undefined;
  openPaths: string[];
};
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
  diagnostics?: (summary: string, details: string[]) => void;
  procRoot?: string;
  uid?: number;
  ignoreUnreadableProcs?: readonly string[];
  fs?: ProcFs;
};
export const resolveProcRoot = (root?: string): string =>
  root ??
  process.env["RECLAIM_UNIT_PROC_ROOT"] ??
  process.env["RECLAIM_TEST_PROC_ROOT"] ??
  "/proc";
export type ProcessSnapshot = {
  environSessionIds: Probe<string[]>;
  processes: ProcessFact[];
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
const expectedUnreadableNames = [
  "systemd", // systemd --user runs as the session owner and may be non-dumpable.
  "sudo", // sudo crosses a privilege boundary before dropping elevated credentials.
  "su", // su crosses a privilege boundary before changing user identity.
  "polkitd", // The system polkit daemon runs with a different privilege context.
  "sshd", // OpenSSH sshd uses privilege separation for authenticated sessions.
  "sshd-session", // OpenSSH 9.8+ uses this per-connection session process.
  "(sd-pam)", // systemd's PAM session monitor can be non-dumpable under procfs.
];
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
    consola.error(`proc scan unknown uid=${item.uid}: ${item.detail}`);
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
  const exe = procResult<string>(() => fs.readlink(join(base, "exe")));
  const stat = procResult<string>(() => fs.readText(join(base, "stat")));
  const status = procResult<string>(() => fs.readText(join(base, "status")));
  const state = stat.ok
    ? (processStat(stat.value)?.state ?? "malformed")
    : "unavailable";
  const uidLine = status.ok
    ? (/^Uid:.*$/mu.exec(status.value)?.[0] ?? "unavailable")
    : "unavailable";
  return `comm=${comm.ok ? comm.value.trim() : "unavailable"} exe=${exe.ok ? cleaned(exe.value) : "unavailable"} state=${state} uid_line=${uidLine}`;
};

/** Only an EACCES on proc facts of an exactly allowlisted process is exempt. */
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

/** One same-uid scan supplies independent environment-liveness and path evidence. */
export function collectProcesses(options: ProcOptions = {}): ProcessSnapshot {
  const root = resolveProcRoot(options.procRoot);
  const uid = options.uid ?? process.getuid?.() ?? 0;
  const fs = options.fs ?? procFs;
  const allow = options.ignoreUnreadableProcs ?? [];
  const paths: OpenPath[] = [];
  const processes: ProcessFact[] = [];
  const ids: string[] = [];
  const pathUnknown: { uid: number | undefined; detail: string }[] = [];
  const environUnknown: { uid: number | undefined; detail: string }[] = [];
  const expectedFailures: string[] = [];
  const initialStats = new Map<number, ProcResult<ProcStat>>();
  const eaccesOutcomes = new Map<
    number,
    "gone" | "ignored" | "expected" | "unknown"
  >();
  const names = procResult<string[]>(() => fs.readdir(root));
  if (!names.ok)
    for (const unknown of [pathUnknown, environUnknown])
      unknown.push({
        uid: undefined,
        detail: `process scan unavailable: ${root}: ${message(names.error)}`,
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
    const sameUidEacces = (): "gone" | "ignored" | "expected" | "unknown" => {
      const cached = eaccesOutcomes.get(pid);
      if (cached !== undefined) return cached;
      const before = initialStats.get(pid);
      let outcome: "gone" | "ignored" | "expected" | "unknown" = "unknown";
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
      const matchesIdentity = (processNames: readonly string[]): boolean => {
        const comm = procResult<string>(() => fs.readText(join(base, "comm")));
        if (comm.ok && processNames.includes(comm.value.trim())) return true;
        const exe = procResult<string>(() => fs.readlink(join(base, "exe")));
        return exe.ok && processNames.includes(basename(cleaned(exe.value)));
      };
      if (!current.ok && gone(current.error)) outcome = "gone";
      else if (current.ok && current.value.state === "Z") outcome = "gone";
      else if (current.ok && current.value.starttime !== before.value.starttime)
        outcome = "gone";
      else if (current.ok && matchesIdentity(expectedUnreadableNames))
        outcome = "expected";
      else if (current.ok && matchesIdentity(allow)) outcome = "ignored";
      eaccesOutcomes.set(pid, outcome);
      return outcome;
    };
    const probe = <T>(
      via: string,
      read: () => T | Error,
      scope: "paths" | "environ" | "none" = "paths",
    ): T | undefined => {
      const result = procResult<T>(read);
      if (result.ok) return result.value;
      const unreadable =
        errorCode(result.error) === "EACCES" ? sameUidEacces() : null;
      const unknown = scope === "environ" ? environUnknown : pathUnknown;
      if (scope !== "none" && unreadable === "expected")
        expectedFailures.push(
          `pid ${pid} ${via}: ${message(result.error)} [expected-unreadable ${eaccesIdentity(base, fs)}]`,
        );
      if (
        scope !== "none" &&
        !gone(result.error) &&
        unreadable !== "gone" &&
        unreadable !== "ignored" &&
        unreadable !== "expected" &&
        (unreadable === null
          ? !ignoreUnreadableProcess(result.error, base, allow, fs)
          : true)
      )
        unknown.push({
          uid: owner.value,
          detail: `pid ${pid} ${via}: ${message(result.error)} [${eaccesIdentity(base, fs)}]`,
        });
      return undefined;
    };
    const environ = probe(
      "environ",
      () => fs.readText(join(base, "environ")),
      "environ",
    );
    ids.push(
      ...(environ?.split("\0") ?? [])
        .filter((entry) => entry.startsWith("CLAUDE_CODE_SESSION_ID="))
        .map((entry) => entry.slice("CLAUDE_CODE_SESSION_ID=".length)),
    );
    const pathProbe = (via: string): string | undefined => {
      const path = probe(via, () => {
        const value = fs.readlink(join(base, via));
        return value instanceof Error ? value : cleaned(value);
      });
      if (path !== undefined && path.startsWith("/")) {
        paths.push({ pid, via, path });
        return path;
      }
      return undefined;
    };
    const exe = pathProbe("exe");
    const cwd = pathProbe("cwd");
    const fds = probe("fd", () => fs.readdir(join(base, "fd")));
    const openPaths = (fds ?? []).flatMap((fd) => {
      const path = pathProbe(`fd/${fd}`);
      return path === undefined ? [] : [path];
    });
    const comm = probe(
      "comm",
      () => fs.readText(join(base, "comm")),
      "none",
    )?.trim();
    const maps = probe("maps", () => fs.readText(join(base, "maps"))) ?? "";
    const mappedPaths = maps.split("\n").flatMap((line) => {
      const [, encodedPath] =
        /^[\da-fA-F]+-[\da-fA-F]+\s+\S+\s+\S+\s+\S+\s+\d+\s+(\/.*)$/u.exec(
          line,
        ) ?? [];
      if (encodedPath === undefined) return [];
      const path = cleaned(
        encodedPath.replaceAll(/\\([0-7]{3})/gu, (_escape, octal: string) =>
          String.fromCodePoint(Number.parseInt(octal, 8)),
        ),
      );
      return path.startsWith("/") ? [path] : [];
    });
    paths.push(...mappedPaths.map((path) => ({ pid, via: "maps", path })));
    processes.push({
      pid,
      comm: comm === "" ? undefined : comm,
      exe,
      cwd,
      environ,
      openPaths: [...openPaths, ...mappedPaths],
    });
  }
  if (process.env["RECLAIM_PROC_TRACE"] === "1" && pathUnknown.length > 0)
    pathUnknown.forEach((item) => {
      traceUnknown(item, root, fs);
    });
  const details = [
    ...new Set(
      [...pathUnknown, ...environUnknown]
        .map(({ detail }) => detail)
        .concat(expectedFailures),
    ),
  ];
  for (const summary of summarizeProcessFailures(details))
    options.diagnostics?.(summary, details);
  return {
    environSessionIds:
      environUnknown.length === 0
        ? { ok: true, value: ids }
        : {
            ok: false,
            error: environUnknown.map(({ detail }) => detail).join("; "),
          },
    processes,
    openPaths: (dir) => ({
      open: paths.filter((p) => under(p.path, resolve(dir))),
      unknown: pathUnknown.map(({ detail }) => detail),
    }),
  };
}

/** Presentation groups causes; the underlying unknown facts keep their safety meaning. */
export function summarizeProcessFailures(details: readonly string[]): string[] {
  const groups = new Map<
    string,
    { fds: number; probes: number; pids: Set<string>; expected: boolean }
  >();
  for (const detail of details) {
    const code =
      /\b(EACCES|EPERM|ENOENT|ESRCH)\b/u.exec(detail)?.[1] ?? "unavailable";
    const expected =
      code === "EACCES" && detail.includes("[expected-unreadable ");
    const key = `${code}${expected ? "; expected permission boundary (non-dumpable process)" : ""}`;
    const group = groups.get(key) ?? {
      fds: 0,
      probes: 0,
      pids: new Set<string>(),
      expected,
    };
    group.probes++;
    if (/ fd\/\d+:/u.test(detail)) group.fds++;
    const pid = /pid (\d+)/u.exec(detail)?.[1];
    if (pid !== undefined) group.pids.add(pid);
    groups.set(key, group);
  }
  return [...groups].map(
    ([cause, group]) =>
      `live-process scan: ${group.fds} fds (${group.probes} probes) in ${group.pids.size} processes unreadable (${cause}) — ${group.expected ? "expected, not a probe problem; excluded from in-use evidence, no effect on targets" : "treated as unknown; idle-dependent candidates remain ASK unless positive use proves KEEP"}`,
  );
}

export function processDecisionText(text: string): string {
  // Plan reasons must retain pid/comm/exe so the owner can identify unknown processes.
  return text;
}
