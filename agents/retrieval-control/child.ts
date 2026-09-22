// Bounded child-process helpers shared by the router (repo-retrieve.ts) and its ccc index
// adapter (ccc-index.ts). Moved verbatim out of repo-retrieve.ts on 2026-09-22; the timeout
// contract (exit 124 on abort) is part of repo-retrieve's documented exit codes.

export function requireExecutable(name: string): string {
  const executable = Bun.which(name);
  if (!executable) throw new Error(`${name} is not available on PATH`);
  return executable;
}

export async function runChild(
  command: string[],
  timeoutMs: number,
): Promise<number> {
  const signal = AbortSignal.timeout(timeoutMs);
  const child = Bun.spawn({
    cmd: command,
    cwd: process.cwd(),
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
    signal,
    killSignal: "SIGTERM",
  });
  const exitCode = await child.exited;
  if (signal.aborted) {
    process.stderr.write(
      `FATAL: search child timed out after ${timeoutMs}ms: ${command[0]}\n`,
    );
    return 124;
  }
  return exitCode;
}

export async function runChildCaptured(
  command: string[],
  timeoutMs: number,
  relay = true,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const signal = AbortSignal.timeout(timeoutMs);
  const child = Bun.spawn({
    cmd: command,
    cwd: process.cwd(),
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
    signal,
    killSignal: "SIGTERM",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (relay && stdout !== "") process.stdout.write(stdout);
  if (relay && stderr !== "") process.stderr.write(stderr);
  if (signal.aborted) {
    process.stderr.write(
      `FATAL: search child timed out after ${timeoutMs}ms: ${command[0]}\n`,
    );
    return { exitCode: 124, stdout, stderr };
  }
  return { exitCode, stdout, stderr };
}
