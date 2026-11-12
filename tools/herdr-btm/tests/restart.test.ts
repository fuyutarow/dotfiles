import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";

const entry = resolve(import.meta.dir, "../src/btmp.ts");
const configPath = resolve(import.meta.dir, "../../../herdr/config.toml");
const Tabs = jsonOf(
  z.object({
    result: z.object({
      tabs: z.array(z.object({ tab_id: z.string(), label: z.string() })),
    }),
  }),
);
const Agents = jsonOf(
  z.object({
    result: z.object({
      agents: z.array(z.object({ agent: z.string(), tab_id: z.string() })),
    }),
  }),
);

// Shapes copied from real saved sessions (herdr 0.9.5, version 3). A pane saved
// from the btm tab carries agent_resume argv ["btmp"] (typed back into a shell on
// restore) and, when ensure launched it, label + launch_argv.
const btmResumeOnly = (pane: number, cwd: string) => ({
  custom_name: "btm",
  layout: { Pane: pane },
  panes: {
    [pane]: {
      cwd,
      agent_resume: { source: "btm", agent: "btm", argv: ["btmp"] },
    },
  },
  zoomed: false,
  focused: pane,
  root_pane: pane,
});
const btmLaunched = (pane: number, cwd: string) => ({
  custom_name: "btm",
  layout: { Pane: pane },
  panes: {
    [pane]: {
      cwd,
      label: "btm",
      agent_resume: { source: "btm", agent: "btm", argv: ["btmp"] },
      launch_argv: [process.execPath, entry],
    },
  },
  zoomed: false,
  focused: pane,
  root_pane: pane,
});
const btmLabelOnly = (pane: number, cwd: string) => ({
  custom_name: "btm",
  layout: { Pane: pane },
  panes: { [pane]: { cwd, label: "btm" } },
  zoomed: false,
  focused: pane,
  root_pane: pane,
});
const userTab = (pane: number, cwd: string) => ({
  custom_name: "work",
  layout: { Pane: pane },
  panes: { [pane]: { cwd } },
  zoomed: false,
  focused: pane,
  root_pane: pane,
});

function session(cwd: string, activeTab: number) {
  const tabs = [
    userTab(1, cwd),
    btmResumeOnly(2, cwd),
    btmResumeOnly(3, cwd),
    btmLaunched(4, cwd),
    btmLabelOnly(5, cwd),
  ];
  return {
    version: 3,
    workspaces: [
      {
        id: "w1",
        custom_name: "main",
        identity_cwd: cwd,
        public_pane_numbers: Object.fromEntries(
          tabs.map((_, index) => [String(index + 1), index + 1]),
        ),
        next_public_pane_number: tabs.length + 1,
        public_tab_numbers: tabs.map((_, index) => index + 1),
        next_public_tab_number: tabs.length + 1,
        tabs,
        active_tab: activeTab,
      },
    ],
    active: 0,
    selected: 0,
    sidebar_width: null,
    sidebar_section_split: null,
    collapsed_space_keys: [],
  };
}

