import { join } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { Candidate } from "./model.ts";
import { cleanProbe } from "./disk-clean.ts";
import { buildsProbe } from "./disk-builds.ts";
import { scratchProbe } from "./disk-scratch.ts";
import { cccIndexDbProbe } from "./disk-ccc-index-db.ts";
import { runProbe } from "./disk-probe.ts";
import { createMiseConfigsTarget } from "./targets/mise-configs.ts";
import type { Context, Target } from "./targets/index.ts";
import { diskTargetNames } from "./disk-targets/index.ts";

const Rows = z.array(
  z.object({ candidate: Candidate, fingerprint: z.string().nullable() }),
);
const Preflight = z.object({
  verdict: z.enum(["safe", "keep", "ask", "unknown", "changed"]),
  reason: z.string().nullable(),
  effect: z.literal("none"),
  same_filesystem: z.boolean().optional(),
});
const MiseResult = z.object({
  item: z.object({
    id: z.string(),
    target: z.string(),
    path: z.null(),
    verdict: z.string(),
    reason: z.string(),
    fingerprint: z.string().nullable(),
    effect: z.string(),
    logical_bytes: z.null(),
    allocated_bytes: z.null(),
    eligible_at: z.null(),
    error: z.string().nullable(),
    detail: z.unknown(),
  }),
  exit: z.number(),
});
type ProbeResult = {
  out: string;
  err: string;
  exit: number | null;
  timedOut: boolean;
};
type Probe = (
  action: string | undefined,
  ms: number,
  signal?: AbortSignal,
) => Promise<ProbeResult>;
export type PlanDependencies = { probe?: Probe; miseTarget?: Target };
type Row = z.output<typeof Rows>[number];
type Reply = { out: string; error: null } | { out: null; error: string };

async function misePlan(target: Target) {
  const ctx: Context = {
    mode: "run",
    explicit: true,
    config: {
      repo_roots: [],
      repos: [],
      scratch_roots: [],
      delete_roots: [],
      regenerable_ignored: [],
      session_grace_hours: 24,
      ignore_unreadable_procs: ["sshd"],
    },
    log: () => {},
  };
  const available = await target.available(ctx);
  if (!available.available)
    return { rows: [], error: available.skip_reason ?? "target unavailable" };
  return {
    rows: (await target.plan(ctx)).map((candidate) => ({
      candidate,
      fingerprint: null,
    })),
    error: null,
  };
}

function chooseProbe(target: string, only?: string): Probe | undefined {
  if (target === "clean" || target === "rust" || target === "tmpfs")
    return (action, ms, abort) => cleanProbe(action, ms, abort, target, only);
  if (target === "builds") return buildsProbe;
  if (target === "scratch") return scratchProbe;
  if (target === "ccc-index-db") return cccIndexDbProbe;
  if (target !== "toolchains") return undefined;
  return (action, ms, abort) =>
    runProbe(
      [
        process.execPath,
        "-e",
        `import { toolchainsWorker } from ${JSON.stringify(join(import.meta.dir, "disk-toolchains-worker.ts"))}; console.log(JSON.stringify(await toolchainsWorker(JSON.parse(process.env.DISK_TOOLCHAINS_REQUEST))));`,
      ],
      ms,
      { ...process.env, DISK_TOOLCHAINS_REQUEST: action ?? "{}" },
      abort,
    );
}

const miseProbe: Probe = (_action, ms, abort) =>
  runProbe(
    [
      process.execPath,
      "-e",
      `import { freeMiseConfigs } from ${JSON.stringify(join(import.meta.dir, "disk-mise-configs.ts"))}; console.log(JSON.stringify(await freeMiseConfigs(Number(process.env.DISK_PLAN_TIMEOUT), performance.now(), false, undefined, undefined, true)));`,
    ],
    ms,
    { ...process.env, DISK_PLAN_TIMEOUT: String(ms) },
    abort,
  );

