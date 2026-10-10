import { readdir, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { attempt, attemptOr } from "../../shared/src/attempt.ts";
import { dispatchStateDir } from "../../shared/src/dispatch-state.ts";
import { sampleGpu, type GpuReading } from "../../shared/src/gpu-samples.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";
import type { HookContext } from "./runtime.ts";
import { projectCwd } from "./attribution.ts";

export type Run = {
  id: string;
  lane: string;
  row: string;
  name?: string;
  kind?: string;
  labels?: string[];
};
export type RunStateOptions = { stateDirs?: string[] };
export type RunFilter = RunStateOptions & { session?: string };
const Marker = z.object({
  run_id: z.string(),
  pid: z.number().int().positive(),
  choice: z.string(),
  dispatcher_session: z.string().optional(),
  cwd: z.string().optional(),
  display_id: z.string().optional(),
  kind: z.string().optional(),
  labels: z.array(z.string()).optional(),
  ticket: z
    .object({
      lane: z.string().optional(),
      name: z.string().optional(),
      kind: z.string().optional(),
      labels: z.array(z.string()).optional(),
    })
    .optional(),
});
const Record = z.object({
  kind: z.string(),
  run_id: z.string(),
  display_id: z.string().optional(),
  choice: z.string().optional(),
  pick: z.object({ choice: z.string() }).optional(),
  ticket: z.object({ lane: z.string().optional() }).optional(),
  stats: z.object({ outcome: z.string().optional() }).optional(),
  worker: z
    .object({ outcome: z.string().optional(), session: z.string().optional() })
    .optional(),
});
const LIMIT_MS = 1_000;

async function bounded<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((done) => {
    timer = setTimeout(() => {
      done(fallback);
    }, LIMIT_MS);
  });
  const value = await Promise.race([attemptOr(fn, fallback), timeout]);
  clearTimeout(timer);
  return value;
}

async function liveMarker(
  path: string,
  session: string | null | undefined,
  ctx: HookContext,
): Promise<Run[]> {
  const parsed = jsonOf(Marker).safeParse(await Bun.file(path).text());
  if (!parsed.success) return [];
  if (session === null && parsed.data.dispatcher_session !== undefined)
    return [];
  if (session === null && !projectCwd(parsed.data.cwd, ctx.repoRoot)) return [];
  if (
    session !== undefined &&
    session !== null &&
    parsed.data.dispatcher_session !== session
  )
    return [];
  const alive = await attempt(() => process.kill(parsed.data.pid, 0));
  if (!alive.ok) return [];
  return [
    {
      id: parsed.data.run_id,
      lane: parsed.data.ticket?.lane ?? "other",
      row: parsed.data.choice,
      ...runMetadata(parsed.data),
    },
  ];
}

function runMetadata(
  marker: z.output<typeof Marker>,
): Pick<Run, "name" | "kind" | "labels"> {
  const name = marker.ticket?.name ?? marker.display_id;
  const kind = marker.ticket?.kind ?? marker.kind;
  const labels = marker.ticket?.labels ?? marker.labels;
  return {
    ...(name === undefined ? {} : { name }),
    ...(kind === undefined ? {} : { kind }),
    ...(labels === undefined ? {} : { labels }),
  };
}

async function runsInDir(
  root: string,
  session: string | null | undefined,
  ctx: HookContext,
): Promise<Run[]> {
  const dir = join(root, "active");
  const names = await readdir(dir);
  const rows = await Promise.all(
    names
      .toSorted()
      .filter(
        (name) => name.endsWith(".json") && !name.endsWith(".progress.json"),
      )
      .map((name) =>
        attemptOr(() => liveMarker(join(dir, name), session, ctx), []),
      ),
  );
  return rows.flat();
}

function selectRuns(
  session: string | null | undefined,
  options: RunStateOptions,
  ctx: HookContext,
): Promise<Run[]> {
  return bounded(async () => {
    const roots = [...new Set(options.stateDirs ?? [dispatchStateDir()])];
    const rows = await Promise.all(
      roots.map((root) => attemptOr(() => runsInDir(root, session, ctx), [])),
    );
    const runs = new Map<string, Run>();
    for (const run of rows.flat()) {
      if (!runs.has(run.id)) runs.set(run.id, run);
    }
    return [...runs.values()];
  }, []);
}

