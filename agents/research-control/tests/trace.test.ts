import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkTrace } from "../trace.ts";

const digest = (digit: string) => digit.repeat(64);
const at = (second: number) =>
  `2026-08-03T00:00:${String(second).padStart(2, "0")}Z`;
function trace(): Record<string, unknown> {
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
      id: "m",
      sha256: digest("d"),
      openIssueId: "issue",
      openIssueSha256: digest("c"),
      ...semantic,
    },
    sectionCharter: {
      id: "charter",
      sha256: digest("e"),
      sectionMandateId: "m",
      sectionMandateSha256: digest("d"),
      ...semantic,
    },
    grounding: {
      id: "grounding",
      sha256: digest("f"),
      sectionCharterId: "charter",
      sectionCharterSha256: digest("e"),
      revision: 1,
      fence: "fence-1",
      objective: "objective",
      success: "success",
      invariants: ["invariant"],
      knownResult: false,
      knownResultDisposition: "NOVEL_GAP",
      ...semantic,
      grounderGrantId: "g",
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
    sectionMandateId: "m",
    sectionMandateSha256: digest("d"),
    sectionCharterId: "charter",
    sectionCharterSha256: digest("e"),
    groundingId: "grounding",
    groundingSha256: digest("f"),
    groundingRevision: 1,
    groundingFence: "fence-1",
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
    evaluatedAt: "2026-08-03T00:20:00Z",
    status: "TERMINATED",
    lease: {
      leaseId: "l",
      sectionId: "s",
      mandateId: "m",
      startedAt: at(0),
      expiresAt: "2026-08-03T01:00:00Z",
      firstIntentDueAt: "2026-08-03T00:12:00Z",
      maxControlEventsBeforeIntent: 2,
      maxProposalEventsBeforeIntent: 1,
      allowedActionClasses: ["BUILD"],
      terminalTarget: "RUN_RECEIPT",
    },
    roleGrants: [
      {
        grantId: "p",
        actorInstanceId: "supervisor",
        role: "programme-supervisor",
      },
      { grantId: "s", actorInstanceId: "searcher", role: "searcher" },
      { grantId: "g", actorInstanceId: "grounder", role: "section-grounder" },
      { grantId: "d", actorInstanceId: "director", role: "section-director" },
      { grantId: "b", actorInstanceId: "builder", role: "builder" },
      { grantId: "x", actorInstanceId: "executor", role: "executor" },
      { grantId: "l", actorInstanceId: "learner", role: "section-learner" },
    ],
    events: [
      {
        id: "m",
        at: at(1),
        kind: "MANDATE",
        mandateId: "m",
        actorInstanceId: "supervisor",
        grantId: "p",
      },
      {
        id: "c",
        at: at(2),
        kind: "CANDIDATE_PACKET",
        candidateId: "c1",
        artifactSha256: digest("1"),
        ...candidateAuthority,
        actorInstanceId: "searcher",
        grantId: "s",
      },
      {
        id: "a",
        at: at(3),
        kind: "ADMISSION",
        candidateEventId: "c",
        candidateSha256: digest("1"),
        candidateId: "c1",
        decision: "ADMIT",
        valueClass: "MINIMAL_DISCRIMINATOR",
        artifactSha256: digest("2"),
        actorInstanceId: "director",
        grantId: "d",
      },
      {
        id: "e",
        at: at(4),
        kind: "EXECUTABLE_SPEC",
        admissionId: "a",
        admissionSha256: digest("2"),
        candidateId: "c1",
        artifactSha256: digest("3"),
        implementationLocus: "src/x",
        implementationSha256: digest("4"),
        entrypointAndParameters: "run --x",
        expectedOutcomeContract: "falsify",
        estimand: "effect",
        comparator: "baseline",
        positiveControl: "positive",
        negativeControl: "negative",
        validityChecks: ["check"],
        measurementContractSha256: digest("9"),
        runScale: "MINIMAL_DISCRIMINATOR",
        escalationClass: "NONE",
        actorInstanceId: "builder",
        grantId: "b",
      },
      {
        id: "i",
        at: at(5),
        kind: "INTENT",
        admissionId: "a",
        admissionSha256: digest("2"),
        executableSpecificationId: "e",
        executableSpecificationSha256: digest("3"),
        candidateId: "c1",
        artifactSha256: digest("5"),
        actionClass: "BUILD",
        measurementContractSha256: digest("9"),
        runScale: "MINIMAL_DISCRIMINATOR",
        escalationClass: "NONE",
        falsifierOutcomeMap: "map",
        executorSink: "queue",
        terminalDueAt: at(50),
        actorInstanceId: "director",
        grantId: "d",
      },
      {
        id: "r",
        at: at(6),
        kind: "RECEIPT",
        artifactSha256: digest("6"),
        intentId: "i",
        intentSha256: digest("5"),
        terminalClass: "RUN_RECEIPT",
        measurementValidity: "PASS",
        measurementContractSha256: digest("9"),
        evidence: {
          locator: "evidence/r.json",
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
        grantId: "x",
      },
      {
        id: "l",
        at: at(7),
        kind: "LEARNING",
        artifactSha256: digest("8"),
        receiptId: "r",
        receiptSha256: digest("6"),
        prior: "p",
        observation: "o",
        delta: "d",
        uncertainty: "u",
        nextDiscriminatingAction: "n",
        learningClass: "SCIENTIFIC",
        actorInstanceId: "learner",
        grantId: "l",
      },
      {
        id: "k",
        at: at(8),
        kind: "DIRECTOR_COMMIT",
        learningId: "l",
        learningSha256: digest("8"),
        receiptSha256: digest("6"),
        decision: "COMMIT",
        stateTransition: "advance",
        artifactSha256: digest("a"),
        actorInstanceId: "director",
        grantId: "d",
      },
    ],
  };
}
function events(value: Record<string, unknown>): Record<string, unknown>[] {
  return value.events as Record<string, unknown>[];
}
function codes(value: Record<string, unknown>): string[] {
  return checkTrace(value).findings.map((finding) => finding.code);
}
function expectCode(value: Record<string, unknown>, code: string): void {
  expect(codes(value)).toContain(code);
}
if (process.env.WRITE_WIRE_FIXTURES === "1") {
  const directory = resolve(import.meta.dir, "../fixtures");
  const make = (mutate: (value: Record<string, unknown>) => void) => {
    const value = trace();
    mutate(value);
    return `${JSON.stringify(value)}\n`;
  };
  const blocker = (value: Record<string, unknown>) => {
    value.lease = {
      ...(value.lease as Record<string, unknown>),
      terminalTarget: "EXACT_BLOCKER",
    };
    const list = events(value);
    list.splice(5);
    list.push({
      id: "z",
      at: at(6),
      kind: "EXACT_BLOCKER",
      intentId: "i",
      intentSha256: digest("5"),
      failedPrerequisite: "p",
      externalAuthorityOrEvent: "x",
      releaseCondition: "r",
      evidence: {
        locator: "evidence/b",
        sha256: digest("9"),
        tracked: true,
        ignored: false,
      },
      actorInstanceId: "executor",
      grantId: "x",
    });
  };
  const files: Record<string, string> = {
    "valid-intent-receipt-learning.json": make(() => {}),
    "valid-exact-blocker.json": make(blocker),
    "role-switch.json": make((v) =>
      (v.roleGrants as unknown[]).push({
        grantId: "d2",
        actorInstanceId: "director",
        role: "section-director",
      }),
    ),
    "transient-scientific-evidence.json": make(
      (v) =>
        ((events(v)[5].evidence as Record<string, unknown>).locator =
          "/x/.agent-state/y"),
    ),
    "receipt-without-intent.json": make(
      (v) => (events(v)[5].intentId = "missing"),
    ),
    "learn-without-new-receipt.json": make((v) => delete events(v)[6].delta),
    "next-search-before-learning.json": make((v) => {
      events(v).splice(6);
      events(v).push({ ...events(v)[4], id: "i2", at: at(7) });
    }),
    "next-search-before-commit.json": make((v) => {
      events(v).splice(7);
      events(v).push({ ...events(v)[4], id: "i2", at: at(8) });
    }),
    "role-authority-violation.json": make((v) => {
      events(v)[1].grantId = "d";
      events(v)[1].actorInstanceId = "director";
    }),
    "invalid-intent-does-not-release-wip.json": make(
      (v) => (events(v)[4].executableSpecificationSha256 = digest("0")),
    ),
    "proposal-only-100m.json": make((v) => {
      events(v).splice(2);
      events(v).push(
        {
          id: "b1",
          at: at(3),
          kind: "BID",
          actorInstanceId: "director",
          grantId: "d",
        },
        {
          id: "b2",
          at: at(4),
          kind: "BID",
          actorInstanceId: "director",
          grantId: "d",
        },
        {
          id: "b3",
          at: at(5),
          kind: "BID",
          actorInstanceId: "director",
          grantId: "d",
        },
        {
          id: "v",
          at: at(6),
          kind: "MODEL_VERIFICATION",
          actorInstanceId: "director",
          grantId: "d",
        },
      );
    }),
  };
  for (const [name, body] of Object.entries(files))
    writeFileSync(join(directory, name), body);
}

