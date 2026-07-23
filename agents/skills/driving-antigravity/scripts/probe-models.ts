/** FLOOR probe: a model string is available only when agy returns exactly OK. */

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

async function main(): Promise<void> {
  const agy = Bun.which(process.env.AGY_BIN ?? "agy");
  if (agy === null)
    throw new Error(
      "agy not on PATH — environment problem, not a model result",
    );
  const version = await run([agy, "--version"], 30_000);
  const foundVersion = version.output.match(/\d+\.\d+\.\d+/)?.[0];
  if (foundVersion !== undefined && !atLeast(foundVersion, "1.1.2")) {
    process.stderr.write(
      `WARNING: agy ${foundVersion} is below the 1.1.2 floor — invalid-model downgrade + empty-stdout-swallow bugs may make probes unreliable (SKILL.md A1)\n`,
    );
  }

  const models = Bun.argv.slice(2);
  if (models.length === 0) {
    process.stdout.write(`agy version: ${foundVersion ?? "unknown"}\n`);
    process.stdout.write(
      "roster (copy display strings VERBATIM — spaces/parens/capitalization are literal):\n",
    );
    const roster = await run([agy, "models"], 60_000);
    process.stdout.write(roster.output);
    process.exit(roster.exitCode === 0 ? 0 : 2);
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
    } else {
      const note = result.timedOut
        ? "timeout — not a catalog verdict"
        : result.exitCode === 0
          ? "rc=0 but stdout != 'OK' (empty/other) — possible <1.1.2 swallowed-error landmine (antigravity-cli#76)"
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
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
});
