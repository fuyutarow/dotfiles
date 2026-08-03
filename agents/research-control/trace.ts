export const SCHEMA = "research-section-trace/v2";
export type Finding = { code: string; eventId?: string; message: string };
type R = Record<string, unknown>;
type E = R & {
  id: string;
  at: string;
  kind: string;
  actorInstanceId: string;
  grantId: string;
};
type G = { grantId: string; actorInstanceId: string; role: string };

const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const SHA = /^[a-f0-9]{64}$/;
const knownResultDispositions = new Set([
  "NOVEL_GAP",
  "REGISTERED_REPLICATION",
  "KNOWN_DUPLICATE",
  "RETRACTION_RISK",
]);
const roles = new Set([
  "programme-supervisor",
  "section-director",
  "section-grounder",
  "searcher",
  "builder",
  "executor",
  "section-learner",
  "process-auditor",
  "verifier",
]);
const kinds = new Set([
  "OPEN_ISSUE",
  "BID",
  "MANDATE",
  "CHARTER",
  "CANDIDATE_PACKET",
  "ADMISSION",
  "EXECUTABLE_SPEC",
  "DENOMINATOR_FREEZE",
  "NORMALIZATION",
  "AUDIT_BRIEF",
  "CONTINUATION",
  "VERIFICATION_ATTEMPT",
  "MODEL_VERIFICATION",
  "INTENT",
  "RECEIPT",
  "LEARNING",
  "DIRECTOR_COMMIT",
  "EXACT_BLOCKER",
  "PROMOTION",
]);
const control = new Set([
  "OPEN_ISSUE",
  "BID",
  "MANDATE",
  "CHARTER",
  "CANDIDATE_PACKET",
  "ADMISSION",
  "DENOMINATOR_FREEZE",
  "NORMALIZATION",
  "AUDIT_BRIEF",
  "CONTINUATION",
  "VERIFICATION_ATTEMPT",
]);
const authority = new Map<string, readonly string[]>([
  ["OPEN_ISSUE", ["programme-supervisor"]],
  ["MANDATE", ["programme-supervisor"]],
  ["BID", ["section-director"]],
  ["CHARTER", ["section-director"]],
  ["ADMISSION", ["section-director"]],
  ["INTENT", ["section-director"]],
  ["DIRECTOR_COMMIT", ["section-director"]],
  ["CANDIDATE_PACKET", ["searcher"]],
  ["EXECUTABLE_SPEC", ["builder"]],
  ["RECEIPT", ["executor"]],
  ["EXACT_BLOCKER", ["executor"]],
  ["LEARNING", ["section-learner"]],
  ["AUDIT_BRIEF", ["process-auditor"]],
  ["VERIFICATION_ATTEMPT", ["verifier"]],
  ["MODEL_VERIFICATION", ["verifier"]],
  ["PROMOTION", ["section-director", "process-auditor"]],
]);

