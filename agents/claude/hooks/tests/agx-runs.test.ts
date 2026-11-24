import { describe, expect, test } from "bun:test";
import { chmod, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "@dotfiles/hooks/zod.ts";
import { parseJson } from "@dotfiles/hooks/narrow.ts";
import { runHook, tempHome } from "#hooks/tests/helpers.ts";
import { decoded } from "@dotfiles/hooks/tests/decode.ts";

// The Agx segment of log-sys-snapshot.ts (agx-runs.ts): this session's runs from `agx status --json`.
const HOOK = "log-sys-snapshot.ts";
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

async function fixture(rows: unknown[] = []) {
  const home = tempHome();
  const bin = join(home, "bin");
  await mkdir(bin);
  const path = join(home, "status.json");
  const calls = join(home, "calls.jsonl");
  await Bun.write(
    path,
    JSON.stringify({
      schema: 1,
      runs: {
        source: "current",
        captured_at: 1,
        age_s: 0,
        reason: null,
        rows,
        summary: null,
      },
      workspaces: null,
      findings: null,
      judgments: { by_session: {}, repository: 0, land: 0, why: null },
    }),
  );
  await mkdir(join(home, ".cache", "claude"), { recursive: true });
  await Bun.write(
    join(home, ".cache", "claude", "statusline-sys.json"),
    JSON.stringify({
      at: Temporal.Now.instant().epochMilliseconds,
      line: "Sys: CPU 1%",
    }),
  );
  const agx = join(bin, "agx");
  await Bun.write(
    agx,
    `#!${process.execPath}
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)) + "\\n");
if (process.env.FAKE_AGX_MODE === "timeout") {
  process.on("SIGTERM", () => {});
  await Bun.sleep(10000);
}
if (process.env.FAKE_AGX_MODE === "failure") {
  process.stderr.write("status unavailable\\ntry later\\n");
  process.exit(7);
}
process.stdout.write(await Bun.file(${JSON.stringify(path)}).text());
`,
  );
  await chmod(agx, 0o755);
  return { home, path, calls };
}

// Each fire starts a fresh cadence window unless `keep` says otherwise.
async function fire(
  f: { home: string },
  event = "Stop",
  payload?: unknown,
  extra: Record<string, string> = {},
  keep = false,
) {
  if (!keep)
    await rm(join(f.home, ".cache", "claude", "sys-log"), {
      recursive: true,
      force: true,
    });
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
      AGX_STATE_DIR: "",
      CLAUDE_CODE_SESSION_ID: "",
      CODEX_THREAD_ID: "",
      CODEX_SESSION_ID: "",
      XDG_RUNTIME_DIR: join(f.home, "runtime"),
      PATH: join(f.home, "bin"),
      ...extra,
    },
  );
}

async function message(pending: ReturnType<typeof fire>) {
  const result = await pending;
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout.trim().split("\n")).toHaveLength(1);
  const msg = decoded(Message, parseJson(result.stdout)).systemMessage;
  expect(msg).toContain("Agx: ");
  expect(msg).not.toContain("\n");
  return msg.slice(msg.indexOf("Agx: "));
}

