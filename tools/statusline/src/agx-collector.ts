// Sampler-only subprocess boundary. Render modules never import this collector.
import { execAsyncWithin } from "./bounded.ts";
import { AgxStatusSchema } from "./agx-snapshot.ts";
import { RoutingStatsSchema } from "./dispatch-warning.ts";
import { jsonOf, z } from "./zod.ts";
import { err, ok } from "neverthrow";
import { resolve } from "node:path";

async function collectAgx<S extends z.ZodType>(
  tool: string,
  args: string[],
  schema: S,
  env: NodeJS.ProcessEnv,
) {
  const executable = Bun.which("mise", { PATH: env["PATH"] ?? "" });
  if (executable === null) return err(`${tool} unavailable: no mise on PATH`);
  const result = await execAsyncWithin(
    tool,
    executable,
    ["-C", resolve(import.meta.dir, "../../.."), "exec", "--", "agx", ...args],
    5000,
    env,
  );
  if (result.isErr()) return err(result.error.why);
  if (result.value.length > 4 * 1024 * 1024)
    return err(`${tool} output exceeds 4 MiB`);
  const parsed = jsonOf(schema).safeParse(result.value);
  if (!parsed.success) return err(`${tool} returned invalid schema-1 JSON`);
  return ok(parsed.data);
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
