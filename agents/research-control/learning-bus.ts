import { createHash } from "node:crypto";
import { checkTrace, type Finding, type TraceResult } from "./trace.ts";

/** A deliberately small, closed V0 wire for checking lateral transfer records. */
export const LEARNING_BUS_SCHEMA = "cross-section-learning-bus/v1";

type RecordValue = Record<string, unknown>;
type Envelope = {
  id: string;
  kind: ArtifactKind;
  locator: string;
  at: string;
  body: RecordValue;
  sha256: string;
  dependencies: Dependency[];
};
type ArtifactKind =
  | "SECTION_TRANSFER_PACKET"
  | "SECTION_SUBSCRIPTION"
  | "SECTION_TRANSFER_DELIVERY"
  | "SECTION_TRANSFER_ADMISSION"
  | "SECTION_TRANSFER_COMMIT";
type Dependency = { kind: string; id: string; sha256: string };
type BusFinding = Finding & { artifactId?: string };

const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const SHA = /^[a-f0-9]{64}$/;
const KINDS = new Set<ArtifactKind>([
  "SECTION_TRANSFER_PACKET",
  "SECTION_SUBSCRIPTION",
  "SECTION_TRANSFER_DELIVERY",
  "SECTION_TRANSFER_ADMISSION",
  "SECTION_TRANSFER_COMMIT",
]);
const DELTAS = new Set([
  "supports",
  "weakens",
  "kills",
  "scope-narrows",
  "instrument-break",
  "mapping-break",
]);
const ADMISSIONS = new Set(["ADOPT", "REJECT", "DEFER"]);
const BARRIERS =
  /(?:^|[_-])(?:ACK(?:NOWLEDG(?:EMENT)?)?|QUORUM|WAVE|ALL[_-]?RECIPIENT|GLOBAL)(?:$|[_-])/i;
const SUPERVISOR = /(?:SUPERVISOR|VERIFIER|PROGRAMME)/i;

function record(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}
function timestamp(value: unknown): value is number | undefined {
  if (!text(value) || !RFC3339.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}
function digest(value: unknown): value is string {
  return typeof value === "string" && SHA.test(value);
}
function strings(value: unknown, allowEmpty = false): value is string[] {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every(text) &&
    new Set(value).size === value.length
  );
}
function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    actual.every((key, i) => key === [...keys].sort()[i])
  );
}

/**
 * Canonicalization is recursive key-sorted JSON with no unsupported JSON values.
 * This gives every implementation the same bytes before SHA-256; declared hashes
 * are therefore evidence to verify, never input to trust.
 */
