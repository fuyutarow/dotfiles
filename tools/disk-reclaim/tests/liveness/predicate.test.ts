import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempRoot } from "../fixtures/temp.ts";
import {
  readSessions,
  type LivenessFacts,
  type LivenessRef,
  type Probe,
} from "../../src/liveness/facts.ts";
import { judge } from "../../src/liveness/predicate.ts";

const ref: LivenessRef = {
  uid: 1000,
  slug: "fixture-project",
  uuid: "123e4567-e89b-42d3-a456-426614174000",
  dir: "/tmp/claude-1000/fixture-project/123e4567-e89b-42d3-a456-426614174000/scratchpad",
};
const yes = <T>(value: T): Probe<T> => ({ ok: true, value });
const no = (error: string): Probe<never> => ({ ok: false, error });
function facts(overrides: Partial<LivenessFacts> = {}): LivenessFacts {
  return {
    sessions: yes([]),
    procStarttime: () => yes("500"),
    environSessionIds: yes([]),
    openPaths: yes([]),
    transcript: yes({ exists: true, mtimeMs: 1_000 }),
    now: 100_000_000,
    graceHours: 24,
    ...overrides,
  };
}

describe("scratch liveness predicate", () => {
  test("matching registry pid and starttime is live", () => {
    expect(
      judge(
        ref,
        facts({
          sessions: yes([{ sessionId: ref.uuid, pid: 77, procStart: "500" }]),
        }),
      ).verdict,
    ).toBe("live");
  });
  test("pid reuse with a different starttime does not count as live", () => {
    const result = judge(
      ref,
      facts({
        sessions: yes([{ sessionId: ref.uuid, pid: 77, procStart: "500" }]),
        procStarttime: () => yes("501"),
      }),
    );
    expect(result.verdict).toBe("dead");
    expect(result.evidence.join(" ")).toContain("reused");
  });
  test("child environment carrying the parent session uuid is live", () => {
    expect(
      judge(ref, facts({ environSessionIds: yes([ref.uuid]) })).verdict,
    ).toBe("live");
  });
  test("one unreadable same-uid environ scan makes the verdict unknown", () => {
    expect(
      judge(ref, facts({ environSessionIds: no("permission denied") })).verdict,
    ).toBe("unknown");
  });
  test("any malformed sessions registry JSON makes the registry unknown", () => {
    const home = tempRoot("reclaim-session-registry-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const registry = join(home, ".claude/sessions");
    mkdirSync(registry, { recursive: true });
    writeFileSync(join(registry, "broken.json"), "{");
    const registryFacts = facts({ sessions: readSessions(registry) });
    expect(readSessions(registry).ok).toBe(false);
    expect(judge(ref, registryFacts).verdict).toBe("unknown");
  });
  test("a missing sessions registry makes every otherwise-dead candidate unknown", () => {
    const home = tempRoot("reclaim-session-registry-missing-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const registryFacts = facts({
      sessions: readSessions(join(home, ".claude/sessions")),
    });
    expect(judge(ref, registryFacts).verdict).toBe("unknown");
  });
  test("a recent transcript protects a dormant session", () => {
    expect(
      judge(
        ref,
        facts({ transcript: yes({ exists: true, mtimeMs: 99_000_000 }) }),
      ).verdict,
    ).toBe("live");
  });
  test("a missing transcript is unknown", () => {
    expect(
      judge(ref, facts({ transcript: yes({ exists: false }) })).verdict,
    ).toBe("unknown");
  });
  test("an open fd under scratch is live", () => {
    expect(
      judge(ref, facts({ openPaths: yes([`${ref.dir}/data.bin`]) })).verdict,
    ).toBe("live");
  });
  test("unknown facts do not mask an independent positive live signal", () => {
    const verdict = judge(
      ref,
      facts({ environSessionIds: no("unreadable"), openPaths: yes([ref.dir]) }),
    );
    expect(verdict.verdict).toBe("live");
  });
});
