import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeCodexRc, projectAgents } from "../src/herdr-projector.ts";

const notApplicable =
  "not applicable: Windows Desktop owns the native Codex app-server on WSL";

const displayCases = ["btm", "zsh", "claude", "codex"].flatMap((vendor) =>
  [
    { model: "", effort: "" },
    { model: "model", effort: "" },
    { model: "", effort: "high" },
    { model: "model", effort: "high" },
  ].flatMap(({ model, effort }) =>
    ["rc:on", "rc:off", "read failed", notApplicable, undefined].map(
      (state) => ({ vendor, model, effort, state }),
    ),
  ),
);
test.each(displayCases)(
  "rc display %j",
  async ({ vendor, model, effort, state }) => {
    const calls: string[][] = [];
    await projectAgents(
      [
        {
          agent: vendor,
          pane_id: "pane",
          tab_id: "tab",
          agent_session: { value: "session" },
          tokens: { rc: "🔗?" },
        },
      ],
      new Map([
        [
          "session",
          {
            schema: 1,
            vendor: vendor === "codex" ? "codex" : "claude",
            session_id: "session",
            cwd: "/project",
            pane_id: "pane",
            name: "project-agt_test",
            model: model !== "" ? model : { na: true, why: "unavailable" },
            effort: effort !== "" ? effort : { na: true, why: "unavailable" },
            ctx: { na: true, why: "unused" },
            rate: { na: true, why: "unused" },
            updated_at: "2026-10-24T00:00:00Z",
          },
        ],
      ]),
      (args) => {
        calls.push(args);
        return Promise.resolve(true);
      },
      new Map(),
      state === undefined ? new Map() : new Map([["pane", state]]),
    );
    const isAgent = vendor === "claude" || vendor === "codex";
    let marker = "";
    if (isAgent && state === "rc:on") marker = "🔗";
    if (
      isAgent &&
      (state === "read failed" || state === undefined) &&
      (model !== "" || effort !== "")
    )
      marker = "rc?";
    expect(calls[1]?.filter((token) => token.startsWith("rc="))).toEqual(
      marker === "" ? [] : [`rc=${marker}`],
    );
    const args = calls[1] ?? [];
    expect(
      args.some(
        (arg, index) => arg === "--clear-token" && args[index + 1] === "rc",
      ),
    ).toBe(marker === "");
    let reason = "";
    if (isAgent && state !== "rc:on" && state !== "rc:off")
      reason = state ?? "remote-control observation unavailable";
    expect(calls[1]).toContain(`rc_reason=${reason}`);
  },
);

test("Codex applicability uses the same public OS release fact as doctor before reading daemon state", async () => {
  const root = await mkdtemp(join(tmpdir(), "projector-wsl-"));
  const env = { CODEX_HOME: root };
  for (const osRelease of [
    "6.6.87.2-microsoft-standard-WSL2",
    "4.4.0-Microsoft",
  ]) {
    expect(await nativeCodexRc(env, undefined, osRelease)).toBe(notApplicable);
  }
  for (const osRelease of ["6.8.0-generic", "24.6.0"]) {
    expect(await nativeCodexRc(env, undefined, osRelease)).toBe(
      "daemon settings unreadable",
    );
  }
  await Bun.write(
    join(root, "app-server-daemon/app-server.pid"),
    JSON.stringify({ pid: 123 }),
  );
  let reads = 0;
  expect(
    await nativeCodexRc(
      env,
      () => {
        reads++;
        return Promise.resolve("codex app-server --remote-control");
      },
      "6.6.87.2-microsoft-standard-WSL2",
    ),
  ).toBe(notApplicable);
  expect(reads).toBe(0);
});

test("Codex reads persisted daemon state and prioritizes the running process over settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "projector-daemon-"));
  const env = { CODEX_HOME: root };
  const read = (readArgs?: (pid: number) => Promise<string | undefined>) =>
    nativeCodexRc(env, readArgs, "6.8.0-generic");
  const directory = join(root, "app-server-daemon");
  const settings = join(directory, "settings.json");
  expect(await read()).toBe("daemon settings unreadable");
  await Bun.write(settings, JSON.stringify({ remoteControlEnabled: true }));
  expect(await read()).toBe("rc:on");
  await Bun.write(settings, JSON.stringify({ remoteControlEnabled: false }));
  expect(await read()).toBe("rc:off");
  await Bun.write(
    join(directory, "app-server.pid"),
    JSON.stringify({ pid: 123 }),
  );
  expect(
    await read((pid) => {
      expect(pid).toBe(123);
      return Promise.resolve("/bin/codex app-server --remote-control");
    }),
  ).toBe("rc:on");
  await Bun.write(settings, JSON.stringify({ remoteControlEnabled: true }));
  expect(await read(() => Promise.resolve("/bin/codex app-server"))).toBe(
    "rc:off",
  );
  expect(await read(() => Promise.resolve(undefined))).toBe(
    "daemon process unreadable",
  );
  expect(await read(() => Promise.resolve("unrelated --remote-control"))).toBe(
    "managed daemon process not observed",
  );
});
