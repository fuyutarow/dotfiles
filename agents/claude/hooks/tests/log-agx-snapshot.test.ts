import { describe, expect, test } from "bun:test";
import { mkdir, utimes } from "node:fs/promises";
import { join } from "node:path";
import { z } from "../../../hooks/zod.ts";
import { parseJson } from "../../../hooks/narrow.ts";
import { runHook, tempHome } from "./helpers.ts";
import { decoded } from "../../../hooks/tests/decode.ts";
import { fleetSessionFixture } from "./fleet-session-fixture.ts";

const HOOK = "log-agx-snapshot.ts";
const Message = z.object({ systemMessage: z.string() });
const row = (
  id: string,
  session = "s1",
  vendor: string | null = "thread-1",
) => ({
  id,
  ticket: "/t/worker.md",
  row: "terra-high",
  state: "running",
  dispatcher_session: session,
  vendor_session: vendor,
});

async function fixture(rows: unknown[] = [], legacy = false) {
  const home = tempHome();
  const state = join(home, ".local/state/agx-next");
  await mkdir(state, { recursive: true });
  const path = join(state, "current-runs.json");
  await Bun.write(
    path,
    JSON.stringify({
      output: JSON.stringify(legacy ? rows : { runs: rows, summary: {} }),
      capturedAt: 1, // owner publications do not expire merely with wall-clock age
      exit: 0,
    }),
  );
  return { home, state, path };
}

function fire(
  f: { home: string },
  event = "Stop",
  payload?: unknown,
  extra: Record<string, string> = {},
) {
  return runHook(
    HOOK,
    {
      hook_event_name: event,
      ...decoded(
        z.record(z.string(), z.unknown()),
        payload ?? { session_id: "s1" },
      ),
    },
    {
      HOME: f.home,
      AGX_NEXT_STATE_DIR: "",
      AGX_STATE_DIR: "",
      CLAUDE_CODE_SESSION_ID: "",
      CODEX_THREAD_ID: "",
      CODEX_SESSION_ID: "",
      XDG_RUNTIME_DIR: join(f.home, "runtime"),
      PATH: "/nonexistent",
      ...extra,
    },
  );
}

function message(result: ReturnType<typeof fire>, session = "s1") {
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout.trim().split("\n")).toHaveLength(1);
  const msg = decoded(Message, parseJson(result.stdout)).systemMessage;
  expect(msg).toStartWith("[dotfiles:agx:snapshot] ");
  expect(msg).toContain(`session=${session}`);
  expect(msg).not.toContain("\n");
  return msg;
}

