/**
 * Goal Kernel management/readout CLI.
 * Consumer: agent/human. JSON mode emits one line. Exit 0 clean, 1 findings, 2 fatal.
 */

import { resolve } from "node:path";
import { cli, command } from "cleye";
import { err, fromAsyncThrowable, ok, type Result } from "neverthrow";
import { jsonText, z } from "../hooks/zod.ts";
import { errorMessage } from "../hooks/attempt.ts";
import {
  activateGoal,
  type GoalContract,
  readGoalStatus,
  recordRunDecision,
  resolveWorkspaceRoot,
  type GoalStatus,
} from "./kernel.ts";
import { buildPostmortem, type PostmortemReport } from "./postmortem.ts";

class UsageError extends Error {}

const RecordedDecisionSchema = z.object({ decision_id: z.unknown() });

let commandError: Error | undefined;

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

const commonFlags = {
  root: String,
  json: Boolean,
};

async function workspaceRoot(
  explicit: string | undefined,
): Promise<Result<string, Error>> {
  if (explicit !== undefined && explicit.trim() === "") {
    return err(new UsageError("flag value must not be empty"));
  }
  if (explicit !== undefined) return ok(resolve(explicit));
  const result = await fromAsyncThrowable(
    () => resolveWorkspaceRoot(process.cwd()),
    (error) => (error instanceof Error ? error : new Error(String(error))),
  )();
  return result;
}

async function requiredWorkspaceRoot(
  explicit: string | undefined,
): Promise<string | undefined> {
  const root = await workspaceRoot(explicit);
  if (root.isErr()) {
    commandError = root.error;
    return undefined;
  }
  return root.value;
}

async function readJsonFile(
  path: string,
  locus: string,
): Promise<Result<unknown, Error>> {
  const text = await fromAsyncThrowable(() => Bun.file(resolve(path)).text())();
  if (text.isErr()) {
    return err(
      new UsageError(
        `${locus} is unreadable JSON: ${errorMessage(text.error)}`,
      ),
    );
  }
  const parsed = jsonText.safeParse(text.value);
  if (!parsed.success) {
    return err(
      new UsageError(
        `${locus} is unreadable JSON: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      ),
    );
  }
  return ok(parsed.data);
}

function jsonLine(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function printStatus(status: GoalStatus): void {
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

function printPostmortem(
  report: Omit<PostmortemReport, "goal"> & { goal: GoalContract },
): void {
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

async function main(): Promise<Result<void, Error>> {
  commandError = undefined;
  const cliResult = await fromAsyncThrowable(
    () =>
      cli(
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
                  commandError = new UsageError(
                    `unexpected argument '${parsed._[1]}'`,
                  );
                  return;
                }
                const root = await requiredWorkspaceRoot(parsed.flags.root);
                if (root === undefined) return;
                const contract = await readJsonFile(
                  parsed._.contract,
                  "Goal contract",
                );
                if (contract.isErr()) {
                  commandError = contract.error;
                  return;
                }
                const result = await activateGoal(root, contract.value);
                if (result.isErr()) {
                  commandError = result.error;
                  return;
                }
                const value = result.value;
                if (parsed.flags.json === true) {
                  jsonLine({ ok: true, command: "activate", ...value });
                } else {
                  process.stdout.write(
                    `PASS activated goal=${value.goal_id} version=${value.goal_version} digest=${value.goal_digest} root=${value.workspace_root}\nFAIL=0\n`,
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
                  description:
                    "Show active Goal authority and recent bound runs.",
                },
              },
              async (parsed) => {
                if (parsed._.length > 0) {
                  commandError = new UsageError(
                    `unexpected argument '${parsed._[0]}'`,
                  );
                  return;
                }
                const root = await requiredWorkspaceRoot(parsed.flags.root);
                if (root === undefined) return;
                const statusResult = await readGoalStatus(root);
                if (statusResult.isErr()) {
                  commandError = statusResult.error;
                  return;
                }
                const status = statusResult.value;
                if (parsed.flags.json === true) {
                  jsonLine({
                    ok: status.configured,
                    command: "status",
                    ...status,
                  });
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
                  commandError = new UsageError(
                    `unexpected argument '${parsed._[2]}'`,
                  );
                  return;
                }
                const decision = await readJsonFile(
                  parsed._.decision,
                  "Run decision",
                );
                if (decision.isErr()) {
                  commandError = decision.error;
                  return;
                }
                const root = await requiredWorkspaceRoot(parsed.flags.root);
                if (root === undefined) return;
                const event = await recordRunDecision(
                  root,
                  parsed._.runId,
                  decision.value,
                );
                if (event.isErr()) {
                  commandError = event.error;
                  return;
                }
                const eventValue = event.value;
                if (parsed.flags.json === true) {
                  jsonLine({ ok: true, command: "decide", event: eventValue });
                } else {
                  const recorded = RecordedDecisionSchema.safeParse(
                    eventValue.decision,
                  );
                  const decisionId = recorded.success
                    ? recorded.data.decision_id
                    : undefined;
                  process.stdout.write(
                    `PASS run=${eventValue.run_id} decision=${String(decisionId)} event=${eventValue.event_id}\nFAIL=0\n`,
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
                  commandError = new UsageError(
                    `unexpected argument '${parsed._[1]}'`,
                  );
                  return;
                }
                const root = await requiredWorkspaceRoot(parsed.flags.root);
                if (root === undefined) return;
                const reportResult = await buildPostmortem(
                  root,
                  parsed._.runId,
                  // exactOptionalPropertyTypes: omit the key rather than pass an explicit
                  // undefined when the flag was not given.
                  parsed.flags.includeTranscript === undefined
                    ? {}
                    : { include_transcript: parsed.flags.includeTranscript },
                );
                if (reportResult.isErr()) {
                  commandError = reportResult.error;
                  return;
                }
                const report = reportResult.value;
                if (parsed.flags.json === true) {
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
          commandError = new UsageError(
            parsed._.verb === undefined
              ? "choose activate, status, decide, or postmortem"
              : `unknown command '${parsed._.verb}'`,
          );
        },
        Bun.argv.slice(2),
      ),
    (error) => (error instanceof Error ? error : new Error(String(error))),
  )();
  if (cliResult.isErr()) return err(cliResult.error);
  return commandError === undefined ? ok(undefined) : err(commandError);
}

if (import.meta.main) {
  const result = await main();
  result.match(
    () => {},
    (error) => {
      process.stderr.write(`FATAL: ${errorMessage(error)}\n`);
      process.exit(2);
    },
  );
}
