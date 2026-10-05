/** FLOOR probe: a model string is available only when agy returns exactly OK. */

import { cli } from "cleye";

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

type CommandResult = Readonly<{
  exitCode: number;
  output: string;
  timedOut: boolean;
}>;

async function run(
  command: string[],
  timeoutMs: number,
): Promise<CommandResult> {
  // Native timeout via AbortSignal (bun-facts §3): signal.aborted is true IFF the budget
  // elapsed — a child that crashes or self-signals early keeps its real exit code.
  const signal = AbortSignal.timeout(timeoutMs);
  const child = Bun.spawn(command, {
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

function atLeast(actual: string, floor: string): boolean {
  const a = actual.split(".").map(Number);
  const b = floor.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const found = a[index] ?? 0;
    const required = b[index] ?? 0;
    if (found > required) return true;
    if (found < required) return false;
  }
  return true;
}

function writeDiagnosticLines(output: string): void {
  for (const line of output
    .split("\n")
    .filter((entry) => /Error|error|denied|quota|auth/u.test(entry))
    .slice(0, 2)) {
    process.stdout.write(`  ${line}\n`);
  }
}

async function main(): Promise<Outcome<number>> {
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

  const agy = Bun.which(process.env.AGY_BIN ?? "agy");
  if (agy === null)
    return {
      ok: false,
      error: "agy not on PATH — environment problem, not a model result",
    };
  const version = await run([agy, "--version"], 30_000);
  const foundVersion = version.output.match(/\d+\.\d+\.\d+/u)?.[0];
  if (foundVersion !== undefined && !atLeast(foundVersion, "1.1.2")) {
    process.stderr.write(
      `WARNING: agy ${foundVersion} is below the 1.1.2 floor — invalid-model downgrade + empty-stdout-swallow bugs may make probes unreliable (SKILL.md A1)\n`,
    );
  }

  if (models.length === 0) {
    process.stdout.write(`agy version: ${foundVersion ?? "unknown"}\n`);
    process.stdout.write(
      "roster (copy display strings VERBATIM — spaces/parens/capitalization are literal):\n",
    );
    const roster = await run([agy, "models"], 60_000);
    process.stdout.write(roster.output);
    return { ok: true, value: roster.exitCode === 0 ? 0 : 2 };
  }

  let failures = 0;
  for (const model of models) {
    const result = await run(
      [agy, "--model", model, "-p", "Reply with exactly: OK"],
      120_000,
    );
    if (result.exitCode === 0 && result.output.trim() === "OK") {
      process.stdout.write(
        `RESULT: AVAILABLE ${model} (usage: n/a — agy exposes none)\n`,
      );
      continue;
    }
    if (
      result.output.includes("not recognized as a known model") ||
      result.output.includes("is not recognized")
    ) {
      process.stdout.write(
        `RESULT: INVALID_NAME ${model} (exit ${result.exitCode}) — not an EXACT \`agy models\` display name; copy it verbatim incl. spaces/parens/capitalization\n`,
      );
      failures += 1;
      continue;
    }
    let note = `rc=${result.exitCode}`;
    if (result.exitCode === 0)
      note =
        "rc=0 but stdout != 'OK' (empty/other) — possible <1.1.2 swallowed-error landmine (antigravity-cli#76)";
    if (result.timedOut) note = "timeout — not a catalog verdict";
    process.stdout.write(`RESULT: INCONCLUSIVE ${model} (${note})\n`);
    writeDiagnosticLines(result.output);
    failures += 1;
  }
  return { ok: true, value: failures === 0 ? 0 : 1 };
}

const result = await Promise.try(main).then(
  (value): Outcome<number> => value,
  (error: unknown): Outcome<number> => ({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }),
);
if (!result.ok) {
  process.stderr.write(`FATAL: ${result.error}\n`);
  process.exit(2);
}
process.exit(result.value);