describe("log-agx-snapshot", () => {
  test("Stop includes this session's context and rates from the fleet handoff", async () => {
    const f = await fixture();
    await fleetSessionFixture(f.home);
    const msg = message(fire(f));
    expect(msg).toContain("Ctx: 120k 60%");
    expect(msg).toContain("Rate: 5h 40% · 7d 60%");
    expect(msg).toContain("0 running");
    expect(msg).not.toContain("input has no");
  });

  test("another fleet session's context and rates are excluded", async () => {
    const f = await fixture();
    await fleetSessionFixture(f.home, "other");
    const msg = message(fire(f));
    expect(msg).not.toContain("Ctx:");
    expect(msg).not.toContain("Rate:");
  });

  test("malformed or mismatched handoffs preserve the run snapshot", async () => {
    const f = await fixture();
    const { session, path } = await fleetSessionFixture(f.home);
    for (const text of [
      "{bad",
      "null",
      JSON.stringify({ ...session, session_id: "other" }),
    ]) {
      await Bun.write(path, text);
      const msg = message(fire(f));
      expect(msg).toContain("0 running");
      expect(msg).not.toContain("Ctx:");
    }
  });
  test("Stop lists only this session's runs with run prefixes and vendor session/thread ids", async () => {
    const f = await fixture([
      row("abcdef12-aaaa", "s1", "claude-worker-session"),
      row("12345678-bbbb", "s1", "codex-worker-thread"),
      row("other-id", "other"),
    ]);
    const msg = message(fire(f));
    expect(msg).toContain("2 running");
    expect(msg).toContain("abcdef12");
    expect(msg).toContain("12345678");
    expect(msg).toContain("vendor_session=claude-worker-session");
    expect(msg).toContain("vendor_session=codex-worker-thread");
    expect(msg).not.toContain("other-id");
    message(fire(f)); // every Stop, including immediately repeated Stops
  });

  test("zero runs, foreign runs and unattributed runs still print 0 running", async () => {
    for (const rows of [
      [],
      [row("foreign", "other")],
      [{ ...row("none"), dispatcher_session: null }],
    ]) {
      expect(message(fire(await fixture(rows)))).toContain("0 running");
    }
  });

  test("legacy owner array is supported and missing vendor identity is explicit", async () => {
    const msg = message(
      fire(await fixture([row("abcdefgh-run", "s1", null)], true)),
    );
    expect(msg).toContain("abcdefgh");
    expect(msg).toContain("vendor_session=n/a (not recorded)");
  });

  test("unreadable state prints n/a with its read failure reason", async () => {
    const f = await fixture();
    const msg = message(
      fire(
        f,
        "Stop",
        { session_id: "s1" },
        { AGX_NEXT_STATE_DIR: join(f.home, "missing") },
      ),
    );
    expect(msg).toContain("n/a (");
    expect(msg).toContain("ENOENT");
  });

  test("invalid JSON, invalid envelope and invalid listing print n/a with reason", async () => {
    for (const data of [
      "{nope",
      "null",
      JSON.stringify({ output: "{}", capturedAt: 1, exit: 0 }),
    ]) {
      const f = await fixture();
      await Bun.write(f.path, data);
      expect(message(fire(f))).toContain("n/a (invalid current-runs.json)");
    }
  });

  test("state publication older than records is reported as unavailable", async () => {
    const f = await fixture([row("abcdef12-run")]);
    await utimes(f.path, 1, 1);
    await Bun.write(join(f.state, "records.jsonl"), "new record\n");
    expect(message(fire(f))).toContain(
      "n/a (current-runs.json predates records.jsonl)",
    );
  });

  test("Stop survives an unwritable cadence cache", async () => {
    const f = await fixture();
    await Bun.write(join(f.home, ".cache"), "not a directory");
    expect(message(fire(f))).toContain("0 running");
  });

  test("PostToolUse is throttled but Stop is never throttled", async () => {
    const f = await fixture();
    message(fire(f, "PostToolUse"));
    expect(fire(f, "PostToolUse").stdout).toBe("");
    message(fire(f));
    message(fire(f));
  });

  test("Codex thread and environment fallback identities are printed", async () => {
    const f = await fixture();
    message(fire(f, "Stop", { thread_id: "codex-thread" }), "codex-thread");
    message(
      fire(f, "Stop", {}, { CODEX_SESSION_ID: "codex-env" }),
      "codex-env",
    );
    message(
      fire(f, "Stop", {}, { CLAUDE_CODE_SESSION_ID: "claude-env" }),
      "claude-env",
    );
    expect(message(fire(f, "Stop", {}), "n/a (not supplied)")).toContain(
      "n/a (session id not supplied)",
    );
  });

  test("agx state overrides win over HOME and obsolete runtime cache", async () => {
    const f = await fixture([row("default-run")]);
    const override = await fixture([row("override-run")]);
    const msg = message(
      fire(
        f,
        "Stop",
        { session_id: "s1" },
        { AGX_NEXT_STATE_DIR: override.state, AGX_STATE_DIR: f.state },
      ),
    );
    expect(msg).toContain("override");
    expect(msg).not.toContain("default");
    expect(
      message(
        fire(
          f,
          "Stop",
          { session_id: "s1" },
          { AGX_STATE_DIR: override.state },
        ),
      ),
    ).toContain("override");
  });

  test("other events stay silent", async () => {
    const result = fire(await fixture(), "UserPromptSubmit");
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });
});
