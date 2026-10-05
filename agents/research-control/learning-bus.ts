import { createHash } from "node:crypto";
import { fromThrowable } from "neverthrow";
import { z } from "../hooks/zod.ts";
import { checkTrace, type Finding, type TraceResult } from "./trace.ts";

/** A deliberately small, closed V0 wire for checking lateral transfer records. */
export const LEARNING_BUS_SCHEMA = "cross-section-learning-bus/v1";

type RecordValue = Record<string, unknown>;
const KIND_LIST = [
  "SECTION_TRANSFER_PACKET",
  "SECTION_SUBSCRIPTION",
  "SECTION_TRANSFER_DELIVERY",
  "SECTION_TRANSFER_ADMISSION",
  "SECTION_TRANSFER_COMMIT",
] as const;
type ArtifactKind = (typeof KIND_LIST)[number];
type Dependency = { kind: string; id: string; sha256: string };
type Envelope = z.output<typeof EnvelopeSchema>;
type BusFinding = Finding & { artifactId?: string };

const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const SHA = /^[a-f0-9]{64}$/u;
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
  /(?:^|[_-])(?:ACK(?:NOWLEDG(?:EMENT)?)?|QUORUM|WAVE|ALL[_-]?RECIPIENT|GLOBAL)(?:$|[_-])/iu;
const SUPERVISOR = /(?:SUPERVISOR|VERIFIER|PROGRAMME)/iu;

