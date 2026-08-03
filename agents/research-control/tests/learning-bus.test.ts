import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  bodySha256,
  checkLearningBus,
  nearestRankPercentile,
} from "../learning-bus.ts";

const digest = (digit: string) => digit.repeat(64);
const at = (second: number) =>
  `2026-08-04T00:00:${String(second).padStart(2, "0")}Z`;
type R = Record<string, unknown>;
type Dependency = { kind: string; id: string; sha256: string };

function sourceTrace(): R {
  const semantic = {
    objectiveId: "objective-id",
    successObservableId: "success-id",
    invariantIds: ["invariant-id"],
  };
  const authority = {
    goalConstitution: {
      id: "goal",
      sha256: digest("a"),
      revision: 1,
      signer: "programme-signer",
      ...semantic,
    },
    programmeSnapshot: {
      id: "programme",
      sha256: digest("b"),
      goalConstitutionId: "goal",
      goalConstitutionSha256: digest("a"),
      ...semantic,
    },
    openIssue: {
      id: "issue",
      sha256: digest("c"),
      programmeSnapshotId: "programme",
      programmeSnapshotSha256: digest("b"),
      ...semantic,
    },
    sectionMandate: {
      id: "mandate",
      sha256: digest("d"),
      openIssueId: "issue",
      openIssueSha256: digest("c"),
      ...semantic,
    },
    sectionCharter: {
      id: "charter",
      sha256: digest("e"),
      sectionMandateId: "mandate",
      sectionMandateSha256: digest("d"),
      ...semantic,
    },
    grounding: {
      id: "grounding",
      sha256: digest("f"),
      sectionCharterId: "charter",
      sectionCharterSha256: digest("e"),
      revision: 1,
      fence: "fence",
      objective: "objective",
      success: "success",
      invariants: ["invariant"],
      knownResult: false,
      knownResultDisposition: "NOVEL_GAP",
      ...semantic,
      grounderGrantId: "grounder-grant",
      grounderActorInstanceId: "grounder",
    },
  };
  const candidateAuthority = {
    goalConstitutionId: "goal",
    goalConstitutionSha256: digest("a"),
    programmeSnapshotId: "programme",
    programmeSnapshotSha256: digest("b"),
    openIssueId: "issue",
    openIssueSha256: digest("c"),
    sectionMandateId: "mandate",
    sectionMandateSha256: digest("d"),
    sectionCharterId: "charter",
    sectionCharterSha256: digest("e"),
    groundingId: "grounding",
    groundingSha256: digest("f"),
    groundingRevision: 1,
    groundingFence: "fence",
    objective: "objective",
    success: "success",
    invariants: ["invariant"],
    knownResult: false,
    ...semantic,
    noveltyDisposition: "NOVEL_GAP",
  };
  return {
    schema: "research-section-trace/v2",
    authority,
    evaluatedAt: "2026-08-04T00:20:00Z",
    status: "TERMINATED",
    lease: {
      leaseId: "lease",
      sectionId: "source",
      mandateId: "mandate",
      startedAt: at(0),
      expiresAt: "2026-08-04T01:00:00Z",
      firstIntentDueAt: "2026-08-04T00:12:00Z",
      maxControlEventsBeforeIntent: 2,
      maxProposalEventsBeforeIntent: 1,
      allowedActionClasses: ["BUILD"],
      terminalTarget: "RUN_RECEIPT",
    },
    roleGrants: [
      {
        grantId: "supervisor-grant",
        actorInstanceId: "supervisor",
        role: "programme-supervisor",
      },
      {
        grantId: "searcher-grant",
        actorInstanceId: "searcher",
        role: "searcher",
      },
      {
        grantId: "grounder-grant",
        actorInstanceId: "grounder",
        role: "section-grounder",
      },
      {
        grantId: "director-grant",
        actorInstanceId: "source-director",
        role: "section-director",
      },
      { grantId: "builder-grant", actorInstanceId: "builder", role: "builder" },
      {
        grantId: "executor-grant",
        actorInstanceId: "executor",
        role: "executor",
      },
      {
        grantId: "learner-grant",
        actorInstanceId: "learner",
        role: "section-learner",
      },
    ],
    events: [
      {
        id: "mandate",
        at: at(1),
        kind: "MANDATE",
        mandateId: "mandate",
        actorInstanceId: "supervisor",
        grantId: "supervisor-grant",
      },
      {
        id: "candidate",
        at: at(2),
        kind: "CANDIDATE_PACKET",
        candidateId: "candidate-1",
        artifactSha256: digest("1"),
        ...candidateAuthority,
        actorInstanceId: "searcher",
        grantId: "searcher-grant",
      },
      {
        id: "admit",
        at: at(3),
        kind: "ADMISSION",
        candidateEventId: "candidate",
        candidateSha256: digest("1"),
        candidateId: "candidate-1",
        decision: "ADMIT",
        valueClass: "MINIMAL_DISCRIMINATOR",
        artifactSha256: digest("2"),
        actorInstanceId: "source-director",
        grantId: "director-grant",
      },
      {
        id: "spec",
        at: at(4),
        kind: "EXECUTABLE_SPEC",
        admissionId: "admit",
        admissionSha256: digest("2"),
        candidateId: "candidate-1",
        artifactSha256: digest("3"),
        implementationLocus: "impl",
        implementationSha256: digest("4"),
        entrypointAndParameters: "run",
        expectedOutcomeContract: "observed",
        estimand: "effect",
        comparator: "baseline",
        positiveControl: "positive",
        negativeControl: "negative",
        validityChecks: ["check"],
        measurementContractSha256: digest("7"),
        runScale: "MINIMAL_DISCRIMINATOR",
        escalationClass: "NONE",
        actorInstanceId: "builder",
        grantId: "builder-grant",
      },
      {
        id: "intent",
        at: at(5),
        kind: "INTENT",
        admissionId: "admit",
        admissionSha256: digest("2"),
        executableSpecificationId: "spec",
        executableSpecificationSha256: digest("3"),
        candidateId: "candidate-1",
        artifactSha256: digest("5"),
        actionClass: "BUILD",
        measurementContractSha256: digest("7"),
        runScale: "MINIMAL_DISCRIMINATOR",
        escalationClass: "NONE",
        falsifierOutcomeMap: "map",
        executorSink: "sink",
        terminalDueAt: at(50),
        actorInstanceId: "source-director",
        grantId: "director-grant",
      },
      {
        id: "receipt",
        at: at(6),
        kind: "RECEIPT",
        artifactSha256: digest("6"),
        intentId: "intent",
        intentSha256: digest("5"),
        terminalClass: "RUN_RECEIPT",
        measurementValidity: "PASS",
        measurementContractSha256: digest("7"),
        evidence: {
          locator: "evidence/receipt.json",
          sha256: digest("7"),
          tracked: true,
          ignored: false,
        },
        measurementValidityEvidence: {
          locator: "evidence/measurement-validity.json",
          sha256: digest("8"),
          tracked: true,
          ignored: false,
        },
        actorInstanceId: "executor",
        grantId: "executor-grant",
      },
      {
        id: "learning",
        at: at(7),
        kind: "LEARNING",
        artifactSha256: digest("8"),
        receiptId: "receipt",
        receiptSha256: digest("6"),
        prior: "prior",
        observation: "observation",
        delta: "delta",
        uncertainty: "uncertainty",
        nextDiscriminatingAction: "next",
        learningClass: "SCIENTIFIC",
        actorInstanceId: "learner",
        grantId: "learner-grant",
      },
      {
        id: "source-commit",
        at: at(8),
        kind: "DIRECTOR_COMMIT",
        learningId: "learning",
        learningSha256: digest("8"),
        receiptSha256: digest("6"),
        decision: "COMMIT",
        stateTransition: "advance",
        artifactSha256: digest("9"),
        transferPublishDueAt: at(12),
        actorInstanceId: "source-director",
        grantId: "director-grant",
      },
      {
        id: "next-candidate",
        at: at(9),
        kind: "CANDIDATE_PACKET",
        candidateId: "candidate-2",
        artifactSha256: digest("a"),
        ...candidateAuthority,
        actorInstanceId: "searcher",
        grantId: "searcher-grant",
      },
    ],
  };
}
function envelope(
  id: string,
  kind: string,
  body: R,
  dependencies: Dependency[] = [],
): R {
  return {
    id,
    kind,
    locator: `event-log/${id}.json`,
    at: at(10),
    body,
    sha256: bodySha256(body)!,
    dependencies,
  };
}
function packet(): R {
  return envelope(
    "packet",
    "SECTION_TRANSFER_PACKET",
    {
      transferId: "transfer",
      sourceSectionId: "source",
      sourceDirectorInstanceId: "source-director",
      sourceDirectorRoleGrant: "director-grant",
      sourceCommitLocus: "trace/source-commit",
      sourceCommitSha256: digest("9"),
      sourceReceiptDigests: [digest("6")],
      topicIds: ["topic"],
      affectedPremiseIds: ["premise"],
      interfaceIds: ["interface"],
      outcomeClass: "observed",
      deltaClass: "supports",
      applicabilityPredicate: "under-condition",
      contraindication: "none",
      uncertainty: "bounded",
      evidenceLocator: "evidence/receipt.json",
      evidenceSha256: digest("7"),
      visibility: "SECTION_FEDERATION_ONLY",
      programmeVisible: false,
      rawHumanMethodIncluded: false,
      authority: "PROPOSAL_ONLY",
    },
    [{ kind: "DIRECTOR_COMMIT", id: "source-commit", sha256: digest("9") }],
  );
}
function subscription(recipient: string, id = `subscription-${recipient}`): R {
  return envelope(id, "SECTION_SUBSCRIPTION", {
    subscriptionId: id,
    recipientSectionId: recipient,
    sectionMandateLocus: `mandates/${recipient}.json`,
    sectionMandateSha256: digest("d"),
    mandateRevision: 1,
    mandateFence: `fence-${recipient}`,
    sectionCharterLocus: `charters/${recipient}.json`,
    sectionCharterSha256: digest("e"),
    recipientDirectorInstanceId: `${recipient}-director`,
    recipientDirectorRoleGrant: `${recipient}-grant`,
    topicIds: ["topic"],
    affectedPremiseIds: ["premise"],
    interfaceIds: ["interface"],
    acceptedDeltaClasses: ["supports"],
    eventLogCursor: `cursor-${recipient}`,
    effectiveAt: at(1),
    expiresAt: "2026-08-04T01:00:00Z",
    immutable: true,
    visibility: "SECTION_FEDERATION_CONTROL",
    programmeVisible: false,
    authority: "ROUTING_FILTER_ONLY",
  });
}
function delivery(recipient: string, sub: R, id = `delivery-${recipient}`): R {
  const p = packet();
  return envelope(
    id,
    "SECTION_TRANSFER_DELIVERY",
    {
      deliveryId: id,
      transferLocus: p.locator,
      transferSha256: p.sha256,
      recipientSectionId: recipient,
      subscriptionLocus: sub.locator,
      subscriptionSha256: sub.sha256,
      matchedTopicIds: ["topic"],
      matchedPremiseIds: ["premise"],
      matchedInterfaceIds: ["interface"],
      matchedDeltaClass: "supports",
      idempotencyKey: `${p.sha256}:${recipient}`,
      enqueuedAt: at(10),
      deliveredAt: at(11),
      brokerKind: "DETERMINISTIC_EXACT_MATCH",
      ackRequired: false,
      semanticAuthority: "NONE",
      programmeVisible: false,
    },
    [
      {
        kind: "SECTION_TRANSFER_PACKET",
        id: "packet",
        sha256: p.sha256 as string,
      },
      {
        kind: "SECTION_SUBSCRIPTION",
        id: sub.id as string,
        sha256: sub.sha256 as string,
      },
    ],
  );
}
function admission(
  recipient: string,
  sub: R,
  deliveryEnvelope: R,
  decision: "ADOPT" | "REJECT" | "DEFER",
): R {
  const p = packet();
  return envelope(
    `admission-${recipient}`,
    "SECTION_TRANSFER_ADMISSION",
    {
      admissionId: `admission-${recipient}`,
      recipientSectionId: recipient,
      recipientDirectorInstanceId: `${recipient}-director`,
      recipientDirectorRoleGrant: `${recipient}-grant`,
      sectionMandateLocus: `mandates/${recipient}.json`,
      sectionMandateSha256: digest("d"),
      mandateRevision: 1,
      mandateFence: `fence-${recipient}`,
      sectionCharterLocus: `charters/${recipient}.json`,
      sectionCharterSha256: digest("e"),
      deliveryLocus: deliveryEnvelope.locator,
      deliverySha256: deliveryEnvelope.sha256,
      transferLocus: p.locator,
      transferSha256: p.sha256,
      subscriptionLocus: sub.locator,
      subscriptionSha256: sub.sha256,
      idempotencyKey: `${p.sha256}:${recipient}`,
      decision,
      reasonClass: "applicable",
      decidedAt: at(12),
      localStateMutation: false,
      programmeVisible: false,
      authority: "ADMISSION_ONLY",
    },
    [
      {
        kind: "SECTION_TRANSFER_DELIVERY",
        id: deliveryEnvelope.id as string,
        sha256: deliveryEnvelope.sha256 as string,
      },
      {
        kind: "SECTION_TRANSFER_PACKET",
        id: "packet",
        sha256: p.sha256 as string,
      },
      {
        kind: "SECTION_SUBSCRIPTION",
        id: sub.id as string,
        sha256: sub.sha256 as string,
      },
    ],
  );
}
function commit(recipient: string, admissionEnvelope: R): R {
  const p = packet();
  return envelope(
    `commit-${recipient}`,
    "SECTION_TRANSFER_COMMIT",
    {
      transferCommitId: `commit-${recipient}`,
      recipientSectionId: recipient,
      recipientDirectorInstanceId: `${recipient}-director`,
      recipientDirectorRoleGrant: `${recipient}-grant`,
      sectionMandateLocus: `mandates/${recipient}.json`,
      sectionMandateSha256: digest("d"),
      mandateRevision: 1,
      mandateFence: `fence-${recipient}`,
      sectionCharterLocus: `charters/${recipient}.json`,
      sectionCharterSha256: digest("e"),
      admissionLocus: admissionEnvelope.locator,
      admissionSha256: admissionEnvelope.sha256,
      transferLocus: p.locator,
      transferSha256: p.sha256,
      idempotencyKey: `${p.sha256}:${recipient}`,
      localEffect: "PRIOR_UPDATE",
      stateLocus: `state/${recipient}.json`,
      stateBeforeSha256: digest("b"),
      stateAfterSha256: digest("c"),
      committedAt: at(13),
      searchCredit: "NONE",
      learnCredit: "NONE",
      programmeVisible: false,
      authority: "LOCAL_SECTION_STATE_ONLY",
    },
    [
      {
        kind: "SECTION_TRANSFER_ADMISSION",
        id: admissionEnvelope.id as string,
        sha256: admissionEnvelope.sha256 as string,
      },
      {
        kind: "SECTION_TRANSFER_PACKET",
        id: "packet",
        sha256: p.sha256 as string,
      },
    ],
  );
}
function input(overrides: Partial<R> = {}): R {
  const p = packet(),
    left = subscription("left"),
    right = subscription("right"),
    leftDelivery = delivery("left", left),
    rightDelivery = delivery("right", right),
    leftAdmission = admission("left", left, leftDelivery, "ADOPT"),
    rightAdmission = admission("right", right, rightDelivery, "REJECT");
  return {
    schema: "cross-section-learning-bus/v1",
    evaluatedAt: "2026-08-04T00:20:00Z",
    sourceTrace: sourceTrace(),
    sourceCommitEventId: "source-commit",
    artifacts: {
      packets: [p],
      subscriptions: [left, right],
      deliveries: [leftDelivery, rightDelivery],
      admissions: [leftAdmission, rightAdmission],
      commits: [commit("left", leftAdmission)],
    },
    ...overrides,
  };
}
const codes = (value: R) =>
  checkLearningBus(value).findings.map((finding) => finding.code);

