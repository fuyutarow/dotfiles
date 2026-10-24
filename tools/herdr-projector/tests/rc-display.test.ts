import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeCodexRc, projectAgents } from "../src/herdr-projector.ts";

test("only agent panes display compact rc markers and failed reads have diagnostics", async () => {
  for (const vendor of ["btm", "zsh", "claude", "codex"]) {
    for (const [state, marker] of [
      ["rc:on", "🔗"],
      ["rc:off", ""],
      ["read failed", "🔗?"],
    ]) {
      const calls: string[][] = [];
      await projectAgents(
        [{ agent: vendor, pane_id: "pane", tab_id: "tab" }],
        new Map(),
        (args) => {
          calls.push(args);
          return Promise.resolve(true);
        },
        new Map(),
        new Map([["pane", state ?? ""]]),
      );
      const isAgent = vendor === "claude" || vendor === "codex";
      const displayed = isAgent && marker !== "";
      expect(calls[1]?.filter((token) => token.startsWith("rc="))).toEqual(
        displayed ? [`rc=${marker}`] : [],
      );
      expect(calls[1]?.includes("--clear-token")).toBe(!displayed);
      expect(calls[1]).toContain(
        `rc_reason=${isAgent && state === "read failed" ? state : ""}`,
      );
    }
  }
});

test("Codex reads persisted daemon state and prioritizes the running process over settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "projector-daemon-"));
  const env = { CODEX_HOME: root };
  const directory = join(root, "app-server-daemon");
  const settings = join(directory, "settings.json");
  expect(await nativeCodexRc(env)).toBe("daemon settings unreadable");
  await Bun.write(settings, JSON.stringify({ remoteControlEnabled: true }));
  expect(await nativeCodexRc(env)).toBe("rc:on");
  await Bun.write(settings, JSON.stringify({ remoteControlEnabled: false }));
  expect(await nativeCodexRc(env)).toBe("rc:off");
  await Bun.write(
    join(directory, "app-server.pid"),
    JSON.stringify({ pid: 123 }),
  );
  expect(
    await nativeCodexRc(env, (pid) => {
      expect(pid).toBe(123);
      return Promise.resolve("/bin/codex app-server --remote-control");
    }),
  ).toBe("rc:on");
  await Bun.write(settings, JSON.stringify({ remoteControlEnabled: true }));
  expect(
    await nativeCodexRc(env, () => Promise.resolve("/bin/codex app-server")),
  ).toBe("rc:off");
  expect(
    await nativeCodexRc(env, () =>
      Promise.resolve<string | undefined>(undefined),
    ),
  ).toBe("daemon process unreadable");
  expect(
    await nativeCodexRc(env, () =>
      Promise.resolve("unrelated --remote-control"),
    ),
  ).toBe("managed daemon process not observed");
});