describe("research-section-trace/v2 exact wire", () => {
  test.each([
    ["valid-intent-receipt-learning.json", undefined],
    ["valid-exact-blocker.json", undefined],
    ["role-switch.json", "ROLE_SWITCH"],
    ["transient-scientific-evidence.json", "TRANSIENT_SCIENTIFIC_EVIDENCE"],
    ["receipt-without-intent.json", "RECEIPT_WITHOUT_INTENT"],
    ["learn-without-new-receipt.json", "LEARN_WITHOUT_NEW_RECEIPT"],
    ["next-search-before-learning.json", "NEXT_SEARCH_BEFORE_LEARNING"],
    ["next-search-before-commit.json", "NEXT_SEARCH_BEFORE_LEARNING"],
    ["role-authority-violation.json", "ROLE_AUTHORITY_VIOLATION"],
    ["invalid-intent-does-not-release-wip.json", "INTENT_NOT_EXECUTABLE"],
  ])("live fixture %s", (name, code) => {
    const value = JSON.parse(
      readFileSync(resolve(import.meta.dir, "../fixtures", name), "utf8"),
    ) as Record<string, unknown>;
    if (code === undefined) expect(checkTrace(value).ok).toBe(true);
    else expectCode(value, code);
  });
  test("proposal-only 100m preserves parent findings", () => {
    const value = trace();
    events(value).splice(2);
    events(value).push(
      {
        id: "b1",
        at: at(3),
        kind: "BID",
        actorInstanceId: "director",
        grantId: "d",
      },
      {
        id: "b2",
        at: at(4),
        kind: "BID",
        actorInstanceId: "director",
        grantId: "d",
      },
      {
        id: "b3",
        at: at(5),
        kind: "BID",
        actorInstanceId: "director",
        grantId: "d",
      },
      {
        id: "v",
        at: at(6),
        kind: "MODEL_VERIFICATION",
        actorInstanceId: "director",
        grantId: "d",
      },
    );
    for (const code of [
      "FIRST_INTENT_OVERDUE",
      "CONTROL_WIP_EXCEEDED",
      "PREMATURE_MODEL_VERIFICATION",
      "SEARCH_NOT_STARTED",
      "LEARN_NOT_STARTED",
      "SECTION_STALLED",
    ])
      expectCode(value, code);
  });
  test("green receipt chain passes", () =>
    expect(checkTrace(trace()).ok).toBe(true));
  test("missing authority lineage is rejected before event indexing", () => {
    const value = trace();
    delete (value.authority as Record<string, unknown>).openIssue;
    expectCode(value, "AUTHORITY_LINEAGE_INVALID");
  });
  test("known result cannot be admitted as a novel gap", () => {
    const value = trace();
    events(value)[1].knownResult = true;
    expectCode(value, "KNOWN_RESULT_REDISCOVERY");
  });
  test("candidate must explicitly carry the current grounding known-result disposition", () => {
    const value = trace();
    delete events(value)[1].knownResult;
    expectCode(value, "KNOWN_RESULT_DISPOSITION_MISSING");
  });
  test("registered replication cannot claim knownResult=false", () => {
    const value = trace();
    const authority = value.authority as Record<string, unknown>;
    const grounding = authority.grounding as Record<string, unknown>;
    grounding.knownResultDisposition = "REGISTERED_REPLICATION";
    grounding.knownResult = true;
    events(value)[1].noveltyDisposition = "REGISTERED_REPLICATION";
    expectCode(value, "KNOWN_RESULT_DISPOSITION_MISMATCH");
  });
  test("candidate disposition must exact-match current grounding", () => {
    const value = trace();
    events(value)[1].noveltyDisposition = "REGISTERED_REPLICATION";
    events(value)[1].knownResult = true;
    expectCode(value, "KNOWN_RESULT_DISPOSITION_MISMATCH");
  });
  test("stale grounding and wrong goal axis are rejected", () => {
    const stale = trace();
    events(stale)[1].groundingFence = "old-fence";
    expectCode(stale, "STALE_KNOWLEDGE_SNAPSHOT");
    const wrongGoal = trace();
    events(wrongGoal)[1].goalConstitutionId = "other";
    expectCode(wrongGoal, "GOAL_LINEAGE_MISMATCH");
  });
  test("an intermediate semantic authority link cannot drift from Goal Constitution", () => {
    const value = trace();
    (
      (value.authority as Record<string, unknown>).openIssue as Record<
        string,
        unknown
      >
    ).objectiveId = "other-objective";
    expectCode(value, "GOAL_LINEAGE_MISMATCH");
  });
  test("measurement-invalid receipt closes the intent but earns no scientific credit", () => {
    const value = trace();
    events(value)[5].measurementValidity = "FAIL";
    events(value)[6].learningClass = "INSTRUMENTATION_REPAIR";
    const result = checkTrace(value);
    expect(result.summary).toMatchObject({
      scientificReceipts: 0,
      scientificCommits: 0,
      instrumentationReceipts: 1,
      instrumentationCommits: 1,
    });
    expect(codes(value)).toContain("SEARCH_NOT_STARTED");
    expect(codes(value)).not.toContain("MISSING_TERMINAL_RECEIPT");
  });
  test("REJECT consumes scientific learning but earns no scientific LEARN credit", () => {
    const value = trace();
    events(value)[7].decision = "REJECT";
    const result = checkTrace(value);
    expect(result.summary.scientificReceipts).toBe(1);
    expect(result.summary.scientificCommits).toBe(0);
    expectCode(value, "LEARN_NOT_STARTED");
  });
  test("scientific learning cannot claim a measurement-invalid receipt", () => {
    const value = trace();
    events(value)[5].measurementValidity = "UNKNOWN";
    expectCode(value, "MEASUREMENT_INVALID_FOR_SCIENCE");
  });
  test("escalated confirmation requires a released PASS digest", () => {
    const value = trace();
    events(value)[3].runScale = "ESCALATED_CONFIRMATION";
    events(value)[3].escalationClass = "SCALE";
    expectCode(value, "SWEEP_WITHOUT_RELEASE");
    expect(checkTrace(value).summary).toMatchObject({
      scientificReceipts: 0,
      scientificCommits: 0,
      instrumentationReceipts: 0,
      instrumentationCommits: 0,
    });
  });
  test("escalated confirmation exact-joins a scientific PASS release", () => {
    const value = trace();
    const list = events(value);
    const release = list[7];
    release.scaleRelease = "ESCALATED_CONFIRMATION";
    list.push({
      ...list[3],
      id: "e2",
      at: at(9),
      candidateId: "c1",
      artifactSha256: digest("b"),
      runScale: "ESCALATED_CONFIRMATION",
      escalationClass: "SCALE",
      priorPassReceiptSha256: digest("6"),
      scaleReleaseCommitId: "k",
      scaleReleaseCommitSha256: digest("a"),
    });
    expect(checkTrace(value).ok).toBe(true);
  });
  test("escalated confirmation rejects a wrong release commit digest", () => {
    const value = trace();
    const list = events(value);
    list[7].scaleRelease = "ESCALATED_CONFIRMATION";
    list.push({
      ...list[3],
      id: "e2",
      at: at(9),
      artifactSha256: digest("b"),
      runScale: "ESCALATED_CONFIRMATION",
      escalationClass: "SCALE",
      priorPassReceiptSha256: digest("6"),
      scaleReleaseCommitId: "k",
      scaleReleaseCommitSha256: digest("0"),
    });
    expectCode(value, "SWEEP_WITHOUT_RELEASE");
  });
  test("REJECT cannot release escalated confirmation", () => {
    const value = trace();
    const list = events(value);
    list[7].scaleRelease = "ESCALATED_CONFIRMATION";
    list[7].decision = "REJECT";
    list.push({
      ...list[3],
      id: "e2",
      at: at(9),
      artifactSha256: digest("b"),
      runScale: "ESCALATED_CONFIRMATION",
      escalationClass: "SCALE",
      priorPassReceiptSha256: digest("6"),
      scaleReleaseCommitId: "k",
      scaleReleaseCommitSha256: digest("a"),
    });
    expectCode(value, "SWEEP_WITHOUT_RELEASE");
  });
  test("next candidate may begin after receipt-linked learning and commit", () => {
    const value = trace();
    events(value).push({
      ...events(value)[1],
      id: "c2",
      at: at(9),
      candidateId: "c2",
      artifactSha256: digest("a"),
    });
    expect(checkTrace(value).ok).toBe(true);
    expect(codes(value)).not.toContain("NEXT_SEARCH_BEFORE_LEARNING");
  });
  test("duplicate same-role actor grant is ROLE_SWITCH", () => {
    const value = trace();
    (value.roleGrants as unknown[]).push({
      grantId: "d2",
      actorInstanceId: "director",
      role: "section-director",
    });
    expectCode(value, "ROLE_SWITCH");
  });
  test("unknown kind is invalid", () => {
    const value = trace();
    events(value)[1].kind = "HIDDEN";
    expectCode(value, "TRACE_INVALID");
  });
  test("wrong mandate and candidate authority are rejected", () => {
    const value = trace();
    events(value)[0].grantId = "d";
    events(value)[0].actorInstanceId = "director";
    events(value)[1].grantId = "d";
    events(value)[1].actorInstanceId = "director";
    expectCode(value, "ROLE_AUTHORITY_VIOLATION");
  });
  test("missing pre-action chain blocks intent", () => {
    const value = trace();
    events(value)[4].admissionId = "missing";
    expectCode(value, "INTENT_NOT_EXECUTABLE");
  });
  test("intent must exact-join the executable measurement and scale contract", () => {
    const value = trace();
    events(value)[4].measurementContractSha256 = digest("0");
    expectCode(value, "INTENT_NOT_EXECUTABLE");
    const drift = trace();
    drift.events = events(drift);
    events(drift)[4].runScale = "ESCALATED_CONFIRMATION";
    expectCode(drift, "INTENT_NOT_EXECUTABLE");
    const missing = trace();
    delete events(missing)[4].measurementContractSha256;
    expectCode(missing, "INTENT_NOT_EXECUTABLE");
  });
  test("executable spec requires a consistent escalation class", () => {
    const value = trace();
    events(value)[3].escalationClass = "SCALE";
    expectCode(value, "INTENT_NOT_EXECUTABLE");
  });
  test("digest mutation is explicit", () => {
    const value = trace();
    events(value)[3].admissionSha256 = digest("f");
    expectCode(value, "DIGEST_JOIN_MISMATCH");
  });
  test("evidence requires lowercase SHA-256", () => {
    const value = trace();
    (events(value)[5].evidence as Record<string, unknown>).sha256 = "ABC";
    expectCode(value, "TRANSIENT_SCIENTIFIC_EVIDENCE");
  });
  test("second receipt is duplicate terminal", () => {
    const value = trace();
    const second = structuredClone(events(value)[5]);
    second.id = "r2";
    second.at = at(9);
    events(value).push(second);
    expectCode(value, "DUPLICATE_TERMINAL");
  });
  test("terminal target mismatch is explicit", () => {
    const value = trace();
    events(value)[5].terminalClass = "KILL_RECEIPT";
    expectCode(value, "TERMINAL_TARGET_MISMATCH");
  });
  test("blocker needs exact intent and blocks later search", () => {
    const value = trace();
    const blocker = structuredClone(events(value)[5]);
    Object.assign(blocker, {
      id: "z",
      at: at(9),
      kind: "EXACT_BLOCKER",
      intentSha256: digest("0"),
      failedPrerequisite: "p",
      externalAuthorityOrEvent: "x",
      releaseCondition: "r",
    });
    events(value).push(blocker);
    expectCode(value, "EXACT_BLOCKER_INVALID");
  });
  test("equal, out-of-order, and future times are invalid", () => {
    const value = trace();
    events(value)[2].at = at(2);
    events(value)[3].at = "2026-08-03T00:21:00Z";
    expectCode(value, "TRACE_INVALID");
  });
  test("invalid intent does not release deadline", () => {
    const value = trace();
    events(value)[4].executableSpecificationSha256 = digest("0");
    expectCode(value, "FIRST_INTENT_OVERDUE");
  });
  test("wrong-role candidate cannot release the chain", () => {
    const value = trace();
    events(value)[1].grantId = "d";
    events(value)[1].actorInstanceId = "director";
    expectCode(value, "ROLE_AUTHORITY_VIOLATION");
    expectCode(value, "FIRST_INTENT_OVERDUE");
  });
  test("invalid receipt evidence still closes a structural terminal", () => {
    const value = trace();
    (events(value)[5].evidence as Record<string, unknown>).locator =
      "/x/.agent-state/y";
    expectCode(value, "TRANSIENT_SCIENTIFIC_EVIDENCE");
    expect(codes(value)).not.toContain("MISSING_TERMINAL_RECEIPT");
  });
  test("missing learning fields do not invent a digest finding", () => {
    const value = trace();
    delete events(value)[6].delta;
    expectCode(value, "LEARN_WITHOUT_NEW_RECEIPT");
    expect(codes(value)).not.toContain("DIGEST_JOIN_MISMATCH");
  });
  test("exact blocker alternate terminal passes without learning", () => {
    const value = trace();
    value.lease = {
      ...(value.lease as Record<string, unknown>),
      terminalTarget: "EXACT_BLOCKER",
    };
    const list = events(value);
    list.splice(5);
    list.push({
      id: "z",
      at: at(6),
      kind: "EXACT_BLOCKER",
      intentId: "i",
      intentSha256: digest("5"),
      failedPrerequisite: "p",
      externalAuthorityOrEvent: "x",
      releaseCondition: "r",
      evidence: {
        locator: "evidence/b",
        sha256: digest("9"),
        tracked: true,
        ignored: false,
      },
      actorInstanceId: "executor",
      grantId: "x",
    });
    expect(checkTrace(value).ok).toBe(true);
  });
  test("CLI boundary preserves exit classes and one envelope", () => {
    const directory = mkdtempSync(join(tmpdir(), "trace-wire-"));
    const good = join(directory, "good.json"),
      bad = join(directory, "bad.json");
    writeFileSync(good, `${JSON.stringify(trace())}\n`);
    const invalid = trace();
    events(invalid)[1].kind = "HIDDEN";
    writeFileSync(bad, `${JSON.stringify(invalid)}\n`);
    const cli = resolve(import.meta.dir, "../cli.ts");
    const run = (args: string[]) =>
      Bun.spawnSync({
        cmd: ["bun", cli, ...args],
        stdout: "pipe",
        stderr: "pipe",
      });
    const pass = run([good]),
      fail = run([bad]),
      help = run(["--help"]),
      missing = run([]),
      unknown = run(["--wat"]),
      unreadable = run([join(directory, "none.json")]);
    expect(pass.exitCode).toBe(0);
    expect(pass.stdout.toString().trim().split("\n")).toHaveLength(1);
    expect(fail.exitCode).toBe(1);
    expect(help.exitCode).toBe(0);
    expect(missing.exitCode).toBe(1);
    expect(unknown.exitCode).toBe(1);
    expect(unreadable.exitCode).toBe(2);
    expect(unreadable.stderr.toString()).toStartWith("FATAL:");
  });
});
