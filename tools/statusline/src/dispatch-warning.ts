// Codex-share warning, ported from agents/claude/dispatch-warning.ts (ef73a9c4) plus the reading
// half of the old buildDataframe. Read-only: runs.jsonl and route-capability.json are written by
// agent-dispatch (tools/agent-dispatch/src/routes.ts: routeCachePath = <state>/route-capability.json).
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { fromThrowable } from "neverthrow";
import { readJson } from "./bounded.ts";
import { stateDir } from "./dispatch-state.ts";
import { nowEpochSec } from "./prompt-stamp.ts";
import { jsonOf, z } from "./zod.ts";

const CacheSchema = z.looseObject({
  host: z.string(),
  available: z.boolean(),
});
const RunSchema = z.looseObject({
  kind: z.literal("run"),
  host: z.string(),
  started_at: z.string(),
  pick: z.looseObject({ source: z.string() }),
  route: z.enum(["codex", "claude"]).optional(),
  stats: z
    .looseObject({ route: z.enum(["codex", "claude"]).optional() })
    .optional(),
});

export function dispatchWarning(
  log: string,
  routeCache: string,
  host: string,
  now: number,
): string | undefined {
  const cache = jsonOf(CacheSchema).safeParse(routeCache);
  if (!cache.success || cache.data.host !== host || !cache.data.available)
    return undefined;
  const cutoff = now - 24 * 60 * 60 * 1000;
  const picks = log
    .split("\n")
    .filter((line) => line !== "")
    .flatMap((line) => {
      const parsed = jsonOf(RunSchema).safeParse(line);
      if (!parsed.success) return [];
      const run = parsed.data;
      const parsedAt = fromThrowable(
        () => Temporal.Instant.from(run.started_at).epochMilliseconds,
        (error) => error,
      )();
      const at = parsedAt.isOk() ? parsedAt.value : Number.NaN;
      if (
        run.host !== host ||
        run.pick.source !== "jev" ||
        !Number.isFinite(at) ||
        at < cutoff ||
        at > now
      )
        return [];
      const route = run.route ?? run.stats?.route;
      return route === undefined ? [] : [{ ...run, route }];
    });
  if (picks.length < 5 || picks.some((run) => run.route === "codex"))
    return undefined;
  return `codex 0/${picks.length} picks ⚠`;
}

/** The warning for this host from the on-disk state; undefined when either file is unusable. */
export function readDispatchWarning(): string | undefined {
  const state = stateDir();
  const cache = readJson(join(state, "route-capability.json"), CacheSchema);
  if (cache?.host !== hostname()) return undefined;
  const log = fromThrowable(() =>
    readFileSync(join(state, "runs.jsonl"), "utf8"),
  )();
  return log.isOk()
    ? dispatchWarning(
        log.value,
        JSON.stringify(cache),
        hostname(),
        nowEpochSec() * 1000,
      )
    : undefined;
}