describe("log-sys-snapshot Agx segment", () => {
  test("Stop lists only this session's runs with run prefixes and vendor session/thread ids", async () => {
    const f = await fixture([
      row("abcdef12-aaaa", "s1", "claude-worker-session"),
      row("12345678-bbbb", "s1", "codex-worker-thread"),
      row("other-id", "other"),
    ]);
    const msg = await message(fire(f));
    expect(msg).toContain("2 running");
    expect(msg).toContain("abcdef12");
    expect(msg).toContain("12345678");
    expect(msg).toContain("vendor_session=claude-worker-session");
    expect(msg).toContain("vendor_session=codex-worker-thread");
    expect(msg).not.toContain("other-id");
  });

  test("zero runs, foreign runs and unattributed runs still print 0 running", async () => {
    for (const rows of [
      [],
      [row("foreign", "other")],
      [{ ...row("none"), dispatcher_session: null }],
    ]) {
      expect(await message(fire(await fixture(rows)))).toContain("0 running");
    }
  });

  test("missing vendor identity is explicit", async () => {
    const msg = await message(
      fire(await fixture([row("abcdefgh-run", "s1", null)])),
    );
    expect(msg).toContain("abcdefgh");
    expect(msg).toContain("vendor_session=n/a (not recorded)");
  });

  test("non-zero CLI exit prints n/a with its failure reason", async () => {
    const f = await fixture();
    const msg = await message(
      fire(f, "Stop", { session_id: "s1" }, { FAKE_AGX_MODE: "failure" }),
    );
    expect(msg).toContain("n/a (");
    expect(msg).toContain("agx status exited 7: status unavailable try later");
  });

  test("invalid JSON, invalid envelope and invalid listing print n/a with reason", async () => {
    for (const data of [
      "{nope",
      "null",
      JSON.stringify({
        schema: 1,
        runs: { source: "current", reason: null, rows: [{}] },
      }),
    ]) {
      const f = await fixture();
      await Bun.write(f.path, data);
      expect(await message(fire(f))).toContain("n/a (invalid agx status JSON)");
    }
  });

  test("stale and unknown CLI snapshots are reported as unavailable", async () => {
    for (const source of ["stale", "unknown"]) {
      const f = await fixture();
      await Bun.write(
        f.path,
        JSON.stringify({
          schema: 1,
          runs: {
            source,
            reason: source === "unknown" ? "snapshot unavailable" : null,
            rows: source === "unknown" ? null : [row("hidden-run")],
          },
        }),
      );
      const msg = await message(fire(f));
      expect(msg).toContain(
        source === "unknown"
          ? "n/a (snapshot unavailable)"
          : "n/a (agx status runs stale)",
      );
      expect(msg).not.toContain("hidden");
    }
  });

  test("a hung CLI is killed within the hook's short timeout and fails open", async () => {
    const f = await fixture();
    const start = performance.now();
    const msg = await message(
      fire(f, "Stop", undefined, { FAKE_AGX_MODE: "timeout" }),
    );
    const elapsed = performance.now() - start;
    expect(msg).toContain("n/a (");
    expect(msg.toLowerCase()).toContain("timed out");
    expect(elapsed).toBeGreaterThanOrEqual(450);
    expect(elapsed).toBeLessThan(2000);
    process.stdout.write(
      `fake agx timeout hook latency: ${elapsed.toFixed(1)} ms\n`,
    );
  });

  test("missing agx fails open", async () => {
    expect(
      await message(
        fire(await fixture(), "Stop", undefined, { PATH: "/nonexistent" }),
      ),
    ).toContain("n/a (agx not found on PATH)");
  });

  test("Stop and PostToolUse share one per-session cadence", async () => {
    const f = await fixture();
    await message(fire(f, "PostToolUse"));
    expect((await fire(f, "Stop", undefined, {}, true)).stdout).toBe("");
    expect((await fire(f, "PostToolUse", undefined, {}, true)).stdout).toBe("");
    await message(fire(f));
  });
  test("one CLI call receives the payload cwd as one argument, with process cwd fallback", async () => {
    const f = await fixture([row("cli-run")]);
    const start = performance.now();
    expect(
      await message(
        fire(
          f,
          "Stop",
          { session_id: "s1", cwd: "/repo with spaces" },
          {
            AGX_STATE_DIR: join(f.home, "missing-state"),
          },
        ),
      ),
    ).toContain("cli-run");
    const elapsed = performance.now() - start;
    expect(await Bun.file(f.calls).text()).toBe(
      `${JSON.stringify(["status", "--json", "--cwd", "/repo with spaces"])}\n`,
    );
    await message(fire(f));
    const calls = (await Bun.file(f.calls).text()).trim().split("\n");
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe(
      JSON.stringify(["status", "--json", "--cwd", process.cwd()]),
    );
    process.stdout.write(
      `fake agx success hook latency: ${elapsed.toFixed(1)} ms\n`,
    );
  });

  test("ended-unjudged and orphaned counts remain session-scoped", async () => {
    const f = await fixture([
      { ...row("ended"), state: "ended", judgment: null },
      { ...row("judged"), state: "ended", judgment: { decision: "accept" } },
      { ...row("orphan"), state: "orphaned" },
      { ...row("foreign", "other"), state: "ended" },
    ]);
    const msg = await message(fire(f));
    expect(msg).toContain("0 running · 1 ended-unjudged · orphaned 1");
  });

  test("other events stay silent", async () => {
    const result = await fire(await fixture(), "UserPromptSubmit");
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });
});
