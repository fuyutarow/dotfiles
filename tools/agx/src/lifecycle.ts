// Run-local filesystem and process-tree observations. Missing observations fail open:
// a worker may be stopped as stalled only when every input is known to be flat.
import { existsSync, lstatSync, writeFileSync } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fromThrowable } from "neverthrow";
import { attempt, errorMessage } from "../../shared/src/attempt.ts";

export const DEFAULT_STALL_S = 600;
export type FileStamp = { mtime_ms: number; size: number };
export type FileSnapshot = Map<string, FileStamp>;

export function workspaceRoot(cwd: string): string {
  let directory = resolve(cwd);
  while (
    !existsSync(join(directory, ".git")) &&
    !existsSync(join(directory, ".jj"))
  ) {
    const parent = dirname(directory);
    if (parent === directory) return resolve(cwd);
    directory = parent;
  }
  return directory;
}

export function fileStamp(path: string): FileStamp | undefined {
  const result = fromThrowable(() => lstatSync(path))();
  if (result.isErr()) return undefined;
  return { mtime_ms: result.value.mtimeMs, size: result.value.size };
}

export function sameStamp(
  a: FileStamp | undefined,
  b: FileStamp | undefined,
): boolean {
  return a?.mtime_ms === b?.mtime_ms && a?.size === b?.size;
}

const EXCLUDED_DIRECTORIES = new Set([".git", ".jj", "node_modules"]);
const SNAPSHOT_MAX_ENTRIES = 20_000;

/** Scan only a glob's fixed prefix, prune tool-owned trees before traversal, and yield
 * to the event loop. An incomplete snapshot is unavailable, never evidence of flatness. */
export async function declaredFiles(
  root: string,
  writes: string[],
  options: { signal?: AbortSignal; budgetMs?: number } = {},
): Promise<FileSnapshot | undefined> {
  const result: FileSnapshot = new Map();
  if (writes.length === 0) return result;
  const signal = AbortSignal.any([
    AbortSignal.timeout(options.budgetMs ?? 500),
    ...(options.signal === undefined ? [] : [options.signal]),
  ]);
  let entries = 0;
  const queueDirectory = async (
    path: string,
    pending: string[],
  ): Promise<boolean> => {
    const children = await attempt(() =>
      readdir(join(root, path), { withFileTypes: true }),
    );
    if (!children.ok || entries + children.value.length > SNAPSHOT_MAX_ENTRIES)
      return false;
    pending.push(
      ...children.value
        .filter((entry) => !EXCLUDED_DIRECTORIES.has(entry.name))
        .map((entry) => (path === "" ? entry.name : `${path}/${entry.name}`)),
    );
    return true;
  };
  const scan = async (glob: string): Promise<boolean> => {
    const parts = glob.split("/");
    const wildcard = parts.findIndex((part) => /[*?[{]/u.test(part));
    const prefix = wildcard < 0 ? glob : parts.slice(0, wildcard).join("/");
    if (prefix.split("/").some((part) => EXCLUDED_DIRECTORIES.has(part)))
      return true;
    const matcher = new Bun.Glob(glob);
    const pending = [prefix];
    while (pending.length > 0) {
      if (signal.aborted || entries >= SNAPSHOT_MAX_ENTRIES) return false;
      const path = pending.pop() ?? "";
      const info = await attempt(() => lstat(join(root, path)));
      entries += 1;
      if (!info.ok) continue;
      if (info.value.isDirectory() && !(await queueDirectory(path, pending)))
        return false;
      if (info.value.isFile() && matcher.match(path))
        result.set(path, {
          mtime_ms: info.value.mtimeMs,
          size: info.value.size,
        });
    }
    return !signal.aborted;
  };
  const scanning = async (): Promise<FileSnapshot | undefined> => {
    for (const glob of writes) {
      if (!(await scan(glob))) return undefined;
    }
    return result;
  };
  // Do not wait for a filesystem operation that outlives the observation's budget/worker.
  const canceled = new Promise<undefined>((done) => {
    signal.addEventListener(
      "abort",
      () => {
        done(undefined);
      },
      { once: true },
    );
  });
  return Promise.race([scanning(), canceled]);
}

export const fileFingerprint = (files: FileSnapshot): string =>
  JSON.stringify([...files].toSorted(([a], [b]) => a.localeCompare(b)));

type CpuProcess = { pid: number; ppid: number; pgid: number; cpu_s: number };

/** BSD ps uses mm:ss.cc; Linux uses [dd-]hh:mm:ss. */
export function cpuSeconds(text: string): number {
  const [days, clock] = text.includes("-") ? text.split("-") : ["0", text];
  const parts = (clock ?? "").split(":").map(Number);
  return (
    Number(days) * 86400 + parts.reduce((total, part) => total * 60 + part, 0)
  );
}

export async function processTreeCpu(
  rootPid: number,
  stop?: AbortSignal,
): Promise<CpuProcess[] | undefined> {
  const signal = AbortSignal.any([
    AbortSignal.timeout(250),
    ...(stop === undefined ? [] : [stop]),
  ]);
  const result = await attempt(async () => {
    const child = Bun.spawn(["ps", "-axo", "pid=,ppid=,pgid=,time="], {
      stdout: "pipe",
      stderr: "pipe",
      signal,
      killSignal: "SIGKILL",
    });
    const [stdout, , exit] = await Promise.all([
      readObservedStream(child.stdout, signal),
      readObservedStream(child.stderr, signal),
      child.exited,
    ]);
    return { stdout, exit };
  });
  if (!result.ok || result.value.exit !== 0 || signal.aborted) return undefined;
  const processes = result.value.stdout.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s*$/u.exec(line);
    if (match === null) return [];
    const cpu = cpuSeconds(match[4] ?? "");
    return Number.isFinite(cpu)
      ? [
          {
            pid: Number(match[1]),
            ppid: Number(match[2]),
            pgid: Number(match[3]),
            cpu_s: cpu,
          },
        ]
      : [];
  });
  if (!processes.some((p) => p.pid === rootPid)) return undefined;
  const members = new Set([rootPid]);
  let previousSize = 0;
  while (previousSize !== members.size) {
    previousSize = members.size;
    processes
      .filter((p) => members.has(p.ppid) || p.pgid === rootPid)
      .forEach((p) => {
        members.add(p.pid);
      });
  }
  return processes.filter((p) => members.has(p.pid));
}

