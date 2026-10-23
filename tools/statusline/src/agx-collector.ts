// Sampler-only subprocess boundary. Render modules never import this collector.
import { execAsyncWithin } from "./bounded.ts";
import { AgxStatusSchema } from "./agx-snapshot.ts";
import { jsonOf } from "./zod.ts";
import { err, ok } from "neverthrow";
import { resolve } from "node:path";

export async function collectAgxStatus(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const executable = Bun.which("mise", { PATH: env.PATH ?? "" });
  if (executable === null)
    return err("agx status unavailable: no mise on PATH");
  const result = await execAsyncWithin(
    "agx status",
    executable,
    [
      "-C",
      resolve(import.meta.dir, "../../.."),
      "exec",
      "--",
      "agx",
      "status",
      "--json",
      "--cwd",
      cwd,
    ],
    5000,
    env,
  );
  if (result.isErr()) return err(result.error.why);
  if (result.value.length > 4 * 1024 * 1024)
    return err("agx status output exceeds 4 MiB");
  const parsed = jsonOf(AgxStatusSchema).safeParse(result.value);
  if (!parsed.success) return err("agx status returned invalid schema-1 JSON");
  return ok(parsed.data);
}
