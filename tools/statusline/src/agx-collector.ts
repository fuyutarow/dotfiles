// Sampler-only subprocess boundary. Render modules never import this collector.
import { execAsyncWithin } from "#src/bounded.ts";
import { AgxStatusSchema } from "#src/agx-snapshot.ts";
import { RoutingStatsSchema } from "#src/dispatch-warning.ts";
import { jsonOf, z } from "#src/zod.ts";
import { Result } from "@dotfiles/shared/src/result.ts";
import {
  missing,
  toolFailed,
  unparsable,
  type ReadError,
} from "#src/errors.ts";
import { resolve } from "node:path";

async function collectAgx<S extends z.ZodType>(
  tool: string,
  args: string[],
  schema: S,
  env: NodeJS.ProcessEnv,
): Promise<Result<z.output<S>, ReadError>> {
  const executable = Bun.which("mise", { PATH: env["PATH"] ?? "" });
  if (executable === null)
    return Result.err(missing("mise", `${tool} unavailable: no mise on PATH`));
  const result = await execAsyncWithin(
    tool,
    executable,
    ["-C", resolve(import.meta.dir, "../../.."), "exec", "--", "agx", ...args],
    5000,
    env,
  );
  if (result.isErr()) return Result.err(toolFailed(tool, result.error.why));
  if (result.value.length > 4 * 1024 * 1024)
    return Result.err(toolFailed(tool, `${tool} output exceeds 4 MiB`));
  const parsed = jsonOf(schema).safeParse(result.value);
  if (!parsed.success)
    return Result.err(
      unparsable(tool, `${tool} returned invalid schema-1 JSON`),
    );
  return Result.ok(parsed.data);
}

export function collectAgxStatus(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  return collectAgx(
    "agx status",
    ["status", "--json", "--cwd", cwd],
    AgxStatusSchema,
    env,
  );
}

export function collectAgxRouting(env: NodeJS.ProcessEnv = process.env) {
  // stats projections always emit JSON; the released CLI has no --json flag.
  return collectAgx(
    "agx routing stats",
    ["worker", "stats", "--routing", "--window", "24h"],
    RoutingStatsSchema,
    env,
  );
}
