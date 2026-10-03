import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { checkProgrammeFlow } from "../programme-flow.ts";

const FlowBaseSchema = z.looseObject({ jobs: z.array(z.looseObject({})) });
const TraceFixtureSchema = z.looseObject({
  events: z.array(z.looseObject({})),
  lease: z.looseObject({}),
});
function fixture(name: string): unknown {
  const text = readFileSync(
    resolve(import.meta.dir, "../fixtures", name),
    "utf8",
  );
  return ((): unknown => JSON.parse(text))();
}
function flow(name: string): ReturnType<typeof checkProgrammeFlow> {
  return checkProgrammeFlow(fixture(name));
}
function flowBase(name: string): z.output<typeof FlowBaseSchema> {
  return FlowBaseSchema.parse(fixture(name));
}
function traceFixture(): z.output<typeof TraceFixtureSchema> {
  return TraceFixtureSchema.parse(
    fixture("valid-intent-receipt-learning.json"),
  );
}
function eventAt(
  trace: z.output<typeof TraceFixtureSchema>,
  index: number,
): Record<string, unknown> {
  const event = trace.events[index];
  if (event === undefined)
    throw new Error(`trace fixture has no event ${index}`);
  return event;
}
describe("programme-flow/v2", () => {
  test("streaming pass dispatches independent section work", () =>
    expect(flow("flow-streaming-pass.json")).toMatchObject({
      ok: true,
      dispatched: ["a"],
    }));
  test("global barrier fails", () => {
    const result = flow("flow-global-barrier.json");
    const codes = result.findings.map((f) => f.code);
    for (const code of ["GLOBAL_BATCH_BARRIER", "READY_WORK_NOT_DISPATCHED"])
      expect(codes).toContain(code);
  });
  test("Supervisor is not hot path", () =>
    expect(
      flow("flow-hot-supervisor.json").findings.map((f) => f.code),
    ).toContain("SUPERVISOR_ON_HOT_PATH"));
  test("verifier is not hot path", () =>
    expect(
      flow("flow-premature-verifier.json").findings.map((f) => f.code),
    ).toContain("VERIFIER_ON_HOT_PATH"));
  test("capacity is filled", () =>
    expect(flow("flow-capacity-fill.json").dispatched).toEqual(["a", "b"]));
  test("an unresolved invalidator dependency holds downstream despite free slots", () => {
    const result = flow("flow-unresolved-dependency.json");
    expect(result.dispatched).toEqual([]);
    expect(
      result.findings.map(({ code, jobId, locator }) => ({
        code,
        jobId,
        locator,
      })),
    ).toContainEqual({
      code: "DEPENDENCY_NOT_READY",
      jobId: "downstream",
      locator: "job:upstream-invalidated",
    });
  });
  test("stale authority revision or fence is rejected deterministically", () => {
    const result = flow("flow-stale-authority.json");
    expect(result.dispatched).toEqual([]);
    expect(
      result.findings.filter((finding) => finding.code === "STALE_WORK_FENCE"),
    ).toHaveLength(2);
  });
  test("full confirmation cannot run without a released receipt", () => {
    const result = flow("flow-sweep-without-release.json");
    expect(result.dispatched).toEqual([]);
    expect(result.findings.map((finding) => finding.code)).toContain(
      "SWEEP_WITHOUT_RELEASE",
    );
  });
  test("an unrelated release cannot authorize an unnamed confirmation", () => {
    const result = flow("flow-unbound-release.json");
    expect(result.dispatched).toEqual([]);
    expect(result.findings.map((finding) => finding.code)).toContain(
      "SWEEP_WITHOUT_RELEASE",
    );
  });
  test("a declared digest cannot authorize confirmation without a validated release", () => {
    const result = flow("flow-unvalidated-release.json");
    expect(result.dispatched).toEqual([]);
    expect(result.findings.map((finding) => finding.code)).toContain(
      "SWEEP_WITHOUT_RELEASE",
    );
  });
  test("a validated scientific PASS receipt and Director release authorize confirmation", () => {
    const base = flowBase("flow-streaming-pass.json");
    const trace = traceFixture();
    const digest = eventAt(trace, 5).artifactSha256;
    eventAt(trace, 7).scaleRelease = "ESCALATED_CONFIRMATION";
    const result = checkProgrammeFlow({
      ...base,
      traces: [trace],
      releasedReceiptDigests: [digest],
      jobs: [
        {
          ...base.jobs[0],
          runScale: "ESCALATED_CONFIRMATION",
          escalationClass: "GPU_PORT",
          releaseReceiptDigest: digest,
        },
      ],
    });
    expect(result).toMatchObject({ ok: true, dispatched: ["a"] });
  });
  test("a Director rejection cannot release confirmation", () => {
    const base = flowBase("flow-streaming-pass.json");
    const trace = traceFixture();
    const digest = eventAt(trace, 5).artifactSha256;
    eventAt(trace, 7).decision = "REJECT";
    eventAt(trace, 7).scaleRelease = "ESCALATED_CONFIRMATION";
    const result = checkProgrammeFlow({
      ...base,
      traces: [trace],
      releasedReceiptDigests: [digest],
      jobs: [
        {
          ...base.jobs[0],
          runScale: "ESCALATED_CONFIRMATION",
          escalationClass: "GPU_PORT",
          releaseReceiptDigest: digest,
        },
      ],
    });
    expect(result.dispatched).toEqual([]);
    expect(result.findings.map((finding) => finding.code)).toContain(
      "SWEEP_WITHOUT_RELEASE",
    );
  });
  test("a queued job cannot certify its own dependency as complete", () => {
    const result = flow("flow-self-dependency.json");
    expect(result.dispatched).toEqual([]);
    expect(
      result.findings.map(({ code, jobId, locator }) => ({
        code,
        jobId,
        locator,
      })),
    ).toContainEqual({
      code: "DEPENDENCY_NOT_READY",
      jobId: "self-dependent",
      locator: "job:self-dependent",
    });
  });
  test("free GPU and high utilization never override scientific admission", () => {
    const result = flow("flow-gpu-admission-hold.json");
    expect(result.dispatched).toEqual([]);
    expect(
      result.findings.map(({ code, locator }) => ({ code, locator })),
    ).toContainEqual({
      code: "DEPENDENCY_NOT_READY",
      locator: "job:scientific-release",
    });
  });
  test("free GPU cannot dispatch work without section scientific admission", () => {
    const result = flow("flow-gpu-missing-admission.json");
    expect(result.dispatched).toEqual([]);
    expect(result.findings.map((finding) => finding.code)).toContain(
      "SCIENTIFIC_ADMISSION_INVALID",
    );
  });
  test("mismatched section grounding cannot dispatch work", () => {
    const result = flow("flow-mismatched-admission.json");
    expect(result.dispatched).toEqual([]);
    expect(result.findings.map((finding) => finding.code)).toContain(
      "SCIENTIFIC_ADMISSION_INVALID",
    );
  });
  test("execution rejects inconsistent run scale and escalation class", () => {
    const base = flowBase("flow-streaming-pass.json");
    const result = checkProgrammeFlow({
      ...base,
      jobs: [{ ...base.jobs[0], escalationClass: "GPU_PORT" }],
    });
    expect(result.dispatched).toEqual([]);
    expect(result.findings.map((finding) => finding.code)).toContain(
      "FLOW_INVALID",
    );
  });
  test("same-section search fanout is blocked by candidate-cycle WIP", () => {
    const result = flow("flow-search-fanout.json");
    expect(result.dispatched).toEqual([]);
    expect(result.findings.map((finding) => finding.code)).toContain(
      "SECTION_WIP_EXCEEDED",
    );
  });
  test("backpressure leaves later stage live", () =>
    expect(flow("flow-backpressure-pass.json")).toMatchObject({
      ok: true,
      dispatched: ["build"],
    }));
  test("learning wakes ahead of execution", () =>
    expect(flow("flow-immediate-learning.json").dispatched).toEqual(["learn"]));
  test("metrics exclude infrastructure checks", () =>
    expect(flow("flow-metric-integrity.json").metrics).toMatchObject({
      infrastructureChecks: 1683,
      searchPerHour: 0,
      learnPerHour: 0,
      candidateInventory: 0,
    }));
  test("scientific counters derive only from valid embedded traces", () => {
    const base = flowBase("flow-metric-integrity.json");
    expect(
      checkProgrammeFlow({
        ...base,
        counts: { searchReceipts: 999, learningCommits: 999 },
      }).metrics,
    ).toMatchObject({ searchReceipts: 0, learningCommits: 0 });
    const trace = traceFixture();
    expect(
      checkProgrammeFlow({ ...base, traces: [trace] }).metrics,
    ).toMatchObject({
      candidateInventory: 1,
      builds: 1,
      searchReceipts: 1,
      learningCommits: 1,
    });
  });
  test("replayed trace or receipt never inflates metrics", () => {
    const base = flowBase("flow-metric-integrity.json");
    const trace = traceFixture();
    const replay = checkProgrammeFlow({
      ...base,
      traces: [trace, structuredClone(trace)],
    });
    expect(replay.findings.map((f) => f.code)).toContain("FLOW_INVALID");
    expect(replay.metrics).toMatchObject({
      candidateInventory: 1,
      builds: 1,
      searchReceipts: 1,
      learningCommits: 1,
    });
    const distinctLease = structuredClone(trace);
    distinctLease.lease.leaseId = "other-lease";
    distinctLease.lease.sectionId = "other-section";
    const sharedReceipt = checkProgrammeFlow({
      ...base,
      traces: [trace, distinctLease],
    });
    expect(sharedReceipt.findings.map((f) => f.code)).toContain("FLOW_INVALID");
    expect(sharedReceipt.metrics.searchReceipts).toBe(1);
  });
  test("wait grammar and finite snapshot values fail closed", () => {
    const base = flowBase("flow-streaming-pass.json");
    expect(
      checkProgrammeFlow({
        ...base,
        jobs: [{ ...base.jobs[0], wait: { reason: "UNKNOWN", locator: "x" } }],
      }).findings.map((f) => f.code),
    ).toContain("FLOW_INVALID");
    expect(
      checkProgrammeFlow({
        ...base,
        jobs: [
          {
            ...base.jobs[0],
            wait: { reason: "NO_COMPATIBLE_CAPACITY", locator: "cpu" },
          },
        ],
      }).findings.map((f) => f.code),
    ).toContain("READY_WORK_NOT_DISPATCHED");
    expect(
      checkProgrammeFlow({
        ...base,
        jobs: [
          {
            ...base.jobs[0],
            wait: { reason: "DEPENDENCY_NOT_READY", locator: "" },
          },
        ],
      }).findings.map((f) => f.code),
    ).toContain("FLOW_INVALID");
    expect(
      checkProgrammeFlow({ ...base, now: Number.NaN }).findings.map(
        (f) => f.code,
      ),
    ).toContain("FLOW_INVALID");
  });
  test("all programme fixtures are loaded", () => {
    const directory = resolve(import.meta.dir, "../fixtures");
    const names = readdirSync(directory).filter(
      (name) => name.startsWith("flow-") && name.endsWith(".json"),
    );
    expect(names).toHaveLength(18);
    for (const name of names)
      expect(flow(name).schema).toBe("programme-flow/v2");
  });
});