describe("cross-section-learning-bus/v1", () => {
  test("one packet fans out independently while source continues", () => {
    const result = checkLearningBus(input());
    expect(result.ok).toBe(true);
    expect(result.metrics).toMatchObject({
      transferPacketsPublished: 1,
      transferDeliveries: 2,
      transferAdmissionsByClass: { ADOPT: 1, REJECT: 1, DEFER: 0 },
      transferCommits: 1,
      transferReplayDrops: 0,
      commitToDeliveryMs: { p50: 3000, p95: 3000 },
      deliveryToAdmissionMs: { p50: 1000, p95: 1000 },
    });
    expect(result.source).toMatchObject({ receipts: 1, commits: 1 });
  });
  test("unsubscribed Director receives no delivery", () => {
    const value = input();
    (value.artifacts as R).subscriptions = [subscription("other")];
    (value.artifacts as R).deliveries = [];
    (value.artifacts as R).admissions = [];
    (value.artifacts as R).commits = [];
    expect(checkLearningBus(value)).toMatchObject({
      ok: true,
      metrics: {
        transferDeliveries: 0,
        unroutedTransferPackets: 1,
        commitToDeliveryMs: { p50: null, p95: null },
        deliveryToAdmissionMs: { p50: null, p95: null },
      },
    });
  });
  test("replay is dropped without multiplying propagation or scientific metrics", () => {
    const value = input();
    const replay = structuredClone(
      ((value.artifacts as R).deliveries as R[])[0],
    );
    replay.id = "delivery-replay";
    ((value.artifacts as R).deliveries as R[]).push(replay);
    const result = checkLearningBus(value);
    expect(codes(value)).toContain("TRANSFER_REPLAY");
    expect(result.metrics).toMatchObject({
      transferDeliveries: 2,
      transferReplayDrops: 1,
    });
    expect(result.source).toMatchObject({ receipts: 1, commits: 1 });
  });
  test("a replay cannot create a second local transfer commit", () => {
    const value = input();
    const replay = structuredClone(((value.artifacts as R).commits as R[])[0]);
    replay.id = "commit-replay";
    ((value.artifacts as R).commits as R[]).push(replay);
    expect(checkLearningBus(value)).toMatchObject({
      metrics: { transferCommits: 1, transferReplayDrops: 1 },
    });
    expect(codes(value)).toContain("TRANSFER_REPLAY");
  });
  test("a source commit publishes only one packet", () => {
    const value = input();
    const replay = structuredClone(((value.artifacts as R).packets as R[])[0]);
    replay.id = "packet-replay";
    ((value.artifacts as R).packets as R[]).push(replay);
    expect(checkLearningBus(value)).toMatchObject({
      metrics: { transferPacketsPublished: 1, transferReplayDrops: 1 },
    });
    expect(codes(value)).toContain("TRANSFER_REPLAY");
  });
  test("missing source commit or packet commit digest is TRANSFER_WITHOUT_COMMIT", () => {
    const value = input({ sourceCommitEventId: "missing" });
    expect(codes(value)).toContain("TRANSFER_WITHOUT_COMMIT");
    const mismatched = input();
    const packetBody = ((mismatched.artifacts as R).packets as R[])[0]
      .body as R;
    packetBody.sourceCommitSha256 = digest("f");
    ((mismatched.artifacts as R).packets as R[])[0].sha256 =
      bodySha256(packetBody)!;
    expect(codes(mismatched)).toContain("TRANSFER_WITHOUT_COMMIT");
  });
  test("packet receipt lineage rejects an unrelated extra digest", () => {
    const value = input();
    const artifacts = value.artifacts as R;
    const packetEnvelope = (artifacts.packets as R[])[0];
    const packetBody = packetEnvelope.body as R;
    (packetBody.sourceReceiptDigests as string[]).push(digest("f"));
    packetEnvelope.sha256 = bodySha256(packetBody)!;
    artifacts.deliveries = [];
    artifacts.admissions = [];
    artifacts.commits = [];
    const result = checkLearningBus(value);
    expect(result.findings.map((finding) => finding.code)).toContain(
      "TRANSFER_WITHOUT_COMMIT",
    );
    expect(result.metrics.transferPacketsPublished).toBe(0);
  });
  test("committed learning misses its declared publish deadline", () => {
    const value = input();
    (value.artifacts as R).packets = [];
    (value.artifacts as R).deliveries = [];
    (value.artifacts as R).admissions = [];
    (value.artifacts as R).commits = [];
    expect(codes(value)).toContain("COMMITTED_LEARNING_NOT_PUBLISHED");
  });
  test.each([
    ["SUPERVISOR_IN_TRANSFER_PATH", "PROGRAMME_SUPERVISOR"],
    ["SUPERVISOR_IN_TRANSFER_PATH", "VERIFIER"],
    ["TRANSFER_GLOBAL_BARRIER", "DELIVERY_QUORUM"],
  ])("forbidden dependency %s is classified", (code, kind) => {
    const value = input();
    const p = ((value.artifacts as R).packets as R[])[0];
    p.dependencies = [{ kind, id: "wait", sha256: digest("d") }];
    expect(codes(value)).toContain(code);
  });
  test("programme visibility and auto-enactment fail closed", () => {
    const visible = input();
    const packetBody = ((visible.artifacts as R).packets as R[])[0].body as R;
    packetBody.programmeVisible = true;
    ((visible.artifacts as R).packets as R[])[0].sha256 =
      bodySha256(packetBody)!;
    expect(codes(visible)).toContain("RAW_METHOD_LEAK_TO_PROGRAMME");
    const mutation = input();
    const body = ((mutation.artifacts as R).admissions as R[])[0].body as R;
    body.localStateMutation = true;
    ((mutation.artifacts as R).admissions as R[])[0].sha256 = bodySha256(body)!;
    expect(codes(mutation)).toContain("TRANSFER_AUTO_ENACTED");
  });
  test("caller supplied scientific counters fail closed", () =>
    expect(codes(input({ searchReceipts: 99 }))).toContain("BUS_INVALID"));
  test("nearest-rank propagation percentiles are deterministic", () => {
    expect(nearestRankPercentile([], 0.5)).toBeNull();
    expect(nearestRankPercentile([20, 10], 0.5)).toBe(10);
    expect(nearestRankPercentile([20, 10], 0.95)).toBe(20);
    expect(nearestRankPercentile([30, 10, 20], 0.5)).toBe(20);
    expect(nearestRankPercentile([30, 10, 20], 0.95)).toBe(30);
  });
  test("all transfer fixtures are loaded", () => {
    const directory = resolve(import.meta.dir, "../fixtures");
    const names = readdirSync(directory).filter(
      (name) => name.startsWith("transfer-") && name.endsWith(".json"),
    );
    expect(names).toEqual(["transfer-without-commit.json"]);
    for (const name of names) {
      const result = checkLearningBus(
        JSON.parse(readFileSync(resolve(directory, name), "utf8")),
      );
      expect(result.schema).toBe("cross-section-learning-bus/v1");
      expect(result.findings.map((finding) => finding.code)).toContain(
        "TRANSFER_WITHOUT_COMMIT",
      );
    }
  });
});