async function candidateVerdict(
  target: string,
  row: Row,
  call: (action?: string) => Promise<Reply>,
) {
  const { candidate: c, fingerprint } = row;
  if (c.verdict !== "RECLAIM")
    return { verdict: c.verdict.toLowerCase(), reason: c.reason };
  if (target === "mise-configs") return { verdict: "safe", reason: c.reason };
  if (c.path === null || fingerprint === null)
    return { verdict: "unknown", reason: "missing path or fingerprint" };
  const response = await call(
    JSON.stringify({ id: c.id, path: c.path, fingerprint, preview: true }),
  );
  if (response.error !== null)
    return { verdict: "unknown", reason: response.error };
  const checked = jsonOf(Preflight).safeParse(response.out);
  if (!checked.success)
    return { verdict: "unknown", reason: "invalid target preflight result" };
  if (target === "toolchains" && checked.data.same_filesystem === false)
    return {
      verdict: "unknown",
      reason: "candidate filesystem measurement unavailable",
    };
  return {
    verdict: checked.data.verdict,
    reason: checked.data.reason ?? "preflight unavailable",
  };
}

export async function planTarget(
  target: string,
  timeout: number,
  signal: AbortSignal,
  only?: string,
  injected?: PlanDependencies,
) {
  if (!diskTargetNames.has(target))
    return { items: [], error: `plan adapter unavailable: ${target}` };
  const start = performance.now();
  const remaining = () => Math.floor(timeout - (performance.now() - start));
  const call = async (probe: Probe, request?: string): Promise<Reply> => {
    if (remaining() <= 0 || signal.aborted)
      return { out: null, error: "deadline expired or cancelled" };
    const result = await fromAsyncThrowable(() =>
      probe(request, remaining(), signal),
    )();
    if (result.isErr()) return { out: null, error: String(result.error) };
    const response = result.value;
    if (response.timedOut || response.exit !== 0)
      return {
        out: null,
        error: response.timedOut
          ? "target plan timed out"
          : `target plan failed: ${response.err.trim()}`,
      };
    return { out: response.out, error: null };
  };
  if (target === "mise-configs" && injected?.miseTarget === undefined) {
    const response = await call(miseProbe);
    if (response.error !== null) return { items: [], error: response.error };
    const parsed = jsonOf(MiseResult).safeParse(response.out);
    if (!parsed.success)
      return { items: [], error: "invalid mise plan result" };
    return {
      items: parsed.data.item.verdict === "completed" ? [] : [parsed.data.item],
      error: null,
    };
  }
  const probe = injected?.probe ?? chooseProbe(target, only);
  if (probe === undefined && target !== "mise-configs")
    return { items: [], error: `plan adapter unavailable: ${target}` };
  let rows: Row[];
  if (target === "mise-configs" && injected?.miseTarget !== undefined) {
    const result = await fromAsyncThrowable(() =>
      misePlan(injected.miseTarget ?? createMiseConfigsTarget()),
    )();
    if (result.isErr()) return { items: [], error: String(result.error) };
    if (result.value.error !== null)
      return { items: [], error: result.value.error };
    rows = result.value.rows;
  } else {
    if (probe === undefined)
      return { items: [], error: "plan adapter unavailable" };
    const response = await call(probe);
    if (response.error !== null) return { items: [], error: response.error };
    const parsed = jsonOf(Rows).safeParse(response.out);
    if (!parsed.success)
      return { items: [], error: "invalid target plan result" };
    rows = parsed.data;
  }
  const items = [];
  for (const row of rows) {
    const { candidate: c, fingerprint } = row;
    const verdict = await candidateVerdict(target, row, (action) =>
      probe === undefined
        ? Promise.resolve({ out: null, error: "plan adapter unavailable" })
        : call(probe, action),
    );
    items.push({
      id: c.id,
      target,
      path: c.path,
      ...verdict,
      fingerprint,
      effect: "none",
      logical_bytes: c.bytes,
      allocated_bytes: null,
      eligible_at: null,
      error: null,
      detail: { checks: c.checks, bytes_kind: c.bytes_kind },
    });
  }
  return { items, error: null };
}
