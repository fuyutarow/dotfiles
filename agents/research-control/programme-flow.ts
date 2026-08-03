import { checkTrace } from "./trace.ts";

export const FLOW_SCHEMA = "programme-flow/v2";
export type FlowFinding = {
  code: string;
  message: string;
  jobId?: string;
  locator?: string;
};
type R = Record<string, unknown>;
type Job = R & {
  id: string;
  sectionId: string;
  stage: string;
  readyAt: number;
  deadline: number;
  resource: string;
  authorityRevision: string | number;
  authorityFence: string;
  dependsOn: string[];
};
type SectionAuthority = {
  sectionId: string;
  goalConstitutionSha256: string;
  groundingSha256: string;
  groundingRevision: string | number;
  groundingFence: string;
};
const stages = [
  "SEARCH",
  "BUILD",
  "EXECUTION",
  "LEARNING",
  "DIRECTOR_COMMIT",
] as const;
const priority = [
  "DIRECTOR_COMMIT",
  "LEARNING",
  "EXECUTION",
  "BUILD",
  "SEARCH",
];
const waits = new Set([
  "NO_COMPATIBLE_CAPACITY",
  "SECTION_WIP_LOCKED",
  "LEASE_OR_AUTHORITY_INVALID",
  "DEPENDENCY_NOT_READY",
  "RESOURCE_SAFETY_HOLD",
]);
const forbidden = new Map([
  ["WAIT_FOR_OTHER_SECTION", "GLOBAL_BATCH_BARRIER"],
  ["WAIT_FOR_WAVE", "GLOBAL_BATCH_BARRIER"],
  ["WAIT_FOR_ALL_DESIGNS", "GLOBAL_BATCH_BARRIER"],
  ["SUPERVISOR_REVIEW", "SUPERVISOR_ON_HOT_PATH"],
  ["MODEL_VERIFICATION", "VERIFIER_ON_HOT_PATH"],
]);
function record(value: unknown): value is R {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function revision(value: unknown): value is string | number {
  return (typeof value === "string" && value !== "") || finite(value);
}
function sha(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
function add(
  findings: FlowFinding[],
  code: string,
  message: string,
  jobId?: string,
  locator?: string,
): void {
  findings.push({
    code,
    message,
    ...(jobId === undefined ? {} : { jobId }),
    ...(locator === undefined ? {} : { locator }),
  });
}
function validJob(value: unknown): value is Job {
  return (
    record(value) &&
    typeof value.id === "string" &&
    value.id !== "" &&
    typeof value.sectionId === "string" &&
    value.sectionId !== "" &&
    typeof value.stage === "string" &&
    stages.includes(value.stage as (typeof stages)[number]) &&
    finite(value.readyAt) &&
    finite(value.deadline) &&
    value.readyAt >= 0 &&
    value.deadline >= value.readyAt &&
    typeof value.resource === "string" &&
    value.resource !== "" &&
    revision(value.authorityRevision) &&
    typeof value.authorityFence === "string" &&
    value.authorityFence !== "" &&
    Array.isArray(value.dependsOn) &&
    value.dependsOn.every(
      (dependency) => typeof dependency === "string" && dependency !== "",
    )
  );
}
function validSectionAuthority(value: unknown): value is SectionAuthority {
  return (
    record(value) &&
    typeof value.sectionId === "string" &&
    value.sectionId !== "" &&
    sha(value.goalConstitutionSha256) &&
    sha(value.groundingSha256) &&
    revision(value.groundingRevision) &&
    typeof value.groundingFence === "string" &&
    value.groundingFence !== ""
  );
}
function releasedScientificPassDigests(trace: unknown): Set<string> {
  if (!record(trace) || !Array.isArray(trace.events)) return new Set();
  const events = trace.events.filter(record);
  const receipts = new Set<string>();
  const learningById = new Map<string, R>();
  for (const event of events) {
    if (
      event.kind === "RECEIPT" &&
      event.measurementValidity === "PASS" &&
      typeof event.artifactSha256 === "string" &&
      event.artifactSha256 !== ""
    )
      receipts.add(event.artifactSha256);
    if (event.kind === "LEARNING" && typeof event.id === "string")
      learningById.set(event.id, event);
  }
  const released = new Set<string>();
  for (const commit of events) {
    const learning =
      typeof commit.learningId === "string"
        ? learningById.get(commit.learningId)
        : undefined;
    const digest = commit.receiptSha256;
    if (
      commit.kind === "DIRECTOR_COMMIT" &&
      commit.decision === "COMMIT" &&
      commit.scaleRelease === "ESCALATED_CONFIRMATION" &&
      typeof digest === "string" &&
      receipts.has(digest) &&
      learning?.learningClass === "SCIENTIFIC" &&
      learning.receiptSha256 === digest &&
      learning.artifactSha256 === commit.learningSha256
    )
      released.add(digest);
  }
  return released;
}
export type FlowResult = {
  ok: boolean;
  schema: typeof FLOW_SCHEMA;
  findings: FlowFinding[];
  dispatched: string[];
  metrics: {
    candidateInventory: number;
    builds: number;
    searchReceipts: number;
    learningCommits: number;
    searchPerHour: number;
    learnPerHour: number;
    learningCompletion: number | null;
    readySlotIdleMs: number;
    candidateComputeUtilization: number;
    infrastructureChecks: number;
  };
};

export function checkProgrammeFlow(input: unknown): FlowResult {
  const findings: FlowFinding[] = [];
  const zero = {
    candidateInventory: 0,
    builds: 0,
    searchReceipts: 0,
    learningCommits: 0,
    searchPerHour: 0,
    learnPerHour: 0,
    learningCompletion: null,
    readySlotIdleMs: 0,
    candidateComputeUtilization: 0,
    infrastructureChecks: 0,
  };
  const finish = (dispatched: string[] = [], metrics = zero): FlowResult => ({
    ok: findings.length === 0,
    schema: FLOW_SCHEMA,
    findings,
    dispatched,
    metrics,
  });
  if (
    !record(input) ||
    input.schema !== FLOW_SCHEMA ||
    !record(input.config) ||
    !Array.isArray(input.jobs) ||
    !Array.isArray(input.slots) ||
    !Array.isArray(input.traces) ||
    !revision(input.currentAuthorityRevision) ||
    typeof input.currentAuthorityFence !== "string" ||
    input.currentAuthorityFence === "" ||
    !Array.isArray(input.completedJobIds) ||
    !input.completedJobIds.every((id) => typeof id === "string" && id !== "") ||
    !Array.isArray(input.releasedReceiptDigests) ||
    !input.releasedReceiptDigests.every(
      (digest) => typeof digest === "string" && digest !== "",
    ) ||
    !Array.isArray(input.sectionAuthorities) ||
    !finite(input.now) ||
    input.now < 0 ||
    !finite(input.elapsedMs) ||
    input.elapsedMs <= 0
  ) {
    add(
      findings,
      "FLOW_INVALID",
      "v2 flow requires authority, completion, release, time, jobs, slots, and traces",
    );
    return finish();
  }
  if (
    !finite(input.config.schedulerTickMs) ||
    input.config.schedulerTickMs < 100 ||
    input.config.schedulerTickMs > 5000
  )
    add(findings, "FLOW_INVALID", "schedulerTickMs must be 100..5000");
  const jobs = input.jobs.filter(validJob);
  if (jobs.length !== input.jobs.length)
    add(findings, "FLOW_INVALID", "job fields must be finite and valid");
  const jobIds = new Set<string>();
  for (const item of jobs) {
    if (jobIds.has(item.id))
      add(findings, "FLOW_INVALID", "duplicate job id", item.id);
    jobIds.add(item.id);
  }
  if (new Set(input.completedJobIds).size !== input.completedJobIds.length)
    add(findings, "FLOW_INVALID", "completed job ids must be unique");
  if (
    new Set(input.releasedReceiptDigests).size !==
    input.releasedReceiptDigests.length
  )
    add(findings, "FLOW_INVALID", "released receipt digests must be unique");
  const completedJobIds = new Set(input.completedJobIds);
  const releasedReceiptDigests = new Set(input.releasedReceiptDigests);
  const sectionAuthorities = input.sectionAuthorities.filter(
    validSectionAuthority,
  );
  if (sectionAuthorities.length !== input.sectionAuthorities.length)
    add(findings, "FLOW_INVALID", "section authorities must be valid");
  const sectionAuthorityById = new Map<string, SectionAuthority>();
  const ambiguousSections = new Set<string>();
  for (const authority of sectionAuthorities) {
    if (sectionAuthorityById.has(authority.sectionId)) {
      ambiguousSections.add(authority.sectionId);
      add(
        findings,
        "FLOW_INVALID",
        "section authority must be unique",
        authority.sectionId,
      );
    }
    sectionAuthorityById.set(authority.sectionId, authority);
  }
  const free = new Map<string, number>();
  const slotIds = new Set<string>();
  for (const slot of input.slots) {
    if (
      !record(slot) ||
      typeof slot.id !== "string" ||
      slot.id === "" ||
      typeof slot.resource !== "string" ||
      slot.resource === "" ||
      typeof slot.free !== "boolean" ||
      slotIds.has(slot.id)
    ) {
      add(
        findings,
        "FLOW_INVALID",
        "slot needs unique id, resource, and free boolean",
      );
      continue;
    }
    slotIds.add(slot.id);
    if (slot.free) free.set(slot.resource, (free.get(slot.resource) ?? 0) + 1);
  }
  const traceMetrics = {
    candidateInventory: 0,
    builds: 0,
    searchReceipts: 0,
    learningCommits: 0,
  };
  const traceIdentities = new Set<string>();
  const receiptDigests = new Set<string>();
  const releasedScientificReceipts = new Set<string>();
  for (const trace of input.traces) {
    const checked = checkTrace(trace);
    if (!checked.ok) {
      add(findings, "FLOW_INVALID", "embedded section trace is invalid");
      continue;
    }
    const identity = `${checked.summary.sectionId ?? ""}:${checked.summary.leaseId ?? ""}`;
    if (
      checked.summary.sectionId === null ||
      checked.summary.leaseId === null ||
      traceIdentities.has(identity) ||
      checked.summary.receiptDigests.some((digest) =>
        receiptDigests.has(digest),
      )
    ) {
      add(
        findings,
        "FLOW_INVALID",
        "replayed section lease or terminal receipt digest",
      );
      continue;
    }
    traceIdentities.add(identity);
    for (const digest of checked.summary.receiptDigests)
      receiptDigests.add(digest);
    for (const digest of releasedScientificPassDigests(trace))
      releasedScientificReceipts.add(digest);
    traceMetrics.candidateInventory += checked.summary.candidates;
    traceMetrics.builds += checked.summary.executableSpecs;
    traceMetrics.searchReceipts += checked.summary.receipts;
    traceMetrics.learningCommits += checked.summary.commits;
  }
  if (
    record(input.counts) &&
    ["candidateInventory", "builds", "searchReceipts", "learningCommits"].some(
      (key) => key in input.counts,
    )
  )
    add(
      findings,
      "FLOW_INVALID",
      "scientific counters are derived from embedded traces",
    );
  if (traceMetrics.learningCommits > traceMetrics.searchReceipts)
    add(findings, "FLOW_INVALID", "derived commits exceed receipts");
  const counts = record(input.counts) ? input.counts : {};
  const infrastructureChecks =
    finite(counts.infrastructureChecks) && counts.infrastructureChecks >= 0
      ? counts.infrastructureChecks
      : 0;
  const idle =
    finite(counts.readySlotIdleMs) && counts.readySlotIdleMs >= 0
      ? counts.readySlotIdleMs
      : 0;
  const utilization =
    finite(counts.candidateComputeUtilization) &&
    counts.candidateComputeUtilization >= 0 &&
    counts.candidateComputeUtilization <= 1
      ? counts.candidateComputeUtilization
      : 0;
  if (
    ("infrastructureChecks" in counts &&
      infrastructureChecks !== counts.infrastructureChecks) ||
    ("readySlotIdleMs" in counts && idle !== counts.readySlotIdleMs) ||
    ("candidateComputeUtilization" in counts &&
      utilization !== counts.candidateComputeUtilization)
  )
    add(
      findings,
      "FLOW_INVALID",
      "non-scientific metrics must be finite and in range",
    );
  const active = new Map<string, number>();
  for (const item of jobs)
    active.set(item.sectionId, (active.get(item.sectionId) ?? 0) + 1);
  const wipExceeded = new Set<string>();
  for (const [section, count] of active)
    if (count > 1) {
      wipExceeded.add(section);
      add(
        findings,
        "SECTION_WIP_EXCEEDED",
        "more than one in-flight candidate",
        section,
      );
    }
  const ready: Job[] = [];
  for (const item of jobs) {
    if (wipExceeded.has(item.sectionId)) continue;
    const sectionAuthority = sectionAuthorityById.get(item.sectionId);
    const authorization = item.semanticAuthorization;
    const requiredKind =
      item.stage === "SEARCH" ? "GROUNDED_SEARCH" : "SECTION_ADMISSION";
    const validValueClass =
      item.stage === "SEARCH"
        ? authorization !== undefined &&
          record(authorization) &&
          authorization.valueClass === "SEARCH"
        : authorization !== undefined &&
          record(authorization) &&
          [
            "UPSTREAM_KILL",
            "MINIMAL_DISCRIMINATOR",
            "REPLICATION",
            "CONFIRMATION",
          ].includes(String(authorization.valueClass));
    if (
      item.authorityRevision !== input.currentAuthorityRevision ||
      item.authorityFence !== input.currentAuthorityFence
    ) {
      add(
        findings,
        "STALE_WORK_FENCE",
        "job authority revision or fence is stale",
        item.id,
      );
      continue;
    }
    const unresolvedDependency = item.dependsOn.find(
      (dependency) =>
        dependency === item.id ||
        jobIds.has(dependency) ||
        !completedJobIds.has(dependency),
    );
    if (unresolvedDependency !== undefined) {
      const locator = `job:${unresolvedDependency}`;
      if (
        !record(item.wait) ||
        item.wait.reason !== "DEPENDENCY_NOT_READY" ||
        item.wait.locator !== locator
      )
        add(
          findings,
          "DEPENDENCY_NOT_READY",
          "dependency is not complete",
          item.id,
          locator,
        );
      continue;
    }
    if (
      item.stage === "EXECUTION" &&
      item.runScale !== "MINIMAL_DISCRIMINATOR" &&
      item.runScale !== "ESCALATED_CONFIRMATION"
    ) {
      add(
        findings,
        "FLOW_INVALID",
        "execution requires a declared run scale",
        item.id,
      );
      continue;
    }
    if (
      item.stage === "EXECUTION" &&
      ((item.runScale === "MINIMAL_DISCRIMINATOR" &&
        item.escalationClass !== "NONE") ||
        (item.runScale === "ESCALATED_CONFIRMATION" &&
          !["SCALE", "FULL_SWEEP", "GPU_PORT"].includes(
            String(item.escalationClass),
          )))
    ) {
      add(
        findings,
        "FLOW_INVALID",
        "execution run scale and escalation class are inconsistent",
        item.id,
      );
      continue;
    }
    if (
      item.stage === "EXECUTION" &&
      item.runScale === "ESCALATED_CONFIRMATION"
    ) {
      if (
        typeof item.releaseReceiptDigest !== "string" ||
        item.releaseReceiptDigest === "" ||
        !releasedReceiptDigests.has(item.releaseReceiptDigest) ||
        !releasedScientificReceipts.has(item.releaseReceiptDigest)
      ) {
        add(
          findings,
          "SWEEP_WITHOUT_RELEASE",
          "escalated confirmation requires a released prior receipt digest",
          item.id,
        );
        continue;
      }
    }
    if (
      ambiguousSections.has(item.sectionId) ||
      sectionAuthority === undefined ||
      !record(authorization) ||
      authorization.kind !== requiredKind ||
      typeof authorization.locator !== "string" ||
      authorization.locator === "" ||
      !sha(authorization.sha256) ||
      authorization.goalConstitutionSha256 !==
        sectionAuthority.goalConstitutionSha256 ||
      authorization.groundingSha256 !== sectionAuthority.groundingSha256 ||
      authorization.groundingRevision !== sectionAuthority.groundingRevision ||
      authorization.groundingFence !== sectionAuthority.groundingFence ||
      !validValueClass
    ) {
      add(
        findings,
        "SCIENTIFIC_ADMISSION_INVALID",
        "job semantic authorization does not exact-join its current section authority",
        item.id,
      );
      continue;
    }
    if ("waitReason" in item) {
      add(findings, "FLOW_INVALID", "bare waitReason is forbidden", item.id);
      continue;
    }
    const wait = item.wait;
    const capacity = free.get(item.resource) ?? 0;
    if (wait !== undefined) {
      if (
        !record(wait) ||
        typeof wait.reason !== "string" ||
        typeof wait.locator !== "string" ||
        wait.locator.trim() === ""
      ) {
        add(
          findings,
          "FLOW_INVALID",
          "wait requires reason and nonempty blocker locator",
          item.id,
        );
        continue;
      }
      const reason = wait.reason;
      const forbiddenCode = forbidden.get(reason);
      if (forbiddenCode !== undefined) {
        add(findings, forbiddenCode, `forbidden wait ${reason}`, item.id);
        if (item.readyAt <= input.now && capacity > 0)
          add(
            findings,
            "READY_WORK_NOT_DISPATCHED",
            "ready compatible work was blocked",
            item.id,
          );
        continue;
      }
      if (!waits.has(reason)) {
        add(findings, "FLOW_INVALID", "unknown wait reason", item.id);
        continue;
      }
      if (
        reason === "NO_COMPATIBLE_CAPACITY" &&
        (wait.locator !== item.resource || capacity > 0)
      ) {
        add(
          findings,
          "READY_WORK_NOT_DISPATCHED",
          "claimed no capacity despite matching free slot",
          item.id,
        );
        ready.push(item);
      }
      continue;
    }
    if (item.readyAt <= input.now && capacity > 0) ready.push(item);
  }
  ready.sort(
    (a, b) =>
      priority.indexOf(a.stage) - priority.indexOf(b.stage) ||
      a.deadline - b.deadline ||
      a.readyAt - b.readyAt,
  );
  const dispatched: string[] = [];
  for (const item of ready) {
    const capacity = free.get(item.resource) ?? 0;
    if (capacity > 0) {
      dispatched.push(item.id);
      free.set(item.resource, capacity - 1);
    }
  }
  const hours = input.elapsedMs / 3_600_000;
  const metrics = {
    ...traceMetrics,
    searchPerHour: traceMetrics.searchReceipts / hours,
    learnPerHour: traceMetrics.learningCommits / hours,
    learningCompletion:
      traceMetrics.searchReceipts === 0
        ? null
        : traceMetrics.learningCommits / traceMetrics.searchReceipts,
    readySlotIdleMs: idle,
    candidateComputeUtilization: utilization,
    infrastructureChecks,
  };
  return finish(dispatched, metrics);
}