export function canonicalJson(value: unknown): string | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number")
    return Number.isFinite(value) ? JSON.stringify(value) : undefined;
  if (Array.isArray(value)) {
    const entries = value.map(canonicalJson);
    return entries.some((entry) => entry === undefined)
      ? undefined
      : `[${entries.join(",")}]`;
  }
  if (!record(value)) return undefined;
  const entries: string[] = [];
  for (const key of Object.keys(value).sort()) {
    const entry = canonicalJson(value[key]);
    if (entry === undefined) return undefined;
    entries.push(`${JSON.stringify(key)}:${entry}`);
  }
  return `{${entries.join(",")}}`;
}
export function bodySha256(body: unknown): string | undefined {
  const canonical = canonicalJson(body);
  return canonical === undefined
    ? undefined
    : createHash("sha256").update(canonical).digest("hex");
}
function add(
  findings: BusFinding[],
  code: string,
  message: string,
  artifactId?: string,
): void {
  findings.push({
    code,
    message,
    ...(artifactId === undefined ? {} : { artifactId }),
  });
}
function dependencies(value: unknown): value is Dependency[] {
  return (
    Array.isArray(value) &&
    value.every(
      (dependency) =>
        record(dependency) &&
        exactKeys(dependency, ["kind", "id", "sha256"]) &&
        text(dependency.kind) &&
        text(dependency.id) &&
        digest(dependency.sha256),
    )
  );
}
function envelope(value: unknown): value is Envelope {
  return (
    record(value) &&
    exactKeys(value, [
      "id",
      "kind",
      "locator",
      "at",
      "body",
      "sha256",
      "dependencies",
    ]) &&
    text(value.id) &&
    typeof value.kind === "string" &&
    KINDS.has(value.kind as ArtifactKind) &&
    text(value.locator) &&
    timestamp(value.at) !== undefined &&
    record(value.body) &&
    digest(value.sha256) &&
    dependencies(value.dependencies)
  );
}
function dependencySet(deps: Dependency[], expected: Dependency[]): boolean {
  if (deps.length !== expected.length) return false;
  const actual = deps
    .map((d) => `${d.kind}\u0000${d.id}\u0000${d.sha256}`)
    .sort();
  const wanted = expected
    .map((d) => `${d.kind}\u0000${d.id}\u0000${d.sha256}`)
    .sort();
  return actual.every((value, index) => value === wanted[index]);
}
function hasForbiddenDependency(
  envelope: Envelope,
  findings: BusFinding[],
): boolean {
  let bad = false;
  for (const dependency of envelope.dependencies) {
    if (SUPERVISOR.test(dependency.kind) || SUPERVISOR.test(dependency.id)) {
      add(
        findings,
        "SUPERVISOR_IN_TRANSFER_PATH",
        "Supervisor or verifier dependency is on the transfer path",
        envelope.id,
      );
      bad = true;
    }
    if (BARRIERS.test(dependency.kind) || BARRIERS.test(dependency.id)) {
      add(
        findings,
        "TRANSFER_GLOBAL_BARRIER",
        "global acknowledgement, quorum, or wave dependency is forbidden",
        envelope.id,
      );
      bad = true;
    }
  }
  return bad;
}
function allBodyText(body: RecordValue, names: readonly string[]): boolean {
  return names.every((name) => text(body[name]));
}
function packetBody(body: RecordValue): boolean {
  const keys = [
    "transferId",
    "sourceSectionId",
    "sourceDirectorInstanceId",
    "sourceDirectorRoleGrant",
    "sourceCommitLocus",
    "sourceCommitSha256",
    "sourceReceiptDigests",
    "topicIds",
    "affectedPremiseIds",
    "interfaceIds",
    "outcomeClass",
    "deltaClass",
    "applicabilityPredicate",
    "contraindication",
    "uncertainty",
    "evidenceLocator",
    "evidenceSha256",
    "visibility",
    "programmeVisible",
    "rawHumanMethodIncluded",
    "authority",
  ];
  return (
    exactKeys(body, keys) &&
    allBodyText(body, [
      "transferId",
      "sourceSectionId",
      "sourceDirectorInstanceId",
      "sourceDirectorRoleGrant",
      "sourceCommitLocus",
      "outcomeClass",
      "applicabilityPredicate",
      "contraindication",
      "uncertainty",
      "evidenceLocator",
    ]) &&
    digest(body.sourceCommitSha256) &&
    digest(body.evidenceSha256) &&
    strings(body.sourceReceiptDigests) &&
    strings(body.topicIds) &&
    strings(body.affectedPremiseIds, true) &&
    strings(body.interfaceIds, true) &&
    DELTAS.has(String(body.deltaClass)) &&
    body.visibility === "SECTION_FEDERATION_ONLY" &&
    body.programmeVisible === false &&
    body.rawHumanMethodIncluded === false &&
    body.authority === "PROPOSAL_ONLY"
  );
}
function subscriptionBody(body: RecordValue): boolean {
  const keys = [
    "subscriptionId",
    "recipientSectionId",
    "sectionMandateLocus",
    "sectionMandateSha256",
    "mandateRevision",
    "mandateFence",
    "sectionCharterLocus",
    "sectionCharterSha256",
    "recipientDirectorInstanceId",
    "recipientDirectorRoleGrant",
    "topicIds",
    "affectedPremiseIds",
    "interfaceIds",
    "acceptedDeltaClasses",
    "eventLogCursor",
    "effectiveAt",
    "expiresAt",
    "immutable",
    "visibility",
    "programmeVisible",
    "authority",
  ];
  return (
    exactKeys(body, keys) &&
    allBodyText(body, [
      "subscriptionId",
      "recipientSectionId",
      "sectionMandateLocus",
      "mandateFence",
      "sectionCharterLocus",
      "recipientDirectorInstanceId",
      "recipientDirectorRoleGrant",
      "eventLogCursor",
    ]) &&
    digest(body.sectionMandateSha256) &&
    digest(body.sectionCharterSha256) &&
    Number.isInteger(body.mandateRevision) &&
    (body.mandateRevision as number) >= 0 &&
    strings(body.topicIds) &&
    strings(body.affectedPremiseIds, true) &&
    strings(body.interfaceIds, true) &&
    strings(body.acceptedDeltaClasses) &&
    body.acceptedDeltaClasses.every((delta) => DELTAS.has(delta)) &&
    timestamp(body.effectiveAt) !== undefined &&
    timestamp(body.expiresAt) !== undefined &&
    timestamp(body.expiresAt)! > timestamp(body.effectiveAt)! &&
    body.immutable === true &&
    body.visibility === "SECTION_FEDERATION_CONTROL" &&
    body.programmeVisible === false &&
    body.authority === "ROUTING_FILTER_ONLY"
  );
}
function deliveryBody(body: RecordValue): boolean {
  const keys = [
    "deliveryId",
    "transferLocus",
    "transferSha256",
    "recipientSectionId",
    "subscriptionLocus",
    "subscriptionSha256",
    "matchedTopicIds",
    "matchedPremiseIds",
    "matchedInterfaceIds",
    "matchedDeltaClass",
    "idempotencyKey",
    "enqueuedAt",
    "deliveredAt",
    "brokerKind",
    "ackRequired",
    "semanticAuthority",
    "programmeVisible",
  ];
  return (
    exactKeys(body, keys) &&
    allBodyText(body, [
      "deliveryId",
      "transferLocus",
      "recipientSectionId",
      "subscriptionLocus",
      "idempotencyKey",
    ]) &&
    digest(body.transferSha256) &&
    digest(body.subscriptionSha256) &&
    strings(body.matchedTopicIds) &&
    strings(body.matchedPremiseIds, true) &&
    strings(body.matchedInterfaceIds, true) &&
    DELTAS.has(String(body.matchedDeltaClass)) &&
    timestamp(body.enqueuedAt) !== undefined &&
    timestamp(body.deliveredAt) !== undefined &&
    timestamp(body.deliveredAt)! >= timestamp(body.enqueuedAt)! &&
    body.brokerKind === "DETERMINISTIC_EXACT_MATCH" &&
    body.ackRequired === false &&
    body.semanticAuthority === "NONE" &&
    body.programmeVisible === false
  );
}
function admissionBody(body: RecordValue): boolean {
  const keys = [
    "admissionId",
    "recipientSectionId",
    "recipientDirectorInstanceId",
    "recipientDirectorRoleGrant",
    "sectionMandateLocus",
    "sectionMandateSha256",
    "mandateRevision",
    "mandateFence",
    "sectionCharterLocus",
    "sectionCharterSha256",
    "deliveryLocus",
    "deliverySha256",
    "transferLocus",
    "transferSha256",
    "subscriptionLocus",
    "subscriptionSha256",
    "idempotencyKey",
    "decision",
    "reasonClass",
    "decidedAt",
    "localStateMutation",
    "programmeVisible",
    "authority",
  ];
  return (
    exactKeys(body, keys) &&
    allBodyText(body, [
      "admissionId",
      "recipientSectionId",
      "recipientDirectorInstanceId",
      "recipientDirectorRoleGrant",
      "sectionMandateLocus",
      "mandateFence",
      "sectionCharterLocus",
      "deliveryLocus",
      "transferLocus",
      "subscriptionLocus",
      "idempotencyKey",
      "reasonClass",
    ]) &&
    digest(body.sectionMandateSha256) &&
    digest(body.sectionCharterSha256) &&
    Number.isInteger(body.mandateRevision) &&
    (body.mandateRevision as number) >= 0 &&
    digest(body.deliverySha256) &&
    digest(body.transferSha256) &&
    digest(body.subscriptionSha256) &&
    ADMISSIONS.has(String(body.decision)) &&
    timestamp(body.decidedAt) !== undefined &&
    typeof body.localStateMutation === "boolean" &&
    body.programmeVisible === false &&
    body.authority === "ADMISSION_ONLY"
  );
}
function commitBody(body: RecordValue): boolean {
  const keys = [
    "transferCommitId",
    "recipientSectionId",
    "recipientDirectorInstanceId",
    "recipientDirectorRoleGrant",
    "sectionMandateLocus",
    "sectionMandateSha256",
    "mandateRevision",
    "mandateFence",
    "sectionCharterLocus",
    "sectionCharterSha256",
    "admissionLocus",
    "admissionSha256",
    "transferLocus",
    "transferSha256",
    "idempotencyKey",
    "localEffect",
    "stateLocus",
    "stateBeforeSha256",
    "stateAfterSha256",
    "committedAt",
    "searchCredit",
    "learnCredit",
    "programmeVisible",
    "authority",
  ];
  return (
    exactKeys(body, keys) &&
    allBodyText(body, [
      "transferCommitId",
      "recipientSectionId",
      "recipientDirectorInstanceId",
      "recipientDirectorRoleGrant",
      "sectionMandateLocus",
      "mandateFence",
      "sectionCharterLocus",
      "admissionLocus",
      "transferLocus",
      "idempotencyKey",
      "stateLocus",
    ]) &&
    digest(body.sectionMandateSha256) &&
    digest(body.sectionCharterSha256) &&
    Number.isInteger(body.mandateRevision) &&
    (body.mandateRevision as number) >= 0 &&
    digest(body.admissionSha256) &&
    digest(body.transferSha256) &&
    digest(body.stateBeforeSha256) &&
    digest(body.stateAfterSha256) &&
    ["PRIOR_UPDATE", "CANDIDATE_TEST_INPUT"].includes(
      String(body.localEffect),
    ) &&
    timestamp(body.committedAt) !== undefined &&
    body.searchCredit === "NONE" &&
    body.learnCredit === "NONE" &&
    body.programmeVisible === false &&
    body.authority === "LOCAL_SECTION_STATE_ONLY"
  );
}
function matches(packet: RecordValue, subscription: RecordValue): boolean {
  const includes = (available: string[], required: string[]) =>
    required.every((value) => available.includes(value));
  return (
    includes(subscription.topicIds as string[], packet.topicIds as string[]) &&
    includes(
      subscription.affectedPremiseIds as string[],
      packet.affectedPremiseIds as string[],
    ) &&
    includes(
      subscription.interfaceIds as string[],
      packet.interfaceIds as string[],
    ) &&
    (subscription.acceptedDeltaClasses as string[]).includes(
      packet.deltaClass as string,
    )
  );
}
function bodyValid(kind: ArtifactKind, body: RecordValue): boolean {
  return (
    {
      SECTION_TRANSFER_PACKET: packetBody,
      SECTION_SUBSCRIPTION: subscriptionBody,
      SECTION_TRANSFER_DELIVERY: deliveryBody,
      SECTION_TRANSFER_ADMISSION: admissionBody,
      SECTION_TRANSFER_COMMIT: commitBody,
    } as const
  )[kind](body);
}

