import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli } from "cleye";
import { jsonText, z } from "../../../hooks/zod.ts";

const RecordSchema = z.record(z.string(), z.unknown());

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
    ...(cwd === undefined ? {} : { cwd }),
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

// A malformed body is a zod issue, never a throw: it maps to `undefined`, same as the old catch.
function jsonRecord(value: string): Record<string, unknown> | undefined {
  const record = jsonText.pipe(RecordSchema).safeParse(value);
  return record.success ? record.data : undefined;
}

async function probeAll(models: readonly string[], grok: string): Promise<number> {
  const probeDir = await mkdtemp(join(tmpdir(), "driving-grok-"));
  // Disposal runs when this function returns or throws, before `main` calls
  // process.exit — same order the old try/finally guaranteed.
  await using _cleanupProbeDir = {
    [Symbol.asyncDispose]: () => rm(probeDir, { recursive: true, force: true }),
  };
  let failures = 0;
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
    const usage = RecordSchema.safeParse(envelope?.usage);
    const tokens =
      usage.success && Object.hasOwn(usage.data, "total_tokens")
        ? String(usage.data.total_tokens)
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
      let note: string;
      if (result.timedOut) {
        note = "timeout — not a catalog verdict";
      } else if (result.exitCode === 0) {
        note =
          'rc=0 but .text != "OK" (empty/malformed json, or a genuinely different reply) — not a clean AVAILABLE';
      } else {
        note = `rc=${result.exitCode}`;
      }
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
  return failures;
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

  const failures = await probeAll(models, grok);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
});