function record(value: unknown): value is R {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}
function time(value: unknown): number | undefined {
  if (!nonempty(value) || !RFC3339.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}
function sha(value: unknown): value is string {
  return typeof value === "string" && SHA.test(value);
}
function add(
  findings: Finding[],
  code: string,
  message: string,
  eventId?: string,
): void {
  findings.push({
    code,
    message,
    ...(eventId === undefined ? {} : { eventId }),
  });
}
function fields(event: E, names: string[]): boolean {
  return names.every((name) => nonempty(event[name]));
}
function evidence(value: unknown): boolean {
  return (
    record(value) &&
    nonempty(value.locator) &&
    sha(value.sha256) &&
    value.tracked === true &&
    value.ignored === false &&
    value.locator !== ".agent-state" &&
    !/(?:^|\/)\.agent-state(?:\/|$)/.test(value.locator)
  );
}
function dispositionMatchesKnownResult(
  disposition: unknown,
  knownResult: unknown,
): boolean {
  return (
    knownResultDispositions.has(String(disposition)) &&
    typeof knownResult === "boolean" &&
    knownResult === (disposition !== "NOVEL_GAP")
  );
}

export type TraceResult = {
  ok: boolean;
  schema: typeof SCHEMA;
  findings: Finding[];
  summary: {
    events: number;
    intents: number;
    receipts: number;
    learning: number;
    commits: number;
    scientificReceipts: number;
    scientificCommits: number;
    instrumentationReceipts: number;
    instrumentationCommits: number;
    candidates: number;
    executableSpecs: number;
    sectionId: string | null;
    leaseId: string | null;
    receiptDigests: string[];
  };
};

export function checkTrace(input: unknown): TraceResult {
  const findings: Finding[] = [];
  const result = (
    events = 0,
    intents = 0,
    receipts = 0,
    learning = 0,
    commits = 0,
    scientificReceipts = 0,
    scientificCommits = 0,
    instrumentationReceipts = 0,
    instrumentationCommits = 0,
    candidates = 0,
    executableSpecs = 0,
    sectionId: string | null = null,
    leaseId: string | null = null,
    receiptDigests: string[] = [],
  ): TraceResult => ({
    ok: findings.length === 0,
    schema: SCHEMA,
    findings,
    summary: {
      events,
      intents,
      receipts,
      learning,
      commits,
      scientificReceipts,
      scientificCommits,
      instrumentationReceipts,
      instrumentationCommits,
      candidates,
      executableSpecs,
      sectionId,
      leaseId,
      receiptDigests,
    },
  });
  if (
    !record(input) ||
    input.schema !== SCHEMA ||
    !record(input.lease) ||
    !record(input.authority) ||
    !Array.isArray(input.roleGrants) ||
    !Array.isArray(input.events)
  ) {
    add(
      findings,
      "TRACE_INVALID",
      "trace requires schema, authority, lease, roleGrants, and events",
    );
    return result();
  }
  const authorityRoot = input.authority;
  const lineageNames = [
    "goalConstitution",
    "programmeSnapshot",
    "openIssue",
    "sectionMandate",
    "sectionCharter",
    "grounding",
  ] as const;
  const lineage = Object.fromEntries(
    lineageNames.map((name) => [name, authorityRoot[name]]),
  ) as Record<(typeof lineageNames)[number], unknown>;
  const authorityRecord = lineageNames.every((name) => record(lineage[name]));
  const link = (child: string, parent: string): boolean => {
    const c = lineage[child] as R;
    const p = lineage[parent] as R;
    return (
      nonempty(c.id) &&
      sha(c.sha256) &&
      c[`${parent}Id`] === p.id &&
      c[`${parent}Sha256`] === p.sha256
    );
  };
  const grounding = authorityRecord ? (lineage.grounding as R) : undefined;
  const goal = authorityRecord ? (lineage.goalConstitution as R) : undefined;
  const semanticGoalValid =
    goal !== undefined &&
    Number.isInteger(goal.revision) &&
    (goal.revision as number) >= 0 &&
    nonempty(goal.signer) &&
    nonempty(goal.objectiveId) &&
    nonempty(goal.successObservableId) &&
    Array.isArray(goal.invariantIds) &&
    goal.invariantIds.length > 0 &&
    goal.invariantIds.every(nonempty) &&
    new Set(goal.invariantIds).size === goal.invariantIds.length;
  const semanticJoin = (value: R): boolean =>
    semanticGoalValid &&
    value.objectiveId === goal?.objectiveId &&
    value.successObservableId === goal?.successObservableId &&
    JSON.stringify(value.invariantIds) === JSON.stringify(goal?.invariantIds);
  const authorityValid =
    authorityRecord &&
    link("programmeSnapshot", "goalConstitution") &&
    link("openIssue", "programmeSnapshot") &&
    link("sectionMandate", "openIssue") &&
    link("sectionCharter", "sectionMandate") &&
    lineageNames.slice(1).every((name) => semanticJoin(lineage[name] as R)) &&
    grounding !== undefined &&
    link("grounding", "sectionCharter") &&
    Number.isInteger(grounding.revision) &&
    (grounding.revision as number) >= 0 &&
    nonempty(grounding.fence) &&
    sha(grounding.sha256) &&
    fields(grounding as E, ["objective", "success"]) &&
    dispositionMatchesKnownResult(
      grounding.knownResultDisposition,
      grounding.knownResult,
    ) &&
    Array.isArray(grounding.invariants) &&
    grounding.invariants.length > 0 &&
    grounding.invariants.every(nonempty);
  if (!authorityValid)
    add(
      findings,
      "AUTHORITY_LINEAGE_INVALID",
      "authority must exact-join Goal Constitution through current grounding",
    );
  if (authorityRecord && !authorityValid)
    add(
      findings,
      "GOAL_LINEAGE_MISMATCH",
      "authority lineage does not preserve the Goal Constitution semantic IDs",
    );
  const lease = input.lease;
  const start = time(lease.startedAt),
    expires = time(lease.expiresAt),
    due = time(lease.firstIntentDueAt),
    evaluated = time(input.evaluatedAt);
  const classes = lease.allowedActionClasses;
  const validLease =
    ["leaseId", "sectionId", "mandateId"].every((key) =>
      nonempty(lease[key]),
    ) &&
    start !== undefined &&
    expires !== undefined &&
    due !== undefined &&
    evaluated !== undefined &&
    ["ACTIVE", "TERMINATED"].includes(String(input.status)) &&
    evaluated >= start &&
    expires > start &&
    due >= start &&
    due <= Math.min(start + 1_800_000, start + (expires - start) * 0.2) &&
    Number.isInteger(lease.maxControlEventsBeforeIntent) &&
    typeof lease.maxControlEventsBeforeIntent === "number" &&
    lease.maxControlEventsBeforeIntent >= 0 &&
    lease.maxControlEventsBeforeIntent <= 2 &&
    Number.isInteger(lease.maxProposalEventsBeforeIntent) &&
    typeof lease.maxProposalEventsBeforeIntent === "number" &&
    lease.maxProposalEventsBeforeIntent >= 0 &&
    lease.maxProposalEventsBeforeIntent <= 1 &&
    Array.isArray(classes) &&
    classes.length > 0 &&
    new Set(classes).size === classes.length &&
    classes.every((value) =>
      ["PROOF", "BUILD", "EXPERIMENT", "MEASUREMENT"].includes(String(value)),
    ) &&
    ["PROOF_RECEIPT", "RUN_RECEIPT", "KILL_RECEIPT", "EXACT_BLOCKER"].includes(
      String(lease.terminalTarget),
    );
  if (!validLease)
    add(
      findings,
      "TRACE_INVALID",
      "invalid status, RFC3339 lease/evaluation time, budget, action class, or terminal target",
    );
  if (!Array.isArray(classes) || classes.length === 0)
    add(
      findings,
      "NO_SCIENTIFIC_ACTION_PATH",
      "lease allows no scientific action class",
    );

  const grants = new Map<string, G>();
  const actors = new Set<string>();
  for (const raw of input.roleGrants) {
    if (
      !record(raw) ||
      !nonempty(raw.grantId) ||
      !nonempty(raw.actorInstanceId) ||
      !nonempty(raw.role) ||
      !roles.has(raw.role) ||
      grants.has(raw.grantId)
    ) {
      add(
        findings,
        "TRACE_INVALID",
        "grant must have a unique id and closed role",
      );
      continue;
    }
    if (actors.has(raw.actorInstanceId))
      add(
        findings,
        "ROLE_SWITCH",
        "actor instance has more than one immutable grant",
        raw.actorInstanceId,
      );
    actors.add(raw.actorInstanceId);
    grants.set(raw.grantId, {
      grantId: raw.grantId,
      actorInstanceId: raw.actorInstanceId,
      role: raw.role,
    });
  }
  const grounder = authorityValid ? (grounding as R) : undefined;
  const grounderGrant = nonempty(grounder?.grounderGrantId)
    ? grants.get(grounder.grounderGrantId)
    : undefined;
  if (
    grounder === undefined ||
    grounderGrant?.role !== "section-grounder" ||
    grounderGrant.actorInstanceId !== grounder.grounderActorInstanceId
  )
    add(
      findings,
      "GROUNDING_AUTHORITY_INVALID",
      "current grounding requires its immutable section-grounder grant",
    );
  const events: E[] = [];
  const ids = new Set<string>();
  for (const raw of input.events) {
    if (
      !record(raw) ||
      !nonempty(raw.id) ||
      !nonempty(raw.kind) ||
      !nonempty(raw.actorInstanceId) ||
      !nonempty(raw.grantId) ||
      time(raw.at) === undefined ||
      ids.has(raw.id)
    ) {
      add(
        findings,
        "TRACE_INVALID",
        "event requires unique id, RFC3339 time, kind, actor, and grant",
      );
      continue;
    }
    ids.add(raw.id);
    const event: E = {
      ...raw,
      id: raw.id,
      at: raw.at,
      kind: raw.kind,
      actorInstanceId: raw.actorInstanceId,
      grantId: raw.grantId,
    };
    events.push(event);
    if (!kinds.has(event.kind))
      add(findings, "TRACE_INVALID", "unknown event kind", event.id);
    const grant = grants.get(event.grantId);
    if (grant === undefined || grant.actorInstanceId !== event.actorInstanceId)
      add(findings, "TRACE_INVALID", "event grant identity mismatch", event.id);
    const allowed = authority.get(event.kind);
    if (allowed !== undefined && !allowed.includes(grant?.role ?? ""))
      add(
        findings,
        "ROLE_AUTHORITY_VIOLATION",
        `${event.kind} has wrong role`,
        event.id,
      );
    if (evaluated !== undefined && time(event.at)! > evaluated)
      add(
        findings,
        "TRACE_INVALID",
        "event is later than evaluatedAt",
        event.id,
      );
  }
  for (let i = 1; i < events.length; i += 1)
    if (time(events[i - 1].at)! >= time(events[i].at)!)
      add(
        findings,
        "TRACE_INVALID",
        "event times must strictly increase",
        events[i].id,
      );
  const byId = new Map(events.map((event) => [event.id, event]));
  const mandates = events.filter((event) => event.kind === "MANDATE");
  const mandate =
    mandates.length === 1 &&
    mandates[0].mandateId === lease.mandateId &&
    grants.get(mandates[0].grantId)?.role === "programme-supervisor" &&
    start !== undefined &&
    due !== undefined &&
    time(mandates[0].at)! >= start &&
    time(mandates[0].at)! <= due
      ? mandates[0]
      : undefined;
  if (mandate === undefined)
    add(
      findings,
      "TRACE_INVALID",
      "exactly one matching Programme-Supervisor mandate is required",
    );

  const candidates = events.filter(
    (event) => event.kind === "CANDIDATE_PACKET",
  );
  const admissions = events.filter((event) => event.kind === "ADMISSION");
  const specs = events.filter((event) => event.kind === "EXECUTABLE_SPEC");
  const intents = events.filter((event) => event.kind === "INTENT");
  const invalidIntent = (event: E, message: string): void =>
    add(findings, "INTENT_NOT_EXECUTABLE", message, event.id);
  const digestMismatch = (event: E, message: string): void =>
    add(findings, "DIGEST_JOIN_MISMATCH", message, event.id);
  const candidateAuthorityJoin = (event: E): boolean =>
    authorityValid &&
    lineageNames.every((name) => {
      const value = lineage[name] as R;
      return (
        event[`${name}Id`] === value.id &&
        event[`${name}Sha256`] === value.sha256
      );
    }) &&
    event.groundingRevision === grounding?.revision &&
    event.groundingFence === grounding?.fence &&
    event.groundingSha256 === grounding?.sha256 &&
    event.objective === grounding?.objective &&
    event.success === grounding?.success &&
    JSON.stringify(event.invariants) ===
      JSON.stringify(grounding?.invariants) &&
    event.noveltyDisposition === grounding?.knownResultDisposition &&
    event.knownResult === grounding?.knownResult &&
    dispositionMatchesKnownResult(
      event.noveltyDisposition,
      event.knownResult,
    ) &&
    semanticJoin(event);
  const candidateValid = (event: E): boolean =>
    grants.get(event.grantId)?.role === "searcher" &&
    mandate !== undefined &&
    time(event.at)! > time(mandate.at)! &&
    nonempty(event.candidateId) &&
    sha(event.artifactSha256) &&
    candidateAuthorityJoin(event) &&
    ["NOVEL_GAP", "REGISTERED_REPLICATION"].includes(
      String(event.noveltyDisposition),
    );
  for (const candidate of candidates) {
    if (typeof candidate.knownResult !== "boolean")
      add(
        findings,
        "KNOWN_RESULT_DISPOSITION_MISSING",
        "candidate must declare the current grounding known-result disposition",
        candidate.id,
      );
    if (
      candidate.noveltyDisposition !== grounding?.knownResultDisposition ||
      candidate.knownResult !== grounding?.knownResult ||
      !dispositionMatchesKnownResult(
        candidate.noveltyDisposition,
        candidate.knownResult,
      )
    )
      add(
        findings,
        "KNOWN_RESULT_DISPOSITION_MISMATCH",
        "candidate novelty disposition and known-result boolean must exact-join current grounding",
        candidate.id,
      );
    if (
      candidate.knownResult === true &&
      candidate.noveltyDisposition === "NOVEL_GAP"
    )
      add(
        findings,
        "KNOWN_RESULT_REDISCOVERY",
        "known result cannot be admitted as a novel gap",
        candidate.id,
      );
    if (
      candidate.groundingRevision !== grounding?.revision ||
      candidate.groundingFence !== grounding?.fence ||
      candidate.groundingSha256 !== grounding?.sha256
    )
      add(
        findings,
        "STALE_KNOWLEDGE_SNAPSHOT",
        "candidate does not use the current grounding revision and fence",
        candidate.id,
      );
    if (
      candidate.groundingRevision === grounding?.revision &&
      candidate.groundingFence === grounding?.fence &&
      candidate.groundingSha256 === grounding?.sha256 &&
      !candidateAuthorityJoin(candidate)
    )
      add(
        findings,
        "GOAL_LINEAGE_MISMATCH",
        "candidate does not exact-join the goal, objective, success, and invariants",
        candidate.id,
      );
    if (!candidateValid(candidate))
      invalidIntent(
        candidate,
        "candidate lacks required fields, authority, or mandate ordering",
      );
  }
  const validCandidates = candidates.filter(candidateValid);
  const validAdmission = (event: E): boolean => {
    const candidate = nonempty(event.candidateEventId)
      ? byId.get(event.candidateEventId)
      : undefined;
    const good =
      grants.get(event.grantId)?.role === "section-director" &&
      candidate?.kind === "CANDIDATE_PACKET" &&
      candidateValid(candidate) &&
      time(candidate.at)! < time(event.at)! &&
      candidate.candidateId === event.candidateId &&
      candidate.artifactSha256 === event.candidateSha256 &&
      sha(event.artifactSha256) &&
      event.decision === "ADMIT" &&
      [
        "UPSTREAM_KILL",
        "MINIMAL_DISCRIMINATOR",
        "REPLICATION",
        "CONFIRMATION",
      ].includes(String(event.valueClass)) &&
      !(candidate.knownResult === true && event.valueClass !== "REPLICATION");
    if (
      candidate !== undefined &&
      nonempty(event.candidateSha256) &&
      event.candidateSha256 !== candidate.artifactSha256
    )
      digestMismatch(event, "admission candidate digest mismatch");
    if (!good)
      invalidIntent(event, "admission does not exactly join candidate");
    return good;
  };
  const admissionOk = new Set(
    admissions.filter(validAdmission).map((event) => event.id),
  );
  const validSpec = (event: E): boolean => {
    const admission = nonempty(event.admissionId)
      ? byId.get(event.admissionId)
      : undefined;
    const good =
      grants.get(event.grantId)?.role === "builder" &&
      admission?.kind === "ADMISSION" &&
      admissionOk.has(admission.id) &&
      time(admission.at)! < time(event.at)! &&
      admission.artifactSha256 === event.admissionSha256 &&
      admission.candidateId === event.candidateId &&
      sha(event.artifactSha256) &&
      sha(event.implementationSha256) &&
      fields(event, [
        "implementationLocus",
        "entrypointAndParameters",
        "expectedOutcomeContract",
      ]) &&
      fields(event, [
        "estimand",
        "comparator",
        "positiveControl",
        "negativeControl",
      ]) &&
      Array.isArray(event.validityChecks) &&
      event.validityChecks.length > 0 &&
      event.validityChecks.every(nonempty) &&
      sha(event.measurementContractSha256) &&
      ((event.runScale === "MINIMAL_DISCRIMINATOR" &&
        event.escalationClass === "NONE") ||
        (event.runScale === "ESCALATED_CONFIRMATION" &&
          ["SCALE", "FULL_SWEEP", "GPU_PORT"].includes(
            String(event.escalationClass),
          )));
    if (
      admission !== undefined &&
      nonempty(event.admissionSha256) &&
      event.admissionSha256 !== admission.artifactSha256
    )
      digestMismatch(event, "spec admission digest mismatch");
    if (!good)
      invalidIntent(event, "executable spec does not exactly join admission");
    return good;
  };
  const specOk = new Set(specs.filter(validSpec).map((event) => event.id));
  const validIntent = (event: E): boolean => {
    const admission = nonempty(event.admissionId)
      ? byId.get(event.admissionId)
      : undefined;
    const spec = nonempty(event.executableSpecificationId)
      ? byId.get(event.executableSpecificationId)
      : undefined;
    const deadline = time(event.terminalDueAt);
    const good =
      grants.get(event.grantId)?.role === "section-director" &&
      mandate !== undefined &&
      time(event.at)! > time(mandate.at)! &&
      admission?.kind === "ADMISSION" &&
      admissionOk.has(admission.id) &&
      spec?.kind === "EXECUTABLE_SPEC" &&
      specOk.has(spec.id) &&
      time(spec.at)! < time(event.at)! &&
      admission.artifactSha256 === event.admissionSha256 &&
      spec.artifactSha256 === event.executableSpecificationSha256 &&
      admission.candidateId === event.candidateId &&
      spec.candidateId === event.candidateId &&
      spec.measurementContractSha256 === event.measurementContractSha256 &&
      spec.runScale === event.runScale &&
      spec.escalationClass === event.escalationClass &&
      sha(event.artifactSha256) &&
      Array.isArray(classes) &&
      classes.includes(event.actionClass) &&
      fields(event, ["falsifierOutcomeMap", "executorSink"]) &&
      deadline !== undefined &&
      expires !== undefined &&
      deadline > time(event.at)! &&
      deadline <= expires;
    if (
      admission !== undefined &&
      nonempty(event.admissionSha256) &&
      event.admissionSha256 !== admission.artifactSha256
    )
      digestMismatch(event, "intent admission digest mismatch");
    if (
      spec !== undefined &&
      nonempty(event.executableSpecificationSha256) &&
      event.executableSpecificationSha256 !== spec.artifactSha256
    )
      digestMismatch(event, "intent specification digest mismatch");
    if (!good)
      invalidIntent(
        event,
        "intent lacks exact candidate/admission/specification chain",
      );
    return good;
  };
  const validIntents = intents.filter(validIntent);
  const validIntentIds = new Set(validIntents.map((event) => event.id));
  const firstIntent = validIntents[0];
  if (
    firstIntent === undefined &&
    due !== undefined &&
    evaluated !== undefined &&
    evaluated > due
  )
    add(
      findings,
      "FIRST_INTENT_OVERDUE",
      "no valid intent by firstIntentDueAt",
    );
  const window =
    mandate === undefined
      ? []
      : events.filter(
          (event) =>
            time(event.at)! > time(mandate.at)! &&
            (firstIntent === undefined ||
              time(event.at)! < time(firstIntent.at)!),
        );
  if (
    typeof lease.maxControlEventsBeforeIntent === "number" &&
    window.filter(
      (event) => control.has(event.kind) && event.kind !== "MANDATE",
    ).length > lease.maxControlEventsBeforeIntent
  )
    add(findings, "CONTROL_WIP_EXCEEDED", "control WIP exceeded");
  if (
    typeof lease.maxProposalEventsBeforeIntent === "number" &&
    window.filter((event) => event.kind === "CANDIDATE_PACKET").length >
      lease.maxProposalEventsBeforeIntent
  )
    add(findings, "PROPOSAL_WIP_EXCEEDED", "proposal WIP exceeded");

  const terminalsByIntent = new Map<string, E[]>();
  const terminalCounts = new Map<string, number>();
  const validReceipts = new Map<string, E>();
  const scientificReceipts = new Map<string, E>();
  const blockers: E[] = [];
  for (const event of events)
    if (event.kind === "RECEIPT" || event.kind === "EXACT_BLOCKER") {
      const intent = nonempty(event.intentId)
        ? byId.get(event.intentId)
        : undefined;
      const joined =
        grants.get(event.grantId)?.role === "executor" &&
        intent !== undefined &&
        validIntentIds.has(intent.id) &&
        time(event.at)! > time(intent.at)! &&
        event.intentSha256 === intent.artifactSha256;
      if (!joined) {
        add(
          findings,
          event.kind === "EXACT_BLOCKER"
            ? "EXACT_BLOCKER_INVALID"
            : "RECEIPT_WITHOUT_INTENT",
          "terminal lacks exact valid intent join",
          event.id,
        );
        if (
          intent !== undefined &&
          nonempty(event.intentSha256) &&
          event.intentSha256 !== intent.artifactSha256
        )
          digestMismatch(event, "terminal intent digest mismatch");
        continue;
      }
      const count = (terminalCounts.get(intent.id) ?? 0) + 1;
      terminalCounts.set(intent.id, count);
      if (count > 1)
        add(
          findings,
          "DUPLICATE_TERMINAL",
          "intent has more than one terminal",
          event.id,
        );
      if (!evidence(event.evidence))
        add(
          findings,
          "TRANSIENT_SCIENTIFIC_EVIDENCE",
          "scientific evidence is invalid",
          event.id,
        );
      if (event.kind === "RECEIPT") {
        const spec = nonempty(intent.executableSpecificationId)
          ? byId.get(intent.executableSpecificationId)
          : undefined;
        const measurementJoined =
          spec?.kind === "EXECUTABLE_SPEC" &&
          event.measurementContractSha256 === spec.measurementContractSha256 &&
          ["PASS", "FAIL", "UNKNOWN"].includes(
            String(event.measurementValidity),
          );
        if (!measurementJoined)
          add(
            findings,
            "MEASUREMENT_CONTRACT_MISMATCH",
            "receipt must exact-join its executable measurement contract",
            event.id,
          );
        if (!evidence(event.measurementValidityEvidence))
          add(
            findings,
            "MEASUREMENT_VALIDITY_EVIDENCE_INVALID",
            "receipt needs durable measurement validity evidence separate from observation evidence",
            event.id,
          );
        if (
          event.terminalClass !== lease.terminalTarget ||
          lease.terminalTarget === "EXACT_BLOCKER"
        )
          add(
            findings,
            "TERMINAL_TARGET_MISMATCH",
            "receipt terminal class differs from lease target",
            event.id,
          );
        else if (sha(event.artifactSha256) && measurementJoined) {
          validReceipts.set(event.id, event);
          terminalsByIntent.set(intent.id, [event]);
          if (
            event.measurementValidity === "PASS" &&
            evidence(event.evidence) &&
            evidence(event.measurementValidityEvidence)
          )
            scientificReceipts.set(event.id, event);
        }
      } else {
        blockers.push(event);
        if (
          input.status !== "TERMINATED" ||
          lease.terminalTarget !== "EXACT_BLOCKER" ||
          !fields(event, [
            "failedPrerequisite",
            "externalAuthorityOrEvent",
            "releaseCondition",
          ]) ||
          !evidence(event.evidence)
        )
          add(
            findings,
            "EXACT_BLOCKER_INVALID",
            "blocker terminal is invalid",
            event.id,
          );
        else terminalsByIntent.set(intent.id, [event]);
      }
    }
  const validBlocker = blockers.some(
    (event) =>
      !findings.some(
        (finding) =>
          finding.eventId === event.id &&
          finding.code === "EXACT_BLOCKER_INVALID",
      ),
  );
  for (const blocker of blockers)
    for (const later of events.filter(
      (event) =>
        time(event.at)! > time(blocker.at)! &&
        ["CANDIDATE_PACKET", "ADMISSION", "EXECUTABLE_SPEC", "INTENT"].includes(
          event.kind,
        ),
    ))
      add(
        findings,
        "SEARCH_AFTER_EXACT_BLOCKER",
        "search follows exact blocker",
        later.id,
      );

  const learning = events.filter((event) => event.kind === "LEARNING");
  const validLearning = new Map<string, E>();
  const usedReceipts = new Set<string>();
  for (const item of learning) {
    const receipt = nonempty(item.receiptId)
      ? validReceipts.get(item.receiptId)
      : undefined;
    const scientific =
      receipt !== undefined && scientificReceipts.has(receipt.id);
    if (item.learningClass === "SCIENTIFIC" && !scientific)
      add(
        findings,
        "MEASUREMENT_INVALID_FOR_SCIENCE",
        "scientific learning requires a PASS receipt with durable measurement validity evidence",
        item.id,
      );
    const good =
      receipt !== undefined &&
      time(item.at)! > time(receipt.at)! &&
      item.receiptSha256 === receipt.artifactSha256 &&
      !usedReceipts.has(item.receiptId) &&
      sha(item.artifactSha256) &&
      ["SCIENTIFIC", "INSTRUMENTATION_REPAIR"].includes(
        String(item.learningClass),
      ) &&
      (item.learningClass !== "SCIENTIFIC" || scientific) &&
      fields(item, [
        "prior",
        "observation",
        "delta",
        "uncertainty",
        "nextDiscriminatingAction",
      ]);
    if (!good) {
      add(
        findings,
        "LEARN_WITHOUT_NEW_RECEIPT",
        "learning lacks exact new receipt join",
        item.id,
      );
      if (
        receipt !== undefined &&
        nonempty(item.receiptSha256) &&
        item.receiptSha256 !== receipt.artifactSha256
      )
        digestMismatch(item, "learning receipt digest mismatch");
    } else {
      usedReceipts.add(item.receiptId);
      validLearning.set(item.id, item);
    }
  }
  const committed = new Map<string, E>();
  const scientificCommits = new Map<string, E>();
  for (const commit of events.filter(
    (event) => event.kind === "DIRECTOR_COMMIT",
  )) {
    const item = nonempty(commit.learningId)
      ? validLearning.get(commit.learningId)
      : undefined;
    const receipt =
      item !== undefined && nonempty(item.receiptId)
        ? validReceipts.get(item.receiptId)
        : undefined;
    const good =
      item !== undefined &&
      receipt !== undefined &&
      time(commit.at)! > time(item.at)! &&
      commit.actorInstanceId !== item.actorInstanceId &&
      commit.learningSha256 === item.artifactSha256 &&
      commit.receiptSha256 === receipt.artifactSha256 &&
      ["COMMIT", "REJECT", "DEFER"].includes(String(commit.decision)) &&
      nonempty(commit.stateTransition) &&
      !committed.has(item.id);
    if (!good) {
      add(
        findings,
        "LEARN_WITHOUT_NEW_RECEIPT",
        "commit lacks exact later learning join",
        commit.id,
      );
      if (
        item !== undefined &&
        nonempty(commit.learningSha256) &&
        commit.learningSha256 !== item.artifactSha256
      )
        digestMismatch(commit, "commit learning digest mismatch");
      if (
        receipt !== undefined &&
        nonempty(commit.receiptSha256) &&
        commit.receiptSha256 !== receipt.artifactSha256
      )
        digestMismatch(commit, "commit receipt digest mismatch");
    } else {
      committed.set(item.id, commit);
      if (item.learningClass === "SCIENTIFIC" && commit.decision === "COMMIT")
        scientificCommits.set(item.id, commit);
    }
  }
  for (const item of validLearning.values())
    if (!committed.has(item.id))
      add(
        findings,
        "LEARN_WITHOUT_NEW_RECEIPT",
        "learning needs one later commit",
        item.id,
      );
  const unreleasedEscalatedSpecs = new Set<string>();
  for (const spec of specs)
    if (spec.runScale === "ESCALATED_CONFIRMATION") {
      const receipt = [...scientificReceipts.values()].find(
        (item) =>
          item.artifactSha256 === spec.priorPassReceiptSha256 &&
          time(item.at)! < time(spec.at)!,
      );
      const release = nonempty(spec.scaleReleaseCommitId)
        ? events.find((event) => event.id === spec.scaleReleaseCommitId)
        : undefined;
      const learned =
        receipt !== undefined &&
        [...validLearning.values()].some(
          (item) =>
            item.learningClass === "SCIENTIFIC" &&
            item.receiptId === receipt.id,
        );
      const committedReceipt =
        release?.kind === "DIRECTOR_COMMIT" &&
        sha(release.artifactSha256) &&
        release.decision === "COMMIT" &&
        release.scaleRelease === "ESCALATED_CONFIRMATION" &&
        release.artifactSha256 === spec.scaleReleaseCommitSha256 &&
        receipt !== undefined &&
        release.receiptSha256 === receipt.artifactSha256 &&
        time(release.at)! < time(spec.at)! &&
        [...scientificCommits.values()].some((item) => item.id === release.id);
      if (!learned || !committedReceipt) {
        unreleasedEscalatedSpecs.add(spec.id);
        add(
          findings,
          "SWEEP_WITHOUT_RELEASE",
          "escalated confirmation needs an exact scientifically learned PASS receipt and released Director commit",
          spec.id,
        );
      }
    }
  const unreleasedEscalatedIntents = new Set(
    validIntents
      .filter((intent) =>
        unreleasedEscalatedSpecs.has(String(intent.executableSpecificationId)),
      )
      .map((intent) => intent.id),
  );
  const creditableScientificReceipts = new Map(
    [...scientificReceipts].filter(([receiptId]) => {
      const receipt = validReceipts.get(receiptId);
      return (
        receipt !== undefined &&
        !unreleasedEscalatedIntents.has(String(receipt.intentId))
      );
    }),
  );
  const creditableScientificCommits = new Map(
    [...scientificCommits].filter(([, commit]) => {
      const learning = nonempty(commit.learningId)
        ? validLearning.get(commit.learningId)
        : undefined;
      return (
        learning !== undefined &&
        creditableScientificReceipts.has(String(learning.receiptId))
      );
    }),
  );
  const instrumentationCommits = new Map(
    [...committed].filter(([learningId, commit]) => {
      const item = validLearning.get(learningId);
      const receipt =
        item !== undefined && nonempty(item.receiptId)
          ? validReceipts.get(item.receiptId)
          : undefined;
      return (
        item?.learningClass === "INSTRUMENTATION_REPAIR" &&
        receipt !== undefined &&
        ["FAIL", "UNKNOWN"].includes(String(receipt.measurementValidity)) &&
        commit.decision === "COMMIT"
      );
    }),
  );
  const instrumentationReceipts = new Map(
    [...instrumentationCommits.values()].flatMap((commit) => {
      const item = nonempty(commit.learningId)
        ? validLearning.get(commit.learningId)
        : undefined;
      const receipt =
        item !== undefined
          ? validReceipts.get(String(item.receiptId))
          : undefined;
      return receipt === undefined ? [] : [[receipt.id, receipt] as const];
    }),
  );
  for (const receipt of validReceipts.values()) {
    const next = events.find(
      (event) =>
        time(event.at)! > time(receipt.at)! &&
        (event.kind === "CANDIDATE_PACKET" ||
          (event.kind === "INTENT" && validIntentIds.has(event.id))),
    );
    const complete = [...validLearning.values()].some(
      (item) =>
        item.receiptId === receipt.id &&
        committed.get(item.id) !== undefined &&
        time(committed.get(item.id)?.at)! < time(next?.at ?? item.at),
    );
    if (next !== undefined && !complete)
      add(
        findings,
        "NEXT_SEARCH_BEFORE_LEARNING",
        "next search precedes committed learning",
        next.id,
      );
  }
  for (const intent of validIntents)
    if (
      !terminalsByIntent.has(intent.id) &&
      evaluated !== undefined &&
      (evaluated >= time(intent.terminalDueAt)! ||
        evaluated >= (expires ?? Infinity))
    )
      add(
        findings,
        "MISSING_TERMINAL_RECEIPT",
        "expired intent lacks terminal",
        intent.id,
      );
  const promotions = events.filter((event) => event.kind === "PROMOTION");
  for (const verification of events.filter(
    (event) =>
      event.kind === "MODEL_VERIFICATION" ||
      event.kind === "VERIFICATION_ATTEMPT",
  ))
    if (
      !promotions.some(
        (promotion) => time(promotion.at)! < time(verification.at)!,
      )
    )
      add(
        findings,
        "PREMATURE_MODEL_VERIFICATION",
        "model verification may occur only after promotion",
        verification.id,
      );
  const ended =
    input.status === "TERMINATED" ||
    (evaluated !== undefined && evaluated >= (expires ?? Infinity));
  if (ended && !validBlocker && creditableScientificReceipts.size === 0)
    add(findings, "SEARCH_NOT_STARTED", "ended trace lacks receipt");
  if (ended && !validBlocker && creditableScientificCommits.size === 0)
    add(findings, "LEARN_NOT_STARTED", "ended trace lacks committed learning");
  if (
    (input.status === "ACTIVE" || ended) &&
    findings.some((finding) =>
      [
        "FIRST_INTENT_OVERDUE",
        "CONTROL_WIP_EXCEEDED",
        "PROPOSAL_WIP_EXCEEDED",
      ].includes(finding.code),
    ) &&
    !validBlocker
  )
    add(findings, "SECTION_STALLED", "trace is stalled without exact blocker");
  return result(
    events.length,
    intents.length,
    creditableScientificReceipts.size,
    learning.length,
    creditableScientificCommits.size,
    creditableScientificReceipts.size,
    creditableScientificCommits.size,
    instrumentationReceipts.size,
    instrumentationCommits.size,
    validCandidates.length,
    specOk.size,
    nonempty(lease.sectionId) ? lease.sectionId : null,
    nonempty(lease.leaseId) ? lease.leaseId : null,
    [...validReceipts.values()].map((receipt) =>
      String(receipt.artifactSha256),
    ),
  );
}
