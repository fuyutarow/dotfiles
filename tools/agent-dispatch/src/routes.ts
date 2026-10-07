import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { jsonOf, z } from "../../shared/src/zod.ts";

export type Route = "codex" | "claude";
export type RouteStatus = Readonly<{
  available: boolean;
  reason: string;
}>;
export type Routes = Readonly<Record<Route, RouteStatus>>;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CacheSchema = z.looseObject({
  host: z.string(),
  version: z.string(),
  at: z.number(),
  available: z.boolean(),
  reason: z.string(),
});

export type RouteProbeDependencies = Readonly<{
  host: string;
  version: string;
  cachePath: string;
  now: () => number;
  codexProbe: () => RouteStatus;
  claudePath: () => string | null;
}>;

/** Probe runner capability before route selection; codex results are host/version cached for 24 h. */
export function probeRoutes(deps: RouteProbeDependencies): Routes {
  let codex: RouteStatus | undefined;
  if (existsSync(deps.cachePath)) {
    const parsed = jsonOf(CacheSchema).safeParse(
      readFileSync(deps.cachePath, "utf8"),
    );
    const cached = parsed.success ? parsed.data : undefined;
    if (
      cached !== undefined &&
      cached.host === deps.host &&
      cached.version === deps.version &&
      deps.now() - cached.at < CACHE_TTL_MS
    )
      codex = { available: cached.available, reason: cached.reason };
  }
  if (codex === undefined) {
    codex = deps.codexProbe();
    mkdirSync(dirname(deps.cachePath), { recursive: true });
    writeFileSync(
      deps.cachePath,
      JSON.stringify({
        host: deps.host,
        version: deps.version,
        at: deps.now(),
        available: codex.available,
        reason: codex.reason,
      }),
    );
  }
  const claude = deps.claudePath();
  return {
    codex,
    claude:
      claude === null
        ? { available: false, reason: "claude is not on PATH" }
        : { available: true, reason: `found at ${claude}` },
  };
}

export function routeCachePath(stateDir: string): string {
  return join(stateDir, "route-capability.json");
}

export const currentHost = (): string => hostname();
