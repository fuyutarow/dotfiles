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

function usageError(message: string): void {
  process.stderr.write(
    `FATAL: ${message}\nRun 'bun research-run-check.ts --help' for usage.\n`,
  );
  process.exitCode = 2;
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
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
          type: [String],
        },
        judgment: {
          description: "One RETROSPECTIVE JUDGMENT path.",
          placeholder: "<path>",
          type: [String],
        },
        receipt: {
          description: "Terminal RUN RECEIPT path; repeat once per intent.",
          placeholder: "<path>",
          type: [String],
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
  if (parsed._.length > 0) {
    usageError(`unexpected positional argument '${parsed._[0]}'`);
    return;
  }
  const judgmentPaths = parsed.flags.judgment ?? [];
  if (judgmentPaths.length === 0) {
    usageError("required option: --judgment <RETROSPECTIVE-JUDGMENT.md>");
    return;
  }
  if (judgmentPaths.length !== 1) {
    usageError("option --judgment must be provided exactly once");
    return;
  }
  const judgmentPath = judgmentPaths[0];
  if (judgmentPath === undefined || judgmentPath.trim() === "") {
    usageError(
      judgmentPath === undefined
        ? "required option: --judgment <RETROSPECTIVE-JUDGMENT.md>"
        : "option requires a non-empty path",
    );
    return;
  }
  const intentPaths = parsed.flags.intent ?? [];
  const receiptPaths = parsed.flags.receipt ?? [];
  if ([...intentPaths, ...receiptPaths].some((path) => path.trim() === "")) {
    usageError("option requires a non-empty path");
    return;
  }
  if (intentPaths.length + receiptPaths.length + 1 > MAX_PACKET_COUNT) {
    usageError(`packet count exceeds ${MAX_PACKET_COUNT}`);
    return;
  }

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
  const packetResults = [...intents, ...receipts, judgment];
  const packetError = packetResults.find((packet) => !packet.ok);
  if (packetError !== undefined && !packetError.ok) {
    process.stderr.write(
      `FATAL: ${packetError.error}\nRun 'bun research-run-check.ts --help' for usage.\n`,
    );
    process.exitCode = 2;
    return;
  }
  const intentPackets = intents.flatMap((packet) =>
    packet.ok ? [packet.value] : [],
  );
  const receiptPackets = receipts.flatMap((packet) =>
    packet.ok ? [packet.value] : [],
  );
  if (!judgment.ok) return;
  for (const intent of intentPackets) validateIntent(intent, findings);
  for (const receipt of receiptPackets) validateReceipt(receipt, findings);
  validateJudgment(judgment.value, findings);
  validatePacketJoins(intentPackets, receiptPackets, judgment.value, findings);

  for (const finding of findings)
    process.stdout.write(
      `${finding.code}  FAIL     ${finding.path}: ${finding.message}\n`,
    );
  process.stdout.write("----\n");
  if (findings.length === 0) {
    process.stdout.write(
      `research-run floor: FAIL=0 intents=${intentPackets.length} receipts=${receiptPackets.length} auditability=${field(judgment.value, "AUDITABILITY") ?? "UNKNOWN"} (STRUCTURE ONLY; semantic judgment remains with directing-research)\n`,
    );
    return;
  }
  process.stdout.write(
    `research-run floor: FAIL=${findings.length} (STRUCTURE ONLY; repair the named packet mechanism)\n`,
  );
  process.exitCode = 1;
}

await main().catch((error) => {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\nRun 'bun research-run-check.ts --help' for usage.\n`,
  );
  process.exitCode = 2;
});
