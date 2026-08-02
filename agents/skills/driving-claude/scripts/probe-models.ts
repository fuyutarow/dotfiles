import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli } from "cleye";
import { isRecord, runClaude, type RunConfig } from "./run-claude.ts";

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

type ProbeKind = "AVAILABLE" | "INCONCLUSIVE" | "FATAL";

export type ProbeRecord = Readonly<{
  model: string;
  kind: ProbeKind;
  exitCode: number;
  detail: string;
}>;

export type ProbeOptions = Readonly<{
  claudeBin: string;
  maxBudgetUsd: number;
  timeoutMs: number;
}>;

export async function probeModels(
  models: readonly string[],
  options: ProbeOptions,
): Promise<ProbeRecord[]> {
  if (Bun.which(options.claudeBin) === null) {
    return models.map((model) => ({
      model,
      kind: "FATAL",
      exitCode: 2,
      detail:
        "claude binary is not runnable — environment problem, not a model result",
    }));
  }

  const records: ProbeRecord[] = [];
  for (const model of models) {
    const target = await mkdtemp(join(tmpdir(), "driving-claude-"));
    try {
      const config: RunConfig = {
        target,
        prompt: "Reply with exactly: OK",
        model,
        permissionMode: "plan",
        maxTurns: 1,
        timeoutMs: options.timeoutMs,
        maxBudgetUsd: options.maxBudgetUsd,
        safeMode: true,
        bare: false,
        claudeBin: options.claudeBin,
      };
      const run = await runClaude(config);
      const envelope = run.claude;
      const available =
        run.exitCode === 0 &&
        isRecord(envelope) &&
        typeof envelope.result === "string" &&
        typeof envelope.session_id === "string";
      const cost =
        available && isRecord(envelope)
          ? String(envelope.total_cost_usd ?? "?")
          : "?";
      const session =
        available && isRecord(envelope) ? String(envelope.session_id) : "?";
      records.push(
        available
          ? {
              model,
              kind: "AVAILABLE",
              exitCode: 0,
              detail: `session=${session} cost=${cost}`,
            }
          : {
              model,
              kind: "INCONCLUSIVE",
              exitCode: run.exitCode,
              detail:
                run.parseError ??
                nonEmpty(
                  run.stderr.slice(0, 500),
                  "no parseable Claude JSON envelope",
                ),
            },
      );
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  }
  return records;
}

function nonEmpty(value: string, fallback: string): string {
  return value === "" ? fallback : value;
}

function usage(): never {
  throw new Error("usage: bun probe-models.ts <model> [<model> ...]");
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "probe-models.ts",
      parameters: ["<models...>"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  const models = parsed._;
  if (models.length === 0) usage();
  const maxBudgetUsd = Number(
    process.env.CLAUDE_PROBE_MAX_BUDGET_USD ?? "0.20",
  );
  if (!Number.isFinite(maxBudgetUsd) || maxBudgetUsd <= 0) {
    throw new Error("CLAUDE_PROBE_MAX_BUDGET_USD must be a positive number");
  }
  const records = await probeModels(models, {
    claudeBin: process.env.CLAUDE_BIN ?? "claude",
    maxBudgetUsd,
    timeoutMs: 300_000,
  });
  for (const record of records) {
    process.stdout.write(
      `RESULT: ${record.kind} ${record.model} (${record.detail})\n`,
    );
    if (record.kind === "INCONCLUSIVE") {
      process.stdout.write(
        "  note: only exit 0 plus a parseable JSON result proves availability; verify spelling, auth, budget, and network before concluding otherwise\n",
      );
    }
  }
  process.exit(records.some((record) => record.kind !== "AVAILABLE") ? 1 : 0);
}

if (import.meta.main) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`FATAL: ${message}\n`);
    process.exit(2);
  });
}
