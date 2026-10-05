/**
 * Goal Kernel management/readout CLI.
 * Consumer: agent/human. JSON mode emits one line. Exit 0 clean, 1 findings, 2 fatal.
 */

import { resolve } from "node:path";
import { cli, command } from "cleye";
import { jsonText, z } from "../hooks/zod.ts";
import { attempt, errorMessage } from "../hooks/attempt.ts";
import {
  activateGoal,
  readGoalStatus,
  recordRunDecision,
  resolveWorkspaceRoot,
} from "./kernel.ts";
import { buildPostmortem, type PostmortemReport } from "./postmortem.ts";

class UsageError extends Error {}

const RecordedDecisionSchema = z.object({ decision_id: z.unknown() });

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new UsageError(`unknown option '--${flag}'`);
  }
}

function nonEmptyString(value: string): string {
  if (value.trim() === "") throw new UsageError("flag value must not be empty");
  return value;
}

const commonFlags = {
  root: nonEmptyString,
  json: Boolean,
};

function workspaceRoot(explicit: string | undefined): Promise<string> {
  return explicit === undefined
    ? resolveWorkspaceRoot(process.cwd())
    : Promise.resolve(resolve(explicit));
}

async function readJsonFile(path: string, locus: string): Promise<unknown> {
  const text = await attempt(() => Bun.file(resolve(path)).text());
  if (!text.ok) {
    throw new UsageError(
      `${locus} is unreadable JSON: ${errorMessage(text.error)}`,
    );
  }
  const parsed = jsonText.safeParse(text.value);
  if (!parsed.success) {
    throw new UsageError(
      `${locus} is unreadable JSON: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  return parsed.data;
}

function jsonLine(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function printStatus(status: Awaited<ReturnType<typeof readGoalStatus>>): void {
  if (!status.configured || status.active === undefined) {
    process.stdout.write(
      `FAIL root=${status.workspace_root} code=GK_NOT_CONFIGURED Goal Kernel is not active\nFAIL=1\n`,
    );
    return;
  }
  process.stdout.write(
    `PASS root=${status.workspace_root} goal=${status.active.goal.goal_id} version=${status.active.goal.goal_version} digest=${status.active.goal_digest}\n` +
      `RUNS=${status.runs.length}\nFAIL=0\n`,
  );
}

function printPostmortem(report: PostmortemReport): void {
  const completed = report.tools.filter(
    (tool) => tool.outcome === "completed",
  ).length;
  const failed = report.tools.filter(
    (tool) => tool.outcome === "failed",
  ).length;
  const denied = report.tools.filter(
    (tool) => tool.outcome === "denied",
  ).length;
  const unresolved = report.tools.filter(
    (tool) => tool.outcome === "not_observed_completed",
  ).length;
  process.stdout.write(
    `PASS run=${report.run_id} provider=${report.provider}\n` +
      `GOAL id=${report.goal.goal_id} version=${report.goal.goal_version} north_star=${JSON.stringify(report.goal.north_star)}\n` +
      `DECISIONS=${report.decisions.length} PROMPTS=${report.prompts.length} EVENTS=${report.events.length}\n` +
      `TOOLS completed=${completed} failed=${failed} denied=${denied} unresolved=${unresolved}\n`,
  );
  if (report.transcript !== undefined) {
    process.stdout.write(
      `TRANSCRIPT available=${report.transcript.available} messages=${report.transcript.messages.length} redactions=${report.transcript.redactions} parse_errors=${report.transcript.parse_errors} truncated=${report.transcript.truncated}\n`,
    );
  }
  for (const finding of report.findings) {
    process.stdout.write(`FINDING ${finding}\n`);
  }
  process.stdout.write(`FINDINGS=${report.findings.length}\n`);
}

async function main(): Promise<void> {
  await cli(
    {
      name: "goal-kernel",
      parameters: ["[verb]"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      help: {
        description:
          "Bind immutable Goal authority to Claude/Codex runs and reconstruct postmortem evidence.",
      },
      commands: [
        command(
          {
            name: "activate",
            parameters: ["<contract>"],
            flags: commonFlags,
            strictFlags: true,
            ignoreArgv: rejectPrototypeFlag,
            help: {
              description:
                "Validate, snapshot, and activate one Goal contract for future runs.",
            },
          },
          async (parsed) => {
            if (parsed._.length > 1) {
              throw new UsageError(`unexpected argument '${parsed._[1]}'`);
            }
            const root = await workspaceRoot(parsed.flags.root);
            const contract = await readJsonFile(
              parsed._.contract,
              "Goal contract",
            );
            const result = await activateGoal(root, contract);
            if (parsed.flags.json) {
              jsonLine({ ok: true, command: "activate", ...result });
            } else {
              process.stdout.write(
                `PASS activated goal=${result.goal_id} version=${result.goal_version} digest=${result.goal_digest} root=${result.workspace_root}\nFAIL=0\n`,
              );
            }
          },
        ),
        command(
          {
            name: "status",
            parameters: [],
            flags: commonFlags,
            strictFlags: true,
            ignoreArgv: rejectPrototypeFlag,
            help: {
              description: "Show active Goal authority and recent bound runs.",
            },
          },
          async (parsed) => {
            if (parsed._.length > 0) {
              throw new UsageError(`unexpected argument '${parsed._[0]}'`);
            }
            const status = await readGoalStatus(
              await workspaceRoot(parsed.flags.root),
            );
            if (parsed.flags.json) {
              jsonLine({ ok: status.configured, command: "status", ...status });
            } else {
              printStatus(status);
            }
            if (!status.configured) process.exitCode = 1;
          },
        ),
        command(
          {
            name: "decide",
            parameters: ["<runId>", "<decision>"],
            flags: commonFlags,
            strictFlags: true,
            ignoreArgv: rejectPrototypeFlag,
            help: {
              description:
                "Append an authority-bearing decision with parent and evidence references.",
            },
          },
          async (parsed) => {
            if (parsed._.length > 2) {
              throw new UsageError(`unexpected argument '${parsed._[2]}'`);
            }
            const decision = await readJsonFile(
              parsed._.decision,
              "Run decision",
            );
            const event = await recordRunDecision(
              await workspaceRoot(parsed.flags.root),
              parsed._.runId,
              decision,
            );
            if (parsed.flags.json) {
              jsonLine({ ok: true, command: "decide", event });
            } else {
              const recorded = RecordedDecisionSchema.safeParse(event.decision);
              const decisionId = recorded.success
                ? recorded.data.decision_id
                : undefined;
              process.stdout.write(
                `PASS run=${event.run_id} decision=${String(decisionId)} event=${event.event_id}\nFAIL=0\n`,
              );
            }
          },
        ),
        command(
          {
            name: "postmortem",
            parameters: ["<runId>"],
            flags: { ...commonFlags, includeTranscript: Boolean },
            strictFlags: true,
            ignoreArgv: rejectPrototypeFlag,
            help: {
              description:
                "Join Goal, decision, prompt-hash, tool-outcome, and optional native transcript evidence.",
            },
          },
          async (parsed) => {
            if (parsed._.length > 1) {
              throw new UsageError(`unexpected argument '${parsed._[1]}'`);
            }
            const report = await buildPostmortem(
              await workspaceRoot(parsed.flags.root),
              parsed._.runId,
              // exactOptionalPropertyTypes: omit the key rather than pass an explicit
              // undefined when the flag was not given.
              parsed.flags.includeTranscript === undefined
                ? {}
                : { include_transcript: parsed.flags.includeTranscript },
            );
            if (parsed.flags.json) {
              jsonLine({
                ok: report.findings.length === 0,
                command: "postmortem",
                report,
              });
            } else {
              printPostmortem(report);
            }
            if (report.findings.length > 0) process.exitCode = 1;
          },
        ),
      ],
    },
    (parsed) => {
      throw new UsageError(
        parsed._.verb === undefined
          ? "choose activate, status, decide, or postmortem"
          : `unknown command '${parsed._.verb}'`,
      );
    },
    Bun.argv.slice(2),
  );
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(
      `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  });
}