/** Cancellation closes the pipe reader even if a descendant still holds the writer. */
async function readObservedStream(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<string> {
  let text = "";
  const decoder = new TextDecoder();
  await stream.pipeTo(
    new WritableStream<Uint8Array>({
      write(chunk) {
        text += decoder.decode(chunk, { stream: true });
      },
    }),
    { signal },
  );
  return text + decoder.decode();
}

export type StallInputs = {
  cpu_s: number;
  pids: number[];
  writes: [string, FileStamp][];
  output: string;
};

/** Retain exited children's CPU high-water marks instead of subtracting their work. */
export class StallObserver {
  private readonly cpu = new Map<number, number>();
  private fingerprint: string | undefined;
  private flatSince: number;

  constructor(startedMs: number) {
    this.flatSince = startedMs;
  }

  observe(
    nowMs: number,
    processes: CpuProcess[] | undefined,
    files: FileSnapshot | undefined,
    output: string,
  ): { flat_s: number; inputs?: StallInputs } {
    if (processes === undefined || files === undefined) {
      this.fingerprint = undefined;
      this.flatSince = nowMs;
      return { flat_s: 0 };
    }
    for (const p of processes)
      this.cpu.set(p.pid, Math.max(this.cpu.get(p.pid) ?? 0, p.cpu_s));
    const inputs: StallInputs = {
      cpu_s: [...this.cpu.values()].reduce((a, b) => a + b, 0),
      pids: processes.map((p) => p.pid).toSorted((a, b) => a - b),
      writes: [...files].toSorted(([a], [b]) => a.localeCompare(b)),
      output,
    };
    const fingerprint = JSON.stringify(inputs);
    if (fingerprint !== this.fingerprint) this.flatSince = nowMs;
    this.fingerprint = fingerprint;
    return { flat_s: (nowMs - this.flatSince) / 1000, inputs };
  }
}

/** Underlying vendor streams only: wrapper heartbeat messages never advance this file. */
export function activityWriter(
  path = process.env.AGX_WORKER_ACTIVITY_FILE,
): (bytes: number) => void {
  let total = 0;
  return (bytes) => {
    if (path === undefined) return;
    total += bytes;
    void fromThrowable(() => {
      writeFileSync(path, String(total));
    })();
  };
}

export const INTERIM_RETURN_REQUEST =
  'Soft first_return_s checkpoint: send an interim RETURN with "interim": true and current findings if you can, then continue the authorized work. Never stop running jobs or wrap up because of this request. timeout_s remains the hard bound.';

/** Queue guidance for the existing session only; never resume, interrupt or start a worker. */
export async function requestInterimReturn(
  session: string | undefined,
  stop?: AbortSignal,
): Promise<{ sent: boolean; reason?: string }> {
  if (session === undefined)
    return { sent: false, reason: "session not observed by first_return_s" };
  const result = await attempt(async () => {
    const signal = AbortSignal.any([
      AbortSignal.timeout(5_000),
      ...(stop === undefined ? [] : [stop]),
    ]);
    const child = Bun.spawn(
      [
        process.env.AGX_CODEX_BIN ?? "codex",
        "queue",
        "--thread",
        session,
        "--message",
        INTERIM_RETURN_REQUEST,
      ],
      {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        signal,
        killSignal: "SIGKILL",
      },
    );
    const [out, err, exit] = await Promise.all([
      readObservedStream(child.stdout, signal),
      readObservedStream(child.stderr, signal),
      child.exited,
    ]);
    const details = err.trim() === "" ? out : err;
    return exit === 0
      ? { sent: true }
      : {
          sent: false,
          reason: `codex queue exit ${exit}: ${details.trim().slice(-500)}`,
        };
  });
  return result.ok
    ? result.value
    : { sent: false, reason: errorMessage(result.error) };
}
