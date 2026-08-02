/**
 * Structural floor for target-agnostic research run evidence packets.
 *
 * PASS proves packet structure only. It cannot establish scientific truth,
 * honest timestamps, actual actor independence, or semantic adequacy.
 */

import { cli } from "cleye";
import { validatePacketJoins } from "./research-run/joins";
import { type Finding, field, MAX_PACKET_COUNT } from "./research-run/model";
import {
  validateIntent,
  validateJudgment,
  validateReceipt,
} from "./research-run/packet-validation";
import { loadPacket } from "./research-run/parse";

function rejectPrototypeFlag(
  type: "argument" | "known-flag" | "unknown-flag",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__")
    throw new Error(`unknown option '--${flag}'`);
}

function nonEmptyPath(value: string | undefined): string {
  if (value === undefined || value.trim() === "")
    throw new Error("option requires a non-empty path");
  return value;
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "research-run-check.ts",
      parameters: [],
      flags: {
        intent: {
          description: "RUN INTENT path; repeat once per admitted run.",
          placeholder: "<path>",
          type: [nonEmptyPath],
        },
        judgment: {
          description: "One RETROSPECTIVE JUDGMENT path.",
          placeholder: "<path>",
          type: [nonEmptyPath],
        },
        receipt: {
          description: "Terminal RUN RECEIPT path; repeat once per intent.",
          placeholder: "<path>",
          type: [nonEmptyPath],
        },
      },
      help: {
        description:
          "Check research run packets structurally. Denominator digest = SHA-256(sorted unique RUN_IDs joined with LF plus trailing LF). Receipt interpretation detection is a bounded known-phrase heuristic. PASS is not semantic clearance.",
        examples: [
          "bun research-run-check.ts --intent run-a.intent.md --receipt run-a.receipt.md --judgment retrospective.md",
          "bun research-run-check.ts --judgment legacy-retrospective.md  # honest UNAUDITABLE only",
        ],
      },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0)
    throw new Error(`unexpected positional argument '${parsed._[0]}'`);
  const judgmentPaths = parsed.flags.judgment ?? [];
  if (judgmentPaths.length === 0)
    throw new Error("required option: --judgment <RETROSPECTIVE-JUDGMENT.md>");
  if (judgmentPaths.length !== 1)
    throw new Error("option --judgment must be provided exactly once");
  const judgmentPath = judgmentPaths[0];
  if (judgmentPath === undefined)
    throw new Error("required option: --judgment <RETROSPECTIVE-JUDGMENT.md>");
  const intentPaths = parsed.flags.intent ?? [];
  const receiptPaths = parsed.flags.receipt ?? [];
  if (intentPaths.length + receiptPaths.length + 1 > MAX_PACKET_COUNT)
    throw new Error(`packet count exceeds ${MAX_PACKET_COUNT}`);

  const findings: Finding[] = [];
  const [intents, receipts, judgment] = await Promise.all([
    Promise.all(
      intentPaths.map((path) => loadPacket(path, "intent", findings)),
    ),
    Promise.all(
      receiptPaths.map((path) => loadPacket(path, "receipt", findings)),
    ),
    loadPacket(judgmentPath, "judgment", findings),
  ]);
  for (const intent of intents) validateIntent(intent, findings);
  for (const receipt of receipts) validateReceipt(receipt, findings);
  validateJudgment(judgment, findings);
  validatePacketJoins(intents, receipts, judgment, findings);

  for (const finding of findings)
    process.stdout.write(
      `${finding.code}  FAIL     ${finding.path}: ${finding.message}\n`,
    );
  process.stdout.write("----\n");
  if (findings.length === 0) {
    process.stdout.write(
      `research-run floor: FAIL=0 intents=${intents.length} receipts=${receipts.length} auditability=${field(judgment, "AUDITABILITY") ?? "UNKNOWN"} (STRUCTURE ONLY; semantic judgment remains with directing-research)\n`,
    );
    return;
  }
  process.stdout.write(
    `research-run floor: FAIL=${findings.length} (STRUCTURE ONLY; repair the named packet mechanism)\n`,
  );
  process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\nRun 'bun research-run-check.ts --help' for usage.\n`,
  );
  process.exitCode = 2;
});