/** Live PIDs, optionally restricted to the dispatcher's exact Claude session ID. */
export function runningRuns(
  ctx: HookContext,
  filter: RunFilter = {},
): Promise<Run[]> {
  return selectRuns(filter.session, filter, ctx);
}

/** Live runs without dispatcher_session whose marker cwd belongs to this project. */
export function unattributedRuns(
  ctx: HookContext,
  options: RunStateOptions = {},
): Promise<Run[]> {
  return selectRuns(null, options, ctx);
}

export async function laneCount(
  ctx: HookContext,
  lane: string,
  filter: RunFilter = {},
): Promise<number> {
  return (await runningRuns(ctx, filter)).filter((run) => run.lane === lane)
    .length;
}

async function command(
  args: string[],
  cwd: string,
): Promise<string | undefined> {
  const result = await attempt(async () => {
    const signal = AbortSignal.timeout(LIMIT_MS);
    const child = Bun.spawn(args, {
      cwd,
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
      signal,
      timeout: LIMIT_MS,
    });
    const [out, , exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return exit === 0 && !signal.aborted ? out : undefined;
  });
  return result.ok ? result.value : undefined;
}

/** First NVIDIA GPU, with shared jittered history; null averages need more samples. */
export function gpu(
  ctx: HookContext,
  search: { path?: string; fallbacks?: string[]; statePath?: string } = {},
): Promise<GpuReading | "unknown"> {
  const result = sampleGpu({ ...search, cwd: ctx.cwd, timeoutMs: LIMIT_MS });
  return Promise.resolve(result.ok ? result.value : "unknown");
}

/** Hours since the oldest modified file reported by jj diff; clean/unavailable is zero. */
export function dirtyFor(ctx: HookContext): Promise<number> {
  return bounded(async () => {
    const out = await command(
      ["jj", "diff", "--name-only", "--no-pager"],
      ctx.repoRoot,
    );
    if (out === undefined || out.trim() === "") return 0;
    const paths = out
      .trim()
      .split("\n")
      .map((name) => resolve(ctx.repoRoot, name));
    const safe = paths.filter((path) => {
      const rel = relative(ctx.repoRoot, path);
      return (
        !isAbsolute(rel) &&
        rel !== ".." &&
        !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
      );
    });
    const times = await Promise.all(
      safe.map((path) =>
        attemptOr(async () => (await stat(path)).mtimeMs, Infinity),
      ),
    );
    const oldest = Math.min(...times);
    return Number.isFinite(oldest)
      ? Math.max(
          0,
          (Temporal.Now.instant().epochMilliseconds - oldest) / 3_600_000,
        )
      : 0;
  }, 0);
}

function recordAliases(
  record: z.output<typeof Record>,
  aliases: Map<string, string>,
): void {
  aliases.set(record.run_id, record.run_id);
  if (record.display_id !== undefined)
    aliases.set(record.display_id, record.run_id);
  if (record.worker?.session !== undefined)
    aliases.set(record.worker.session, record.run_id);
}

/** Finished returned runs without an acknowledgement (including rejected acknowledgements). */
export function unackedReturns(_ctx: HookContext): Promise<Run[]> {
  return bounded(async () => {
    const text = await Bun.file(join(dispatchStateDir(), "runs.jsonl")).text();
    const runs = new Map<string, Run>();
    const acked = new Set<string>();
    const aliases = new Map<string, string>();
    for (const line of text.split("\n")) {
      const parsed = jsonOf(Record).safeParse(line);
      if (!parsed.success) continue;
      const record = parsed.data;
      if (record.kind === "run") recordAliases(record, aliases);
      if (record.kind === "ack")
        acked.add(aliases.get(record.run_id) ?? record.run_id);
      if (
        record.kind !== "run" ||
        (record.stats?.outcome ?? record.worker?.outcome) !== "returned"
      )
        continue;
      runs.set(record.run_id, {
        id: record.run_id,
        lane: record.ticket?.lane ?? "other",
        row: record.pick?.choice ?? record.choice ?? "other",
      });
    }
    return [...runs.values()].filter((run) => !acked.has(run.id));
  }, []);
}
