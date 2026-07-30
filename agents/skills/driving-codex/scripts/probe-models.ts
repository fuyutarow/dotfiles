/** FLOOR probe: account/model availability only, never semantic selection. */

import { typeFlag } from "type-flag";

function rejectUnknownFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag") {
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
  cwd: string,
  timeoutMs: number,
): Promise<CommandResult> {
  const signal = AbortSignal.timeout(timeoutMs);
  const child = Bun.spawn(command, {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    signal: signal,
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

function firstMatches(
  text: string,
  expression: RegExp,
  limit: number,
): string[] {
  return text
    .split("\n")
    .filter((line) => expression.test(line))
    .slice(0, limit);
}

async function main(): Promise<void> {
  const parsed = typeFlag({}, Bun.argv.slice(2), {
    ignore: rejectUnknownFlag,
  });
  const unknownFlag = Object.keys(parsed.unknownFlags)[0];
  if (unknownFlag !== undefined)
    throw new Error(`unknown option '--${unknownFlag}'`);
  const models = parsed._;
  if (models.length === 0)
    throw new Error("usage: bun probe-models.ts <model> [...]");
  const codex = Bun.which(process.env.CODEX_BIN ?? "codex");
  if (codex === null)
    throw new Error(
      "codex not on PATH — environment problem, not a model result",
    );
  const cwd = process.env.PROBE_DIR ?? process.cwd();
  let failures = 0;

  for (const model of models) {
    const result = await run(
      [
        codex,
        "exec",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "-C",
        cwd,
        "-m",
        model,
        "-c",
        'model_reasoning_effort="low"',
        "Reply with exactly: OK",
      ],
      cwd,
      120_000,
    );
    if (result.exitCode === 0) {
      const tokens =
        result.output
          .match(/tokens used\s*\n\s*([^\n]+)/i)?.[1]
          ?.replaceAll(" ", "") ?? "?";
      process.stdout.write(`RESULT: AVAILABLE ${model} (${tokens} tokens)\n`);
      continue;
    }

    const note = result.timedOut
      ? " — timeout, not a catalog verdict"
      : result.exitCode === 127
        ? " — codex not runnable, environment problem"
        : "";
    process.stdout.write(
      `RESULT: UNAVAILABLE ${model} (exit ${result.exitCode})${note}\n`,
    );
    for (const line of firstMatches(
      result.output,
      /ERROR|error|Not inside a trusted|stream/,
      2,
    )) {
      process.stdout.write(`  ${line}\n`);
    }
    if (result.output.includes("model is not supported")) {
      process.stdout.write(
        "  note: 400 is AMBIGUOUS — a wrong/short ID of a real model errors identically to a not-rolled-out one; verify the exact ID (references/model-catalog.md) before concluding non-existence\n",
      );
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
