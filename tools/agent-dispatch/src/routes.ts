import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fromThrowable } from "neverthrow";
import { jsonOf, z } from "../../shared/src/zod.ts";
import {
  codexHostDeclarationPath,
  readCodexHostDeclaration,
} from "./workers/codex-host.ts";

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
  hostFileMtime: z.number().nullable(),
  at: z.number(),
  available: z.boolean(),
  reason: z.string(),
});

export type RouteProbeDependencies = Readonly<{
  host: string;
  version: string;
  cachePath: string;
  hostFile?: string;
  now: () => number;
  codexProbe: () => RouteStatus;
  claudePath: () => string | null;
}>;

/** Probe runner capability before route selection; codex results cache for 24 h per host, version, and declaration mtime. */
export function probeRoutes(deps: RouteProbeDependencies): Routes {
  const hostFile = deps.hostFile ?? codexHostDeclarationPath();
  const hostFileMtime = fromThrowable(
    () => statSync(hostFile).mtimeMs,
    (error) => error,
  )();
  const hostFileMtimeKey = hostFileMtime.isOk() ? hostFileMtime.value : null;
  const hostDeclaration = readCodexHostDeclaration(hostFile);
  let codex: RouteStatus | undefined;
  if (hostDeclaration.kind === "invalid") {
    codex = { available: false, reason: hostDeclaration.reason };
  } else if (hostDeclaration.kind === "valid") {
    codex = {
      available: true,
      reason: `unsandboxed by host declaration: ${hostDeclaration.declaration.unsandboxedReason}`,
    };
  } else if (existsSync(deps.cachePath)) {
    const parsed = jsonOf(CacheSchema).safeParse(
      readFileSync(deps.cachePath, "utf8"),
    );
    const cached = parsed.success ? parsed.data : undefined;
    if (
      cached !== undefined &&
      cached.host === deps.host &&
      cached.version === deps.version &&
      cached.hostFileMtime === hostFileMtimeKey &&
      deps.now() - cached.at < CACHE_TTL_MS
    )
      codex = { available: cached.available, reason: cached.reason };
  }
  codex ??= deps.codexProbe();
  if (hostDeclaration.kind !== "invalid") {
    mkdirSync(dirname(deps.cachePath), { recursive: true });
    writeFileSync(
      deps.cachePath,
      JSON.stringify({
        host: deps.host,
        version: deps.version,
        hostFileMtime: hostFileMtimeKey,
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
