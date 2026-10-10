// Consumer: deploy coordinator. Fail closed on the first failed or timed-out step.
// No argv boundary: this hook accepts no arguments and uses this checkout as its source.
import { dirname, join } from "node:path";

export type Step = { name: string; args: string[]; boundMs: number };

export const STEPS: Step[] = [
  {
    name: "deps:install",
    args: ["install", "--frozen-lockfile"],
    boundMs: 15_000,
  },
  { name: "deps:link", args: ["link"], boundMs: 5_000 },
  { name: "link:dots", args: ["scripts/link-dots.ts"], boundMs: 15_000 },
  {
    name: "codex:config",
    args: ["agents/codex/codex-config.ts"],
    boundMs: 5_000,
  },
  { name: "link:skills", args: ["scripts/link-skills.ts"], boundMs: 10_000 },
];

export async function runSteps(
  steps: Step[],
  root: string,
  report: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
): Promise<number> {
  for (const step of steps) {
    const started = performance.now();
    const signal = AbortSignal.timeout(step.boundMs);
    // Use the already running, mise-resolved binary, never the PATH wrapper. Its directory
    // also leads child PATHs so transitive Bun invocations cannot recurse through mise exec.
    const child = Bun.spawn([process.execPath, ...step.args], {
      cwd: root,
      env: {
        ...process.env,
        DOTFILES: root,
        PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`,
      },
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
      signal,
      killSignal: "SIGKILL",
    });
    const code = await child.exited;
    report(
      `[post-merge] ${step.name} ${((performance.now() - started) / 1000).toFixed(3)}s`,
    );
    if (signal.aborted) {
      report(
        `[post-merge] ${step.name} timed out (bound ${step.boundMs / 1000}s)`,
      );
      return 124;
    }
    if (code !== 0) {
      report(`[post-merge] ${step.name} failed (exit ${code})`);
      return code;
    }
  }
  return 0;
}

if (import.meta.main) {
  process.exitCode = await runSteps(STEPS, join(import.meta.dir, "..")).catch(
    (error: unknown) => {
      process.stderr.write(
        `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      return 2;
    },
  );
}