// z.looseObject({}) accepts exactly an object that is not null and not an array, and keeps every
// own key: the parsed copy is what callers use.
const RecordSchema = z.looseObject({});
function record(value: unknown): RecordValue | undefined {
  const parsed = RecordSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
function list(value: unknown): unknown[] | undefined {
  const parsed = z.array(z.unknown()).safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
// The string itself when it is nonempty after trim, else undefined.
function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
function text(value: unknown): boolean {
  return str(value) !== undefined;
}
function nonNegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
const instantMs = fromThrowable(
  (value: string) => Temporal.Instant.from(value).epochMilliseconds,
);
function timestamp(value: unknown): number | undefined {
  const raw = str(value);
  if (raw === undefined || !RFC3339.test(raw)) return undefined;
  // Temporal rejects impossible instants (02-30, 24:00) that Date silently rolled over; that
  // rejection is exactly the "not a timestamp" answer.
  return instantMs(raw).unwrapOr(undefined);
}
// The string itself when it is a lowercase SHA-256 hex digest, else undefined.
function digestOf(value: unknown): string | undefined {
  return typeof value === "string" && SHA.test(value) ? value : undefined;
}
function digest(value: unknown): boolean {
  return digestOf(value) !== undefined;
}
// The unique nonempty strings, or undefined when the value is not exactly that.
function stringList(value: unknown, allowEmpty = false): string[] | undefined {
  const items = list(value);
  if (items === undefined) return undefined;
  const texts = items.flatMap((item) => {
    const t = str(item);
    return t === undefined ? [] : [t];
  });
  return (allowEmpty || items.length > 0) &&
    texts.length === items.length &&
    new Set(texts).size === texts.length
    ? texts
    : undefined;
}
function strings(value: unknown, allowEmpty = false): boolean {
  return stringList(value, allowEmpty) !== undefined;
}
function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  const actual = Object.keys(value).toSorted();
  return (
    actual.length === keys.length &&
    actual.every((key, i) => key === keys.toSorted()[i])
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
    const entries = value.map((entry) => canonicalJson(entry));
    return entries.some((entry) => entry === undefined)
      ? undefined
      : `[${entries.join(",")}]`;
  }
  const object = record(value);
  if (object === undefined) return undefined;
  const entries: string[] = [];
  for (const key of Object.keys(object).toSorted()) {
    const entry = canonicalJson(object[key]);
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
const TextSchema = z.string().refine((value) => value.trim() !== "");
const DependencySchema = z.strictObject({
  kind: TextSchema,
  id: TextSchema,
  sha256: z.string().regex(SHA),
});
const EnvelopeSchema = z.strictObject({
  id: TextSchema,
  kind: z.enum(KIND_LIST),
  locator: TextSchema,
  at: z.string().refine((value) => timestamp(value) !== undefined),
  body: RecordSchema,
  sha256: z.string().regex(SHA),
  dependencies: z.array(DependencySchema),
});
function dependencySet(deps: Dependency[], expected: Dependency[]): boolean {
  if (deps.length !== expected.length) return false;
  const actual = deps
    .map((d) => `${d.kind}\u0000${d.id}\u0000${d.sha256}`)
    .toSorted();
  const wanted = expected
    .map((d) => `${d.kind}\u0000${d.id}\u0000${d.sha256}`)
    .toSorted();
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
    nonNegativeInteger(body.mandateRevision) &&
    strings(body.topicIds) &&
    strings(body.affectedPremiseIds, true) &&
    strings(body.interfaceIds, true) &&
    (stringList(body.acceptedDeltaClasses)?.every((delta) =>
      DELTAS.has(delta),
    ) ??
      false) &&
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
    nonNegativeInteger(body.mandateRevision) &&
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
    nonNegativeInteger(body.mandateRevision) &&
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
  const includes = (available: unknown, required: unknown): boolean => {
    const have = stringList(available, true);
    const need = stringList(required, true);
    return (
      have !== undefined &&
      need !== undefined &&
      need.every((value) => have.includes(value))
    );
  };
  const accepted = stringList(subscription.acceptedDeltaClasses, true);
  return (
    includes(subscription.topicIds, packet.topicIds) &&
    includes(subscription.affectedPremiseIds, packet.affectedPremiseIds) &&
    includes(subscription.interfaceIds, packet.interfaceIds) &&
    accepted !== undefined &&
    typeof packet.deltaClass === "string" &&
    accepted.includes(packet.deltaClass)
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
  const sorted = values.toSorted((left, right) => left - right);
  const value = sorted[Math.ceil(percentile * sorted.length) - 1];
  return value ?? null;
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

export function checkLearningBus(rawInput: unknown): LearningBusResult {
  const findings: BusFinding[] = [];
  const zero: LearningBusResult["metrics"] = {
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
  const input = record(rawInput);
  const artifacts = record(input?.artifacts);
  if (
    input === undefined ||
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
    artifacts === undefined
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
      /(?:searchReceipts|learningCommits|searchPerHour|learnPerHour)/u.test(
        key,
      ),
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
  const events = (list(record(input.sourceTrace)?.events) ?? []).flatMap(
    (event) => {
      const parsed = record(event);
      return parsed === undefined ? [] : [parsed];
    },
  );
  const selected = events.find(
    (event) => event.id === input.sourceCommitEventId,
  );
  const selectedId = str(selected?.id);
  const selectedSha = digestOf(selected?.artifactSha256);
  const selectedReceipt = digestOf(selected?.receiptSha256);
  if (
    selected === undefined ||
    selectedId === undefined ||
    selected.kind !== "DIRECTOR_COMMIT" ||
    selected.decision !== "COMMIT" ||
    selectedSha === undefined ||
    selectedReceipt === undefined ||
    !source.summary.receiptDigests.includes(selectedReceipt)
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
    !exactKeys(artifacts, kinds) ||
    !kinds.every((kind) => Array.isArray(artifacts[kind]))
  ) {
    add(
      findings,
      "BUS_INVALID",
      "artifacts must provide all five closed envelope arrays",
    );
    return finish(source.summary);
  }
  const all = kinds.flatMap((kind) => list(artifacts[kind]) ?? []);
  const envelopes: Envelope[] = [];
  const ids = new Set<string>();
  for (const candidate of all) {
    const parsedEnvelope = EnvelopeSchema.safeParse(candidate);
    if (!parsedEnvelope.success || ids.has(parsedEnvelope.data.id)) {
      add(
        findings,
        "BUS_INVALID",
        "artifact envelope is closed, unique, durable, timed, and typed",
      );
      continue;
    }
    const raw = parsedEnvelope.data;
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
    id: selectedId,
    sha256: selectedSha,
  };
  const validPackets: Envelope[] = [];
  let replayDrops = 0;
  for (const packet of packets) {
    const body = packet.body;
    const packetReceipts = stringList(body.sourceReceiptDigests, true) ?? [];
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
      selectedId,
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
    const key = `${String(body.transferSha256)}:${String(body.recipientSectionId)}`;
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
      packet === undefined ||
      subscription === undefined ||
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
    const key = `${String(body.transferSha256)}:${String(body.recipientSectionId)}`;
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
      delivery === undefined ||
      packet === undefined ||
      subscription === undefined ||
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
    const key = `${String(body.transferSha256)}:${String(body.recipientSectionId)}`;
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
      admission === undefined ||
      packet === undefined ||
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
        deliveryByDigest.get(String(admission.body.deliverySha256))?.body
          .deliveredAt,
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