/**
 * V0 percentile rule: nearest rank, at ceil(percentile * n) after ascending sort.
 * Empty propagation samples have no latency and are represented by null.
 */
export function nearestRankPercentile(
  values: readonly number[],
  percentile: number,
): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(percentile * sorted.length) - 1];
}

export type LearningBusResult = {
  ok: boolean;
  schema: typeof LEARNING_BUS_SCHEMA;
  findings: BusFinding[];
  source: TraceResult["summary"] | null;
  metrics: {
    transferPacketsPublished: number;
    transferDeliveries: number;
    transferAdmissionsByClass: { ADOPT: number; REJECT: number; DEFER: number };
    transferCommits: number;
    transferReplayDrops: number;
    unroutedTransferPackets: number;
    programmeVisibilityViolations: number;
    commitToDeliveryMs: { p50: number | null; p95: number | null };
    deliveryToAdmissionMs: { p50: number | null; p95: number | null };
  };
};

export function checkLearningBus(input: unknown): LearningBusResult {
  const findings: BusFinding[] = [];
  const zero = {
    transferPacketsPublished: 0,
    transferDeliveries: 0,
    transferAdmissionsByClass: { ADOPT: 0, REJECT: 0, DEFER: 0 },
    transferCommits: 0,
    transferReplayDrops: 0,
    unroutedTransferPackets: 0,
    programmeVisibilityViolations: 0,
    commitToDeliveryMs: { p50: null, p95: null },
    deliveryToAdmissionMs: { p50: null, p95: null },
  };
  const finish = (
    source: TraceResult["summary"] | null = null,
    metrics = zero,
  ): LearningBusResult => ({
    ok: findings.length === 0,
    schema: LEARNING_BUS_SCHEMA,
    findings,
    source,
    metrics,
  });
  if (
    !record(input) ||
    !exactKeys(input, [
      "schema",
      "evaluatedAt",
      "sourceTrace",
      "sourceCommitEventId",
      "artifacts",
    ]) ||
    input.schema !== LEARNING_BUS_SCHEMA ||
    timestamp(input.evaluatedAt) === undefined ||
    !text(input.sourceCommitEventId) ||
    !record(input.artifacts)
  ) {
    add(
      findings,
      "BUS_INVALID",
      "closed bus input requires source trace, selected commit, evaluated time, and artifact envelopes",
    );
    return finish();
  }
  if (
    Object.keys(input).some((key) =>
      /(?:searchReceipts|learningCommits|searchPerHour|learnPerHour)/.test(key),
    )
  )
    add(
      findings,
      "BUS_INVALID",
      "scientific counters are derived from the validated source trace",
    );
  const source = checkTrace(input.sourceTrace);
  if (!source.ok) {
    add(findings, "TRANSFER_WITHOUT_COMMIT", "source trace is not valid");
    return finish(source.summary);
  }
  const events = (input.sourceTrace as RecordValue).events as RecordValue[];
  const selected = events.find(
    (event) => event.id === input.sourceCommitEventId,
  );
  if (
    !record(selected) ||
    selected.kind !== "DIRECTOR_COMMIT" ||
    selected.decision !== "COMMIT" ||
    !digest(selected.artifactSha256) ||
    !digest(selected.receiptSha256) ||
    !source.summary.receiptDigests.includes(selected.receiptSha256)
  ) {
    add(
      findings,
      "TRANSFER_WITHOUT_COMMIT",
      "selected event must be a committed Director event with exact commit and receipt digests",
    );
    return finish(source.summary);
  }
  const kinds = [
    "packets",
    "subscriptions",
    "deliveries",
    "admissions",
    "commits",
  ] as const;
  if (
    !exactKeys(input.artifacts, kinds) ||
    !kinds.every((kind) => Array.isArray(input.artifacts[kind]))
  ) {
    add(
      findings,
      "BUS_INVALID",
      "artifacts must provide all five closed envelope arrays",
    );
    return finish(source.summary);
  }
  const all = kinds.flatMap((kind) => input.artifacts[kind] as unknown[]);
  const envelopes: Envelope[] = [];
  const ids = new Set<string>();
  for (const raw of all) {
    if (!envelope(raw) || ids.has((raw as { id?: unknown }).id as string)) {
      add(
        findings,
        "BUS_INVALID",
        "artifact envelope is closed, unique, durable, timed, and typed",
      );
      continue;
    }
    ids.add(raw.id);
    const actual = bodySha256(raw.body);
    if (actual !== raw.sha256) {
      add(
        findings,
        "BUS_INVALID",
        "artifact SHA-256 does not recompute from canonical body",
        raw.id,
      );
      continue;
    }
    if (!bodyValid(raw.kind, raw.body)) {
      add(
        findings,
        raw.kind === "SECTION_TRANSFER_PACKET" ||
          raw.body.programmeVisible === true
          ? "RAW_METHOD_LEAK_TO_PROGRAMME"
          : "BUS_INVALID",
        "artifact body violates its closed V0 constants",
        raw.id,
      );
      continue;
    }
    if (hasForbiddenDependency(raw, findings)) continue;
    envelopes.push(raw);
  }
  const byKind = (kind: ArtifactKind) =>
    envelopes.filter((item) => item.kind === kind);
  const packets = byKind("SECTION_TRANSFER_PACKET");
  const subscriptions = byKind("SECTION_SUBSCRIPTION");
  const deliveries = byKind("SECTION_TRANSFER_DELIVERY");
  const admissions = byKind("SECTION_TRANSFER_ADMISSION");
  const commits = byKind("SECTION_TRANSFER_COMMIT");
  const selectedDependency: Dependency = {
    kind: "DIRECTOR_COMMIT",
    id: selected.id as string,
    sha256: selected.artifactSha256 as string,
  };
  const validPackets: Envelope[] = [];
  let replayDrops = 0;
  for (const packet of packets) {
    const body = packet.body;
    const packetReceipts = body.sourceReceiptDigests as string[];
    if (
      !dependencySet(packet.dependencies, [selectedDependency]) ||
      body.sourceCommitSha256 !== selected.artifactSha256 ||
      packetReceipts.length !== 1 ||
      packetReceipts[0] !== selected.receiptSha256
    ) {
      add(
        findings,
        "TRANSFER_WITHOUT_COMMIT",
        "packet does not exact-join selected source commit and receipt",
        packet.id,
      );
      continue;
    }
    if (validPackets.length > 0) {
      add(
        findings,
        "TRANSFER_REPLAY",
        "source commit may publish only one packet",
        packet.id,
      );
      replayDrops += 1;
      continue;
    }
    validPackets.push(packet);
  }
  const deadline = timestamp(selected.transferPublishDueAt);
  if (
    deadline !== undefined &&
    timestamp(input.evaluatedAt)! > deadline &&
    validPackets.length === 0
  )
    add(
      findings,
      "COMMITTED_LEARNING_NOT_PUBLISHED",
      "eligible selected commit missed its declared transfer publish deadline",
      selected.id as string,
    );
  const packetByDigest = new Map(
    validPackets.map((item) => [item.sha256, item]),
  );
  const subscriptionByDigest = new Map(
    subscriptions.map((item) => [item.sha256, item]),
  );
  const validDeliveries: Envelope[] = [];
  const seenDeliveryKeys = new Set<string>();
  for (const delivery of deliveries) {
    const body = delivery.body,
      packet = packetByDigest.get(String(body.transferSha256)),
      subscription = subscriptionByDigest.get(String(body.subscriptionSha256));
    const key = `${body.transferSha256}:${body.recipientSectionId}`;
    if (seenDeliveryKeys.has(key)) {
      add(
        findings,
        "TRANSFER_REPLAY",
        "packet-recipient delivery idempotency key replayed",
        delivery.id,
      );
      replayDrops += 1;
      continue;
    }
    seenDeliveryKeys.add(key);
    if (
      !packet ||
      !subscription ||
      body.transferLocus !== packet.locator ||
      body.subscriptionLocus !== subscription.locator ||
      body.recipientSectionId !== subscription.body.recipientSectionId ||
      body.idempotencyKey !== key ||
      !matches(packet.body, subscription.body) ||
      timestamp(body.deliveredAt)! < timestamp(selected.at)! ||
      timestamp(body.deliveredAt)! <
        timestamp(subscription.body.effectiveAt)! ||
      timestamp(body.deliveredAt)! >= timestamp(subscription.body.expiresAt)! ||
      !dependencySet(delivery.dependencies, [
        {
          kind: "SECTION_TRANSFER_PACKET",
          id: packet.id,
          sha256: packet.sha256,
        },
        {
          kind: "SECTION_SUBSCRIPTION",
          id: subscription.id,
          sha256: subscription.sha256,
        },
      ])
    ) {
      add(
        findings,
        "BUS_INVALID",
        "delivery must exact-join one matching immutable subscription and packet",
        delivery.id,
      );
      continue;
    }
    validDeliveries.push(delivery);
  }
  const deliveryByDigest = new Map(
    validDeliveries.map((item) => [item.sha256, item]),
  );
  const validAdmissions: Envelope[] = [];
  const seenAdmissionKeys = new Set<string>();
  for (const admission of admissions) {
    const body = admission.body,
      delivery = deliveryByDigest.get(String(body.deliverySha256)),
      packet = packetByDigest.get(String(body.transferSha256)),
      subscription = subscriptionByDigest.get(String(body.subscriptionSha256));
    const key = `${body.transferSha256}:${body.recipientSectionId}`;
    if (
      seenAdmissionKeys.has(key) ||
      seenDeliveryKeys.has(`admission:${key}`)
    ) {
      add(
        findings,
        "TRANSFER_REPLAY",
        "packet-recipient admission idempotency key replayed",
        admission.id,
      );
      replayDrops += 1;
      continue;
    }
    seenDeliveryKeys.add(`admission:${key}`);
    if (body.localStateMutation !== false) {
      add(
        findings,
        "TRANSFER_AUTO_ENACTED",
        "admission cannot mutate recipient state",
        admission.id,
      );
      continue;
    }
    if (
      !delivery ||
      !packet ||
      !subscription ||
      timestamp(body.decidedAt)! < timestamp(delivery.body.deliveredAt)! ||
      body.recipientSectionId !== delivery.body.recipientSectionId ||
      body.recipientDirectorInstanceId !==
        subscription.body.recipientDirectorInstanceId ||
      body.recipientDirectorRoleGrant !==
        subscription.body.recipientDirectorRoleGrant ||
      body.sectionMandateLocus !== subscription.body.sectionMandateLocus ||
      body.sectionMandateSha256 !== subscription.body.sectionMandateSha256 ||
      body.mandateRevision !== subscription.body.mandateRevision ||
      body.mandateFence !== subscription.body.mandateFence ||
      body.sectionCharterLocus !== subscription.body.sectionCharterLocus ||
      body.sectionCharterSha256 !== subscription.body.sectionCharterSha256 ||
      body.idempotencyKey !== key ||
      body.deliveryLocus !== delivery.locator ||
      body.transferLocus !== packet.locator ||
      body.subscriptionLocus !== subscription.locator ||
      !dependencySet(admission.dependencies, [
        {
          kind: "SECTION_TRANSFER_DELIVERY",
          id: delivery.id,
          sha256: delivery.sha256,
        },
        {
          kind: "SECTION_TRANSFER_PACKET",
          id: packet.id,
          sha256: packet.sha256,
        },
        {
          kind: "SECTION_SUBSCRIPTION",
          id: subscription.id,
          sha256: subscription.sha256,
        },
      ])
    ) {
      add(
        findings,
        "BUS_INVALID",
        "admission must exact-join delivery, packet, and subscription",
        admission.id,
      );
      continue;
    }
    seenAdmissionKeys.add(key);
    validAdmissions.push(admission);
  }
  const admissionByDigest = new Map(
    validAdmissions.map((item) => [item.sha256, item]),
  );
  const validCommits: Envelope[] = [];
  const seenCommitKeys = new Set<string>();
  for (const commit of commits) {
    const body = commit.body,
      admission = admissionByDigest.get(String(body.admissionSha256)),
      packet = packetByDigest.get(String(body.transferSha256));
    const key = `${body.transferSha256}:${body.recipientSectionId}`;
    if (seenCommitKeys.has(key)) {
      add(
        findings,
        "TRANSFER_REPLAY",
        "packet-recipient transfer commit idempotency key replayed",
        commit.id,
      );
      replayDrops += 1;
      continue;
    }
    seenCommitKeys.add(key);
    if (
      !admission ||
      !packet ||
      admission.body.decision !== "ADOPT" ||
      body.recipientSectionId !== admission.body.recipientSectionId ||
      body.recipientDirectorInstanceId !==
        admission.body.recipientDirectorInstanceId ||
      body.recipientDirectorRoleGrant !==
        admission.body.recipientDirectorRoleGrant ||
      body.sectionMandateLocus !== admission.body.sectionMandateLocus ||
      body.sectionMandateSha256 !== admission.body.sectionMandateSha256 ||
      body.mandateRevision !== admission.body.mandateRevision ||
      body.mandateFence !== admission.body.mandateFence ||
      body.sectionCharterLocus !== admission.body.sectionCharterLocus ||
      body.sectionCharterSha256 !== admission.body.sectionCharterSha256 ||
      body.idempotencyKey !== key ||
      body.admissionLocus !== admission.locator ||
      body.transferLocus !== packet.locator ||
      !dependencySet(commit.dependencies, [
        {
          kind: "SECTION_TRANSFER_ADMISSION",
          id: admission.id,
          sha256: admission.sha256,
        },
        {
          kind: "SECTION_TRANSFER_PACKET",
          id: packet.id,
          sha256: packet.sha256,
        },
      ])
    ) {
      add(
        findings,
        "TRANSFER_AUTO_ENACTED",
        "local transfer commit needs a distinct ADOPT admission and packet",
        commit.id,
      );
      continue;
    }
    validCommits.push(commit);
  }
  const routed = new Set(
    validDeliveries.map((delivery) => delivery.body.transferSha256),
  );
  const visibility = findings.filter(
    (finding) => finding.code === "RAW_METHOD_LEAK_TO_PROGRAMME",
  ).length;
  const commitAt = timestamp(selected.at)!;
  const commitToDelivery = validDeliveries.map(
    (delivery) => timestamp(delivery.body.deliveredAt)! - commitAt,
  );
  const deliveryToAdmission = validAdmissions.map(
    (admission) =>
      timestamp(admission.body.decidedAt)! -
      timestamp(
        deliveryByDigest.get(admission.body.deliverySha256)?.body.deliveredAt,
      )!,
  );
  return finish(source.summary, {
    transferPacketsPublished: validPackets.length,
    transferDeliveries: validDeliveries.length,
    transferAdmissionsByClass: {
      ADOPT: validAdmissions.filter((item) => item.body.decision === "ADOPT")
        .length,
      REJECT: validAdmissions.filter((item) => item.body.decision === "REJECT")
        .length,
      DEFER: validAdmissions.filter((item) => item.body.decision === "DEFER")
        .length,
    },
    transferCommits: validCommits.length,
    transferReplayDrops: replayDrops,
    unroutedTransferPackets: validPackets.filter(
      (packet) => !routed.has(packet.sha256),
    ).length,
    programmeVisibilityViolations: visibility,
    commitToDeliveryMs: {
      p50: nearestRankPercentile(commitToDelivery, 0.5),
      p95: nearestRankPercentile(commitToDelivery, 0.95),
    },
    deliveryToAdmissionMs: {
      p50: nearestRankPercentile(deliveryToAdmission, 0.5),
      p95: nearestRankPercentile(deliveryToAdmission, 0.95),
    },
  });
}
