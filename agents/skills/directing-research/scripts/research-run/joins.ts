import {
  addFinding,
  denominatorDigest,
  type Finding,
  field,
  type LoadedPacket,
} from "./model";
import { parseIdList, parseTimestamp } from "./primitives";

function indexedPackets(
  packets: readonly LoadedPacket[],
  label: string,
  findings: Finding[],
): Map<string, LoadedPacket> {
  const indexed = new Map<string, LoadedPacket>();
  for (const packet of packets) {
    const runId = field(packet, "RUN_ID");
    if (runId === undefined) continue;
    const prior = indexed.get(runId);
    if (prior !== undefined)
      addFinding(
        findings,
        "RR002",
        packet.path,
        `duplicate ${label} RUN_ID ${runId}; first seen in ${prior.path}`,
      );
    else indexed.set(runId, packet);
  }
  return indexed;
}

function sameSet(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  return (
    left.size === right.size && [...left].every((value) => right.has(value))
  );
}

function setDifference(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): Set<string> {
  return new Set([...left].filter((value) => !right.has(value)));
}

function formatSet(values: ReadonlySet<string>): string {
  return [...values].sort().join(",") || "NONE";
}

function validateReceiptJoins(
  intentsById: ReadonlyMap<string, LoadedPacket>,
  receiptsById: ReadonlyMap<string, LoadedPacket>,
  findings: Finding[],
): void {
  for (const [runId, receipt] of receiptsById) {
    const intent = intentsById.get(runId);
    if (intent === undefined) {
      addFinding(
        findings,
        "RR011",
        receipt.path,
        `receipt ${runId} has no supplied matching intent`,
      );
      continue;
    }
    if (field(receipt, "INTENT_SHA256") !== intent.digest)
      addFinding(
        findings,
        "RR011",
        receipt.path,
        `INTENT_SHA256 does not match exact bytes of intent ${runId}`,
      );
    const registered = parseTimestamp(field(intent, "REGISTERED_AT"), false);
    const started = parseTimestamp(field(receipt, "STARTED_AT"), true);
    const ended = parseTimestamp(field(receipt, "ENDED_AT"), true);
    if (
      registered.kind === "value" &&
      started.kind === "value" &&
      registered.epochNanoseconds > started.epochNanoseconds
    )
      addFinding(
        findings,
        "RR010",
        receipt.path,
        `RUN_ID ${runId} violates REGISTERED_AT <= STARTED_AT`,
      );
    if (
      started.kind === "value" &&
      ended.kind === "value" &&
      started.epochNanoseconds > ended.epochNanoseconds
    )
      addFinding(
        findings,
        "RR010",
        receipt.path,
        `RUN_ID ${runId} violates STARTED_AT <= ENDED_AT`,
      );
  }
}

export function validatePacketJoins(
  intents: readonly LoadedPacket[],
  receipts: readonly LoadedPacket[],
  judgment: LoadedPacket,
  findings: Finding[],
): void {
  const intentsById = indexedPackets(intents, "intent", findings);
  const receiptsById = indexedPackets(receipts, "receipt", findings);
  validateReceiptJoins(intentsById, receiptsById, findings);

  const judgmentRunIds = parseIdList(judgment, "RUN_IDS", false, findings);
  const missingRunIds = parseIdList(
    judgment,
    "MISSING_RECEIPT_RUN_IDS",
    true,
    findings,
  );
  const judgmentSet = new Set(judgmentRunIds);
  const missingSet = new Set(missingRunIds);
  const intentSet = new Set(intentsById.keys());
  const receiptSet = new Set(receiptsById.keys());
  if ([...missingSet].some((runId) => !judgmentSet.has(runId)))
    addFinding(
      findings,
      "RR012",
      judgment.path,
      "MISSING_RECEIPT_RUN_IDS must be a subset of RUN_IDS",
    );
  const computedDigest = denominatorDigest(judgmentRunIds);
  if (field(judgment, "DENOMINATOR_SHA256") !== computedDigest)
    addFinding(
      findings,
      "RR012",
      judgment.path,
      `DENOMINATOR_SHA256 mismatch: expected ${computedDigest}`,
    );

  const auditability = field(judgment, "AUDITABILITY");
  if (auditability === "AUDITABLE") {
    if (
      !sameSet(intentSet, receiptSet) ||
      !sameSet(intentSet, judgmentSet) ||
      missingSet.size !== 0
    )
      addFinding(
        findings,
        "RR016",
        judgment.path,
        `AUDITABLE requires intent=receipt=RUN_IDS and no missing list; intents=${formatSet(intentSet)} receipts=${formatSet(receiptSet)} judgment=${formatSet(judgmentSet)} missing=${formatSet(missingSet)}`,
      );
  } else if (auditability === "PARTIAL") {
    const expectedMissing = setDifference(intentSet, receiptSet);
    if (
      intentSet.size === 0 ||
      !sameSet(intentSet, judgmentSet) ||
      [...receiptSet].some((runId) => !intentSet.has(runId)) ||
      !sameSet(missingSet, expectedMissing)
    )
      addFinding(
        findings,
        "RR016",
        judgment.path,
        `PARTIAL requires RUN_IDS=intents and missing=intents-receipts; intents=${formatSet(intentSet)} receipts=${formatSet(receiptSet)} missing=${formatSet(missingSet)} expected-missing=${formatSet(expectedMissing)}`,
      );
  } else if (auditability === "UNAUDITABLE") {
    const expectedMissing = setDifference(judgmentSet, receiptSet);
    if (
      [...intentSet].some((runId) => !judgmentSet.has(runId)) ||
      !sameSet(missingSet, expectedMissing)
    )
      addFinding(
        findings,
        "RR016",
        judgment.path,
        `UNAUDITABLE requires supplied intents subset RUN_IDS and missing=RUN_IDS-receipts; intents=${formatSet(intentSet)} receipts=${formatSet(receiptSet)} judgment=${formatSet(judgmentSet)} missing=${formatSet(missingSet)} expected-missing=${formatSet(expectedMissing)}`,
      );
  }
}
