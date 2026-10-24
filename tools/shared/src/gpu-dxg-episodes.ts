// Read-only /proc evidence collected by the sole GPU sampler after each probe.
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { jsonOf, z } from "./zod.ts";

export const DXG_SCAN_MAX_TASKS = 4096;
export const DXG_SCAN_BUDGET_MS = 1500;
const DXG_LOG_MAX_BYTES = 2 * 1024 * 1024;
const DXG_LOG_MAX_LINES = 4096;
const DXG_LOG_RETAIN_MS = 7 * 24 * 60 * 60_000;

const EpisodeSchema = z.object({
  kind: z.literal("episode"),
  episodeId: z.string(),
  firstSeen: z.number().int().nonnegative(),
  lastSeen: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  tgid: z.number().int().positive(),
  tid: z.number().int().positive(),
  starttime: z.string().regex(/^\d+$/u),
  comm: z.string().max(256),
  cgroup: z.string().max(4096),
  unit: z.string().max(256).nullable(),
  probeSucceeded: z.boolean(),
  closed: z.boolean(),
  scanComplete: z.boolean(),
  observedAt: z.number().int().nonnegative(),
});
const ScanSchema = z.object({
  kind: z.literal("scan"),
  at: z.number().int().nonnegative(),
  probeSucceeded: z.boolean(),
  complete: z.boolean(),
  scannedTasks: z.number().int().nonnegative(),
  reason: z.string().optional(),
});
const LineSchema = z.discriminatedUnion("kind", [EpisodeSchema, ScanSchema]);
type Episode = z.output<typeof EpisodeSchema>;
type Scan = z.output<typeof ScanSchema>;
type LogLine = Episode | Scan;

export type DxgTask = {
  tgid: number;
  tid: number;
  starttime: string;
  comm: string;
  cgroup: string;
  unit: string | null;
};
export type DxgScan = {
  tasks: DxgTask[];
  complete: boolean;
  scannedTasks: number;
  reason?: string;
};
export type DxgEpisodeIo = {
  readdir(path: string): Promise<string[]>;
  read(path: string): Promise<string>;
};
export type DxgEpisodeOptions = {
  procRoot?: string;
  logPath: string;
  maxTasks?: number;
  budgetMs?: number;
  io?: DxgEpisodeIo;
  monotonicNow?: () => number;
};

const defaultIo: DxgEpisodeIo = {
  readdir: (path) => readdir(path),
  read: (path) => readFile(path, "utf8"),
};
function procStat(
  text: string,
): { state: string; starttime: string; comm: string } | undefined {
  const open = text.indexOf("(");
  const close = text.lastIndexOf(")");
  if (open < 0 || close <= open) return undefined;
  const fields = text
    .slice(close + 1)
    .trim()
    .split(/\s+/u);
  const state = fields[0];
  const starttime = fields[19];
  if (
    state === undefined ||
    starttime === undefined ||
    !/^\d+$/u.test(starttime)
  )
    return undefined;
  return { state, starttime, comm: text.slice(open + 1, close).slice(0, 256) };
}
function owningUnit(cgroup: string): string | null {
  const names = cgroup
    .split("\n")
    .map((row) => row.slice(row.lastIndexOf("/") + 1));
  for (let index = names.length - 1; index >= 0; index--) {
    const name = names[index];
    if (name !== undefined && /\.(?:service|scope)$/u.test(name)) return name;
  }
  return null;
}
function taskKey(task: Pick<DxgTask, "tgid" | "tid" | "starttime">): string {
  return `${task.tgid}:${task.tid}:${task.starttime}`;
}
function sameThread(a: Episode, b: DxgTask): boolean {
  return a.tgid === b.tgid && a.tid === b.tid;
}
function errorCode(error: unknown): string | undefined {
  const parsed = z.object({ code: z.string() }).safeParse(error);
  return parsed.success ? parsed.data.code : undefined;
}

