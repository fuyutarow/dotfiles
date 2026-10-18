// Consumer: deploy coordinator. Link findings are deferred; fatal failures and timeouts stop.
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
  { name: "link:dots", args: ["scripts/link-dots.ts"], boundMs: 24_000 },
  {
    name: "codex:config",
    args: ["agents/codex/codex-config.ts"],
    boundMs: 5_000,
  },
  {
    name: "skills:sync:in-house",
    args: ["scripts/skills-sync.ts", "--in-house-only"],
    boundMs: 10_000,
  },
];

export async function runSteps(
  steps: Step[],
  root: string,
  report: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
): Promise<number> {
  let findings = 0;
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
    if (code === 0) continue;
    report(`[post-merge] ${step.name} failed (exit ${code})`);
    if (step.name !== "link:dots" || code !== 1) return code;
    findings = 1;
  }
  return findings;
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
