import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "../../../hooks/zod.ts";
import { parseJson } from "../../../hooks/narrow.ts";
import { runHook, tempHome } from "./helpers.ts";
import { decoded } from "../../../hooks/tests/decode.ts";

const HOOK = "log-agx-snapshot.ts";
const Message = z.looseObject({ systemMessage: z.string() });
const messageOf = (stdout: string): string =>
  decoded(Message, parseJson(stdout)).systemMessage.replace(
    /^\[dotfiles:agx:snapshot\] /u,
    "",
  );

const minutesAgo = (m: number): string =>
  Temporal.Instant.fromEpochMilliseconds(
    Temporal.Now.instant().epochMilliseconds - m * 60_000,
  ).toString();

function run(
  id: string,
  ticket: string,
  session: string | null,
  state: "running" | "ended" | "orphaned",
  judged = false,
  startedMinutesAgo = 4,
) {
  return {
    id,
    ticket,
    row: "luna-high",
    state,
    started_at: minutesAgo(startedMinutesAgo),
    ended_at: state === "running" ? null : minutesAgo(1),
    dispatcher_session: session,
    judgment: judged ? { decision: "accept", note: "" } : null,
  };
}

// A HOME whose XDG_RUNTIME_DIR holds the statusline's agx snapshot (the file the hook reads).
function homeWithSnapshot(rows: unknown[], ageMs = 1_000) {
  const home = tempHome();
  const runtime = join(home, "run");
  mkdirSync(join(runtime, "statusline"), { recursive: true });
  writeFileSync(
    join(runtime, "statusline", "agx-runs.json"),
    JSON.stringify({
      output: JSON.stringify(rows),
      capturedAt: Temporal.Now.instant().epochMilliseconds - ageMs,
      exit: 0,
    }),
  );
  return { home, runtime };
}

const fire = (
  env: { home: string; runtime: string },
  event: string,
  sid = "s1",
) =>
  runHook(
    HOOK,
    { hook_event_name: event, session_id: sid },
    {
      HOME: env.home,
      XDG_RUNTIME_DIR: env.runtime,
      PATH: "/nonexistent", // the hook must not need agx (or anything) on PATH
    },
  );

const fleet = [
  run("a", "/t/herdr-btm.md", "s1", "running", false, 4),
  run("b", "/t/statusline-design.md", "s1", "running", false, 12),
  run("c", "/t/done1.md", "s1", "ended"),
  run("d", "/t/done2.md", "s1", "ended"),
  run("e", "/t/done3.md", "s1", "ended", true),
  run("f", "/t/lost.md", "s1", "orphaned"),
  run("g", "/t/other.md", "other", "running"),
];

describe("log-agx-snapshot", () => {
  test("Stop emits one line: counts, then one entry per running run of this session", () => {
    const r = fire(homeWithSnapshot(fleet), "Stop");
    expect(r.code).toBe(0);
    const msg = messageOf(r.stdout);
    expect(msg).not.toContain("\n");
    expect(msg).toBe(
      "Agx: 2 running · 2 ended-unjudged · orphaned 1 | herdr-btm luna-high 4m working · statusline-design luna-high 12m working",
    );
  });

  test("another session's runs only: no output, exit 0", () => {
    const r = fire(
      homeWithSnapshot([run("g", "/t/other.md", "other", "running")]),
      "Stop",
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("a run with no dispatcher session is never this session's", () => {
    const r = fire(
      homeWithSnapshot([run("n", "/t/n.md", null, "running")]),
      "Stop",
    );
    expect(r.stdout.trim()).toBe("");
  });

  test("a second PostToolUse within 60 s emits nothing", () => {
    const env = homeWithSnapshot(fleet);
    expect(fire(env, "PostToolUse").stdout).toContain("Agx:");
    const r = fire(env, "PostToolUse");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
    expect(fire(env, "Stop").stdout).toContain("Agx:"); // Stop is never throttled
  });

  test("a stale snapshot emits nothing", () => {
    const r = fire(homeWithSnapshot(fleet, 10 * 60_000), "Stop");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("a missing snapshot is fail-open: exit 0, no output", () => {
    const home = tempHome();
    const r = fire({ home, runtime: join(home, "run") }, "Stop");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("a garbled snapshot is fail-open", () => {
    const env = homeWithSnapshot([]);
    writeFileSync(join(env.runtime, "statusline", "agx-runs.json"), "{nope");
    const r = fire(env, "Stop");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("only judged ended runs: nothing to report", () => {
    const r = fire(
      homeWithSnapshot([run("e", "/t/e.md", "s1", "ended", true)]),
      "Stop",
    );
    expect(r.stdout.trim()).toBe("");
  });

  test("ended-unjudged alone gives counts without entries", () => {
    const r = fire(
      homeWithSnapshot([run("c", "/t/c.md", "s1", "ended")]),
      "Stop",
    );
    expect(messageOf(r.stdout)).toBe("Agx: 1 ended-unjudged");
  });

  test("other events are ignored", () => {
    const r = fire(homeWithSnapshot(fleet), "UserPromptSubmit");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });
});
