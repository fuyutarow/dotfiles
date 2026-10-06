/** FLOOR probe: account/model availability only, never semantic selection. */

import { cli } from "cleye";

type Outcome =
  | { ok: true; exitCode: number }
  | { ok: false; error: string; exitCode: 1 | 2 };

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

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

async function main(): Promise<Outcome> {
  const args = Bun.argv.slice(2);
  if (args.includes("--__proto__"))
    return {
      ok: false,
      error: "unknown option '--__proto__'",
      exitCode: 2,
    };
  if (args.length === 0) {
    return {
      ok: false,
      error: 'Missing required parameter "models"',
      exitCode: 1,
    };
  }
  const parsed = cli(
    {
      name: "probe-models.ts",
      parameters: ["<models...>"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    args,
  );
  const models = parsed._;
  if (models.length === 0)
    return {
      ok: false,
      error: 'Missing required parameter "models"',
      exitCode: 1,
    };
  const codex = Bun.which(process.env.CODEX_BIN ?? "codex");
  if (codex === null)
    return {
      ok: false,
      error: "codex not on PATH — environment problem, not a model result",
      exitCode: 2,
    };
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
          .match(/tokens used\s*\n\s*([^\n]+)/iu)?.[1]
          ?.replaceAll(" ", "") ?? "?";
      process.stdout.write(`RESULT: AVAILABLE ${model} (${tokens} tokens)\n`);
      continue;
    }

    let note: string;
    if (result.timedOut) {
      note = " — timeout, not a catalog verdict";
    } else if (result.exitCode === 127) {
      note = " — codex not runnable, environment problem";
    } else {
      note = "";
    }
    process.stdout.write(
      `RESULT: UNAVAILABLE ${model} (exit ${result.exitCode})${note}\n`,
    );
    for (const line of firstMatches(
      result.output,
      /ERROR|error|Not inside a trusted|stream/u,
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
  return { ok: true, exitCode: failures === 0 ? 0 : 1 };
}

const outcome = await Promise.try(main).then(
  (value) => value,
  (error: unknown): Outcome => ({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    exitCode: 2,
  }),
);
if (!outcome.ok) {
  if (outcome.exitCode === 1) {
    process.stderr.write(`Error: ${outcome.error}\n\n`);
    process.stdout.write("Usage: probe-models.ts [flags...] <models...>\n");
  } else {
    process.stderr.write(`FATAL: ${outcome.error}\n`);
  }
  process.exit(outcome.exitCode);
}
process.exit(outcome.exitCode);
