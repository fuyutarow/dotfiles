import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentSchema,
  bindClaudePanes,
  nativeFooterObservation,
  nativeClaudeRc,
  projectAgents,
  readProjectorTitle,
} from "../src/herdr-projector.ts";

const id = "c602d8dc-0a46-438f-aca5-88a88ff0f0dd";
const agent = () => {
  return {
    agent: "claude",
    pane_id: "pane",
    tab_id: "tab",
    cwd: "/workspace/project",
    terminal_title_stripped: "firedancer-agt_0smx",
  };
};
const claude = `──────────────── firedancer-agt_0smx ─
❯
────────────────
  fuyu@R99-U26:10-24 16:48+09|~/Workspace/firedancer | ⎇ HEAD | v0.21.10
  Claude (stdin) | name n/a (not listed yet) | Opus 5.5 | medium | 🔗 | Ctx: 464.5k 46% | owner@example.com | Session: ${id}
  Rate: n/a
  Sys: n/a
  Job: idle
  ⏵⏵ auto mode on (shift+tab to cycle)
`;

test("Oct 24 footer supports warning counts, Main default and home cwd", () => {
  for (const [cwd, suffix, controls] of [
    [
      "~/Workspace/firedancer",
      " · Main [default]",
      "⚠ 6 warnings · f2 to view",
    ],
    [
      "~/Workspace/research-record-v2",
      "",
      "← for agents · ? for shortcuts     ⚠ 2 warnings · f2 to view",
    ],
    ["~", "", "⚠ 1 warning · f2 to view"],
  ]) {
    expect(
      nativeFooterObservation(
        `\n› Ask Codex to do anything\n\n  ${id} · GPT-6-Astra high · ${cwd} · Ready${suffix}\n  ${controls}\n`,
      ),
    ).toMatchObject({ id, model: "GPT-6-Astra", effort: "high", cwd });
  }
});

test("Oct 24 missing Claude registration recovers from pane footer and exact transcript", async () => {
  const root = await mkdtemp(join(tmpdir(), "projector-oct24-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const env = { HOME: root, XDG_RUNTIME_DIR: root };
  const path = join(root, ".claude/projects/-workspace-project", `${id}.jsonl`);
  await Bun.write(
    path,
    `${JSON.stringify({ type: "custom-title", sessionId: id, customTitle: "firedancer-agt_0smx" })}\n`,
  );
  const agents = [agent()];
  const rc = new Map<string, string>();
  const sessions = await bindClaudePanes(agents, rc, env, () =>
    Promise.resolve(claude),
  );
  expect(AgentSchema.safeParse(agents[0]).data?.agent_session?.value).toBe(id);
  expect(rc.get("pane")).toBe("rc:on");
  const calls: string[][] = [];
  await projectAgents(
    agents,
    sessions,
    (args) => {
      calls.push(args);
      return Promise.resolve(true);
    },
    new Map(),
    rc,
  );
  expect(calls[1]).toContain("fullname=firedancer-agt_0smx");
  expect(calls[1]).toContain("model=Opus 5.5");
  expect(calls[1]).toContain("effort=medium");
  expect(calls[1]).toContain("rc=🔗");
  expect(
    await Bun.file(join(root, "fleet/sessions", `${id}.json`)).exists(),
  ).toBe(false);
  let reads = 0;
  expect(
    (
      await bindClaudePanes([agent()], new Map(), env, () =>
        Promise.resolve(
          ++reads === 1
            ? claude
            : claude.replace(id, "00000000-0000-0000-0000-000000000000"),
        ),
      )
    ).size,
  ).toBe(0);
  await Bun.write(path, `${JSON.stringify({ sessionId: "other" })}\n`);
  expect(
    (
      await bindClaudePanes([agent()], new Map(), env, () =>
        Promise.resolve(claude),
      )
    ).size,
  ).toBe(0);
});

test("native append-index rename selects newest exact ID and rejects conflicting timestamps", async () => {
  const root = await mkdtemp(join(tmpdir(), "projector-index-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const row = (thread_name: string, updated_at: string) =>
    JSON.stringify({ id, thread_name, updated_at });
  const path = join(root, "session_index.jsonl");
  const latest = "2026-10-24T06:15:40.120236993Z";
  await Bun.write(
    path,
    `${row("状況を把握する", "2026-10-22T03:47:53.268519731Z")}\n${row("Witness encryption: docs-archives → soks", latest)}\n`,
  );
  expect(await readProjectorTitle(id, { CODEX_HOME: root })).toMatchObject({
    kind: "known",
    displayTitle: "Witness encryption: docs-archives → soks",
  });
  await Bun.write(path, `${row("one", latest)}\n${row("two", latest)}\n`);
  expect(await readProjectorTitle(id, { CODEX_HOME: root })).toMatchObject({
    kind: "unavailable",
  });
});

test("native Claude bridge observation works when worker /proc cannot see host PID", async () => {
  const root = await mkdtemp(join(tmpdir(), "projector-rc-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const path = join(root, ".claude/sessions/5956.json");
  await Bun.write(
    path,
    JSON.stringify({
      pid: 5956,
      sessionId: id,
      procStart: "9599",
      bridgeSessionId: "session_example",
    }),
  );
  const pane = {
    ...agent(),
    agent_session: { value: id, source: "herdr:claude" },
  };
  const info = JSON.stringify({
    result: {
      process_info: { foreground_processes: [{ name: "claude", pid: 5956 }] },
    },
  });
  expect(
    await nativeClaudeRc(pane, { HOME: root }, () => Promise.resolve(info)),
  ).toBe("rc:on");
  await Bun.write(
    path,
    JSON.stringify({
      pid: 5956,
      sessionId: "other",
      procStart: "9599",
      bridgeSessionId: "session_example",
    }),
  );
  expect(
    await nativeClaudeRc(pane, { HOME: root }, () => Promise.resolve(info)),
  ).toBeUndefined();
});
