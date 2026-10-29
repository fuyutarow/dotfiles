import { join, resolve } from "node:path";
import { fromThrowable, jsonOf, z } from "../../shared/src/zod.ts";

const Rows = z.array(
  z.object({
    path: z.string(),
    bytes: z.number().nullable(),
    allowed: z.boolean(),
    checks: z.array(
      z.object({ name: z.string(), ok: z.boolean(), detail: z.string() }),
    ),
  }),
);

type Probe = (
  paths: string[],
  timeout: number,
  signal: AbortSignal,
) => Promise<{ out: string; error: string | null }>;

async function probe(paths: string[], timeout: number, signal: AbortSignal) {
  const env = {
    ...process.env,
    DISK_PATHS: JSON.stringify(paths),
    RECLAIM_PROC_TRACE: "0",
  };
  const script = `import { loadConfig } from ${JSON.stringify(join(import.meta.dir, "engine.ts"))}; import { deleteApproved } from ${JSON.stringify(join(import.meta.dir, "delete.ts"))}; import { resolveProcRoot } from ${JSON.stringify(join(import.meta.dir, "lib/procs.ts"))}; const loaded = loadConfig(); if (!loaded.config) throw new Error(loaded.error ?? "invalid config"); const result = await deleteApproved(JSON.parse(process.env.DISK_PATHS), {config: loaded.config, yes: false, procRoot: resolveProcRoot()}); console.log(JSON.stringify(result.rows));`;
  const controller = AbortSignal.any([
    signal,
    AbortSignal.timeout(Math.min(timeout, 2147483647)),
  ]);
  const spawned = fromThrowable(() =>
    Bun.spawn([process.execPath, "-e", script], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env,
      signal: controller,
      killSignal: "SIGKILL",
    }),
  )();
  if (spawned.isErr())
    return {
      out: "",
      error: `path plan could not start: ${String(spawned.error)}`,
    };
  const child = spawned.value;
  const [out, err, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (controller.aborted)
    return {
      out: "",
      error: signal.aborted
        ? "path plan cancelled"
        : "path plan deadline exceeded",
    };
  if (exit !== 0) return { out: "", error: `path plan failed: ${err.trim()}` };
  return { out, error: null };
}

/** Plan only: the injected probe has no action authority. */
export async function planPaths(
  paths: string[],
  timeout: number,
  signal: AbortSignal,
  run: Probe = probe,
) {
  const result = await run(paths, timeout, signal);
  if (result.error !== null) return { items: [], error: result.error };
  const parsed = jsonOf(Rows).safeParse(result.out);
  if (
    !parsed.success ||
    parsed.data.length !== paths.length ||
    parsed.data.some((row, index) => row.path !== resolve(paths[index] ?? ""))
  )
    return { items: [], error: "invalid or mismatched path plan result" };
  const items = parsed.data.map((row) => {
    const failures = row.checks.filter((check) => !check.ok);
    let verdict = "safe";
    if (!row.allowed) {
      verdict =
        failures.length > 0 &&
        failures.every((check) => /unknown|unreadable/iu.test(check.detail))
          ? "unknown"
          : "keep";
    }
    if (row.allowed && (failures.length > 0 || row.bytes === null))
      verdict = "unknown";
    let reason = failures.map((check) => check.detail).join("; ");
    if (reason === "")
      reason =
        row.bytes === null
          ? "path size unavailable"
          : "eligible at planning time; action revalidates";
    return {
      id: row.path,
      target: null,
      path: row.path,
      verdict,
      reason,
      fingerprint: null,
      effect: "none",
      logical_bytes: row.bytes,
      allocated_bytes: null,
      eligible_at: null,
      error: null,
      detail: { checks: row.checks },
    };
  });
  return { items, error: null };
}
