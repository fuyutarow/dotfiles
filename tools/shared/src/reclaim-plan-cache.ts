import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import { jsonOf, z } from "./zod.ts";

const MAX_CACHE_BYTES = 32 * 1024;
const MAX_AGE_MS = 60 * 60 * 1000;
const MAX_CANDIDATES = 5;
const Candidate = z.object({
  id: z.string().min(1),
  verdict: z.string(),
  bytes: z.number().nonnegative().nullable(),
});
const PlanInput = z.object({
  targets: z.array(
    z.object({ tier: z.string(), candidates: z.array(Candidate) }),
  ),
});
const Cache = z.object({
  generated_at: z.number(),
  candidates: z.array(
    z.object({ name: z.string(), bytes: z.number().positive() }),
  ),
});

export type CachedReclaimCandidate = {
  name: string;
  bytes: number;
};

const cachePath = (home: string): string =>
  join(home, ".cache", "claude-hooks", "storage-headroom", "reclaim-plan.json");

export async function writeReclaimPlanCache(
  plan: unknown,
  home: string,
  now = Temporal.Now.instant().epochMilliseconds,
): Promise<void> {
  const parsed = PlanInput.safeParse(plan);
  if (!parsed.success) return;
  if (!parsed.data.targets.some((target) => target.tier === "blind")) return;
  const candidates = parsed.data.targets
    .filter((target) => target.tier === "blind")
    .flatMap((target) =>
      target.candidates
        .filter(
          (candidate) =>
            candidate.verdict === "RECLAIM" &&
            candidate.bytes !== null &&
            candidate.bytes > 0,
        )
        .flatMap((candidate) => {
          if (candidate.bytes === null) return [];
          return [{ name: candidate.id.slice(0, 120), bytes: candidate.bytes }];
        }),
    )
    .toSorted((left, right) => right.bytes - left.bytes)
    .slice(0, MAX_CANDIDATES);
  const path = cachePath(home);
  const result = await fromAsyncThrowable(async () => {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify({ generated_at: now, candidates }), {
      mode: 0o600,
    });
    await rename(tmp, path);
  })();
  if (result.isErr())
    process.stderr.write(
      `disk-reclaim: could not update hook plan cache: ${String(result.error)}\n`,
    );
}

export async function readReclaimPlanCache(
  home: string,
  now = Temporal.Now.instant().epochMilliseconds,
): Promise<CachedReclaimCandidate[]> {
  const path = cachePath(home);
  const result = await fromAsyncThrowable(async () => {
    const file = await stat(path);
    if (file.size > MAX_CACHE_BYTES) return null;
    return jsonOf(Cache).safeParse(await readFile(path, "utf8"));
  })();
  if (result.isErr() || result.value === null || !result.value.success)
    return [];
  const cached = result.value.data;
  if (now - cached.generated_at < 0 || now - cached.generated_at > MAX_AGE_MS)
    return [];
  return cached.candidates.slice(0, MAX_CANDIDATES);
}