async function scanDxg(options: DxgEpisodeOptions): Promise<DxgScan> {
  const root = options.procRoot ?? "/proc";
  const io = options.io ?? defaultIo;
  const now = options.monotonicNow ?? (() => performance.now());
  const start = now();
  const deadline = start + (options.budgetMs ?? DXG_SCAN_BUDGET_MS);
  const maxTasks = options.maxTasks ?? DXG_SCAN_MAX_TASKS;
  let scannedTasks = 0;
  const tasks: DxgTask[] = [];
  let reason: string | undefined;
  const readBounded = async (path: string): Promise<string | undefined> => {
    const remaining = deadline - now();
    if (remaining <= 0) {
      reason = "time budget exhausted";
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<{ kind: "timeout" }>((resolve) => {
      timer = setTimeout(() => {
        resolve({ kind: "timeout" });
      }, remaining);
    });
    const result = await Promise.race([
      io.read(path).then(
        (value) => ({ kind: "value" as const, value }),
        (error: unknown) => ({ kind: "error" as const, error }),
      ),
      timeout,
    ]);
    if (timer !== undefined) clearTimeout(timer);
    if (result.kind === "timeout") {
      reason = "time budget exhausted";
      return undefined;
    }
    if (result.kind === "value") return result.value;
    const code = errorCode(result.error);
    if (code !== "ENOENT" && reason === undefined)
      reason = `cannot read ${path}${code === undefined ? "" : ` (${code})`}`;
    return undefined;
  };
  const listBounded = async (path: string): Promise<string[] | undefined> => {
    const remaining = deadline - now();
    if (remaining <= 0) {
      reason = "time budget exhausted";
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<{ kind: "timeout" }>((resolve) => {
      timer = setTimeout(() => {
        resolve({ kind: "timeout" });
      }, remaining);
    });
    const result = await Promise.race([
      io.readdir(path).then(
        (value) => ({ kind: "value" as const, value }),
        (error: unknown) => ({ kind: "error" as const, error }),
      ),
      timeout,
    ]);
    if (timer !== undefined) clearTimeout(timer);
    if (result.kind === "timeout") {
      reason = "time budget exhausted";
      return undefined;
    }
    if (result.kind === "value") {
      if (now() >= deadline) {
        reason = "time budget exhausted";
        return undefined;
      }
      return result.value;
    }
    const code = errorCode(result.error);
    if (code !== "ENOENT" && reason === undefined)
      reason = `cannot read ${path}${code === undefined ? "" : ` (${code})`}`;
    return undefined;
  };
  const scanLeader = async (
    leader: string,
    remainingTasks: number,
  ): Promise<{ tasks: DxgTask[]; scannedTasks: number }> => {
    const found: DxgTask[] = [];
    let inspected = 0;
    const tids = await listBounded(join(root, leader, "task"));
    if (tids === undefined) return { tasks: found, scannedTasks: inspected };
    for (const tidText of tids.filter((name) => /^\d+$/u.test(name))) {
      if (inspected >= remainingTasks) {
        reason = "task count budget exhausted";
        break;
      }
      if (now() >= deadline) {
        reason = "time budget exhausted";
        break;
      }
      const tid = Number(tidText);
      const tgid = Number(leader);
      inspected++;
      const taskPath = join(root, leader, "task", tidText);
      const statText = await readBounded(join(taskPath, "stat"));
      if (statText === undefined && reason !== undefined) break;
      if (statText === undefined) continue;
      const stat = procStat(statText);
      if (stat === undefined || stat.state !== "D") continue;
      const wchan = await readBounded(join(taskPath, "wchan"));
      if (wchan === undefined && reason !== undefined) break;
      if (wchan === undefined || !/dxg/iu.test(wchan.trim())) continue;
      const cgroup = await readBounded(join(taskPath, "cgroup"));
      if (cgroup === undefined && reason !== undefined) break;
      if (cgroup === undefined) continue;
      found.push({
        tgid,
        tid,
        starttime: stat.starttime,
        comm: stat.comm,
        cgroup: cgroup.slice(0, 4096),
        unit: owningUnit(cgroup),
      });
    }
    return { tasks: found, scannedTasks: inspected };
  };
  const leaders = await listBounded(root);
  if (leaders === undefined)
    return {
      tasks,
      complete: false,
      scannedTasks,
      reason: reason ?? "cannot read proc root",
    };
  for (const leader of leaders.filter((name) => /^\d+$/u.test(name))) {
    if (now() >= deadline) {
      reason = "time budget exhausted";
      break;
    }
    const leaderResult = await scanLeader(leader, maxTasks - scannedTasks);
    tasks.push(...leaderResult.tasks);
    scannedTasks += leaderResult.scannedTasks;
    if (reason !== undefined) break;
  }
  return {
    tasks,
    complete: reason === undefined,
    scannedTasks,
    ...(reason === undefined ? {} : { reason }),
  };
}

async function readLog(path: string, now: number): Promise<LogLine[]> {
  const file = Bun.file(path);
  if (!(await file.exists()) || file.size > DXG_LOG_MAX_BYTES) return [];
  const lines = (await file.text()).split("\n");
  return lines.flatMap((line) => {
    if (line === "") return [];
    const parsed = jsonOf(LineSchema).safeParse(line);
    if (!parsed.success) return [];
    const at =
      parsed.data.kind === "scan" ? parsed.data.at : parsed.data.observedAt;
    return now - at <= DXG_LOG_RETAIN_MS ? [parsed.data] : [];
  });
}
function episodeRecord(
  previous: Episode | undefined,
  task: DxgTask,
  at: number,
  probeSucceeded: boolean,
  scanComplete: boolean,
  closed: boolean,
): Episode {
  const firstSeen = previous?.firstSeen ?? at;
  return {
    kind: "episode",
    episodeId: previous?.episodeId ?? `${taskKey(task)}:${firstSeen}`,
    firstSeen,
    lastSeen: at,
    durationMs: Math.max(0, at - firstSeen),
    ...task,
    probeSucceeded,
    closed,
    scanComplete,
    observedAt: at,
  };
}

/** Scan once and append a bounded receipt plus current/closed episode snapshots. */
export async function recordDxgEpisodes(
  options: DxgEpisodeOptions,
  at: number,
  probeSucceeded: boolean,
): Promise<DxgScan> {
  const scan =
    process.platform === "linux"
      ? await scanDxg(options)
      : {
          tasks: [],
          complete: false,
          scannedTasks: 0,
          reason: "unsupported platform",
        };
  await mkdir(dirname(options.logPath), { recursive: true });
  const retained = await readLog(options.logPath, at).catch(() => []);
  const latest = new Map<string, Episode>();
  for (const line of retained)
    if (line.kind === "episode") latest.set(line.episodeId, line);
  const active = [...latest.values()].filter((episode) => !episode.closed);
  const emitted: Episode[] = [];
  const seen = new Set<string>();
  for (const task of scan.tasks) {
    const key = taskKey(task);
    seen.add(key);
    for (const episode of active.filter(
      (row) => !row.closed && sameThread(row, task) && taskKey(row) !== key,
    )) {
      episode.closed = true;
      episode.observedAt = at;
      episode.scanComplete = scan.complete;
      emitted.push(episode);
    }
    const prior = active.find(
      (episode) => !episode.closed && taskKey(episode) === key,
    );
    const next = episodeRecord(
      prior,
      task,
      at,
      probeSucceeded,
      scan.complete,
      false,
    );
    emitted.push(next);
    latest.set(next.episodeId, next);
  }
  for (const episode of scan.complete
    ? active.filter((row) => !row.closed && !seen.has(taskKey(row)))
    : []) {
    emitted.push({
      ...episode,
      closed: true,
      observedAt: at,
      scanComplete: true,
    });
  }
  const lines: LogLine[] = [
    {
      kind: "scan",
      at,
      probeSucceeded,
      complete: scan.complete,
      scannedTasks: scan.scannedTasks,
      ...(scan.reason === undefined ? {} : { reason: scan.reason }),
    },
    ...emitted,
  ];
  const all = [...retained, ...lines].slice(-DXG_LOG_MAX_LINES);
  let output = all.map((line) => JSON.stringify(line)).join("\n");
  while (Buffer.byteLength(output) > DXG_LOG_MAX_BYTES && all.length > 1) {
    all.shift();
    output = all.map((line) => JSON.stringify(line)).join("\n");
  }
  const temp = `${options.logPath}.${randomUUID()}.tmp`;
  await using _temp = {
    [Symbol.asyncDispose]: () => unlink(temp).catch(() => {}),
  };
  await Bun.write(temp, `${output}\n`, { mode: 0o600 });
  await rename(temp, options.logPath);
  return scan;
}

export function dxgEpisodeLogPath(statePath: string): string {
  return join(dirname(statePath), "gpu-dxg-episodes.jsonl");
}
