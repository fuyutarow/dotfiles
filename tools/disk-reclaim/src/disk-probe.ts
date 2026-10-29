import { fromThrowable } from "../../shared/src/zod.ts";

/** Observe the direct child's termination before reporting a timeout. */
export async function runProbe(
  argv: string[],
  timeout: number,
  env: NodeJS.ProcessEnv = process.env,
) {
  const signal = AbortSignal.timeout(Math.min(timeout, 2147483647));
  const spawned = fromThrowable(() =>
    Bun.spawn(argv, {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal,
      killSignal: "SIGKILL",
      env,
    }),
  )();
  if (spawned.isErr())
    return { out: "", err: String(spawned.error), exit: null, timedOut: false };
  const child = spawned.value;
  const [out, err, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { out, err, exit, timedOut: signal.aborted };
}
