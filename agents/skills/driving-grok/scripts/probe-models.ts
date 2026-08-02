import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli } from "cleye";

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

type CommandResult = Readonly<{
  exitCode: number;
  output: string;
  timedOut: boolean;
}>;

async function run(
  command: string[],
  cwd: string | undefined,
  timeoutMs: number,
): Promise<CommandResult> {
  // Native timeout via AbortSignal (bun-facts §3): kills the child with SIGTERM (same
  // signal the old hand-rolled `child.kill()` sent) after timeoutMs — and signal.aborted
  // is true IFF the budget elapsed, so a child that crashes or self-signals early keeps
  // its real exit code. The sentinel 124 is preserved verbatim for the timeout case.
  const signal = AbortSignal.timeout(timeoutMs);
  const child = Bun.spawn(command, {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    signal,
    killSignal: "SIGTERM",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const timedOut = signal.aborted;
  return {
    exitCode: timedOut ? 124 : exitCode,
    output: `${stdout}${stderr}`,
    timedOut,
  };
}

function jsonRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "probe-models.ts",
      parameters: ["[models...]"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  const models = parsed._;

  const grok = Bun.which(process.env.GROK ?? "grok");
  if (grok === null)
    throw new Error(
      `${process.env.GROK ?? "grok"} not on PATH — environment problem, not a model result`,
    );
  if (models.length === 0) {
    const version = await run([grok, "--version"], undefined, 30_000);
    const roster = await run([grok, "models"], undefined, 60_000);
    process.stdout.write(version.output);
    process.stdout.write(
      "roster (copy model ids VERBATIM from this list — -m rejects anything else client-side):\n",
    );
    process.stdout.write(roster.output);
    process.exit(version.exitCode === 0 && roster.exitCode === 0 ? 0 : 2);
  }

  const probeDir = await mkdtemp(join(tmpdir(), "driving-grok-"));
  let failures = 0;
  try {
    for (const model of models) {
      const result = await run(
        [
          grok,
          "-p",
          "Reply with exactly: OK",
          "-m",
          model,
          "--output-format",
          "json",
          "--sandbox",
          "read-only",
        ],
        probeDir,
        120_000,
      );
      const envelope =
        result.exitCode === 0 ? jsonRecord(result.output) : undefined;
      const text = envelope?.text;
      const usage =
        typeof envelope?.usage === "object" && envelope.usage !== null
          ? envelope.usage
          : undefined;
      const tokens =
        typeof usage === "object" && usage !== null && "total_tokens" in usage
          ? String(usage.total_tokens)
          : "?";
      if (result.exitCode === 0 && text === "OK") {
        process.stdout.write(
          `RESULT: AVAILABLE ${model} (usage.total_tokens: ${tokens})\n`,
        );
        continue;
      }
      if (result.output.includes("unknown model id")) {
        process.stdout.write(
          `RESULT: INVALID_NAME ${model} (exit ${result.exitCode}) — not an exact model id (\`${process.env.GROK ?? "grok"} models\` or references/model-catalog.md); copy it verbatim\n`,
        );
      } else {
        const note = result.timedOut
          ? "timeout — not a catalog verdict"
          : result.exitCode === 0
            ? 'rc=0 but .text != "OK" (empty/malformed json, or a genuinely different reply) — not a clean AVAILABLE'
            : `rc=${result.exitCode}`;
        process.stdout.write(`RESULT: INCONCLUSIVE ${model} (${note})\n`);
        for (const line of result.output
          .split("\n")
          .filter((entry) => /Error|error|denied|quota|auth/.test(entry))
          .slice(0, 2)) {
          process.stdout.write(`  ${line}\n`);
        }
      }
      failures += 1;
    }
  } finally {
    await rm(probeDir, { recursive: true, force: true });
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
});