async function restartThrice(activeTab: number) {
  const root = await mkdtemp(join(tmpdir(), "btm-restart-"));
  await using _temp = {
    [Symbol.asyncDispose]: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
  await mkdir(`${root}/.bun/bin`, { recursive: true });
  await mkdir(`${root}/.config/herdr`, { recursive: true });
  await Bun.write(`${root}/.zshrc`, "");
  await symlink(entry, `${root}/.bun/bin/btmp`);
  await Bun.write(`${root}/config.toml`, await Bun.file(configPath).text());
  await Bun.write(
    `${root}/.config/herdr/session.json`,
    JSON.stringify(session(root, activeTab)),
  );
  const env = {
    ...process.env,
    HOME: root,
    XDG_CONFIG_HOME: `${root}/.config`,
    // Restored panes type `btmp`; it must resolve like the owner's login shell.
    PATH: `${root}/.bun/bin:${process.env["PATH"] ?? ""}`,
    HERDR_SOCKET_PATH: "s",
    HERDR_CONFIG_PATH: `${root}/config.toml`,
    HERDR_PANE_ID: "",
    HERDR_WORKSPACE_ID: "",
    HERDR_TAB_ID: "",
  };
  const run = async (argv: string[]) => {
    const child = Bun.spawn(argv, {
      env,
      cwd: root,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 20000,
      killSignal: "SIGKILL",
    });
    const [out, error, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect({ code, error }).toEqual({ code: 0, error: "" });
    return out;
  };
  const observe = async () => {
    const tabs = Tabs.safeParse(await run(["herdr", "tab", "list"]));
    const agents = Agents.safeParse(await run(["herdr", "agent", "list"]));
    if (!tabs.success || !agents.success)
      return expect.unreachable("unparseable herdr output");
    return {
      btmTabs: tabs.data.result.tabs.filter((tab) => tab.label === "btm"),
      workTabs: tabs.data.result.tabs.filter((tab) => tab.label === "work"),
      btmAgents: agents.data.result.agents.filter(
        (agent) => agent.agent === "btm",
      ),
    };
  };

  // Samples until one btm tab and one btm agent hold for 8 samples (or 30s).
  const settle = async (server: Bun.Subprocess, stderr: Promise<string>) => {
    const history: string[] = [];
    const timeline: string[] = [];
    const began = performance.now();
    const deadline = began + 30000;
    let stable = 0;
    while (performance.now() < deadline && stable < 8) {
      await Bun.sleep(750);
      if (server.exitCode !== null)
        expect(server.exitCode, await stderr).toBeNull();
      const seen = await observe().catch((error: unknown) => {
        timeline.push(
          `${((performance.now() - began) / 1000).toFixed(1)}s ERR ${String(error).slice(0, 300)}`,
        );
        return null;
      });
      if (seen === null) continue;
      history.push(
        `tabs=${seen.btmTabs.length} agents=${seen.btmAgents.length} work=${seen.workTabs.length}`,
      );
      timeline.push(
        `${((performance.now() - began) / 1000).toFixed(1)}s ${history.at(-1) ?? ""}`,
      );
      // Never more than the saved + one created, never the user tab lost.
      expect(seen.btmTabs.length).toBeLessThanOrEqual(5);
      expect(seen.workTabs).toHaveLength(1);
      const converged =
        seen.btmTabs.length === 1 && seen.btmAgents.length === 1;
      stable = converged ? stable + 1 : 0;
    }
    return { tail: history.slice(-3), stable, timeline };
  };

  for (const restart of [1, 2, 3]) {
    // bounded: each server lives within this loop iteration and is stopped below.
    const server = Bun.spawn(["herdr", "server"], {
      env,
      cwd: root,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
      timeout: 70000,
      killSignal: "SIGKILL",
    });
    const stderr = new Response(server.stderr).text();
    const { tail, stable, timeline } = await settle(server, stderr);
    await Bun.write(
      `/tmp/btm-restart-timeline-${restart}-${process.pid}-${activeTab}.txt`,
      timeline.join("\n"),
    );
    // P1: restart #N converges to exactly one btm tab with one btm agent and stays.
    expect({ restart, tail, stable }).toEqual({
      restart,
      tail: Array.from({ length: 3 }, () => "tabs=1 agents=1 work=1"),
      stable: 8,
    });
    await run(["herdr", "server", "stop"]);
    await server.exited;
    await stderr;
  }
}

// Active tab is a saved btm tab: its `btmp` resume runs; the others stay idle shells.
test.concurrent(
  "restart with saved btm tabs keeps exactly one btm (btm tab active)",
  () => restartThrice(1),
  170000,
);
// Active tab is the user's: no btm resumes at all, so ensure must launch one.
test.concurrent(
  "restart with saved btm tabs keeps exactly one btm (user tab active)",
  () => restartThrice(0),
  170000,
);
