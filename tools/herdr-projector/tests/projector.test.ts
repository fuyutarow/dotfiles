import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FleetSessionSchema,
  parseFleetSession,
  readFleetSession,
  writeFleetSession,
  type FleetSessionRead,
} from "../../shared/src/fleet-session.ts";
import { jsonOf } from "../../shared/src/zod.ts";
import { projectAgents } from "../src/herdr-projector.ts";

const session = (overrides: Record<string, unknown> = {}) => ({
  schema: 1,
  session_id: "sid-1",
  vendor: "claude",
  name: "project-agt_abcd",
  model: "Opus 5.5",
  effort: "high",
  ctx: { tokens: 12000, pct: 40 },
  rate: { five_h_pct: 20, seven_d_pct: 30, resets: "2026-10-20T00:00:00Z" },
  cwd: "/workspace/project",
  pane_id: "pane-1",
  updated_at: "2026-10-19T00:00:00.000Z",
  ...overrides,
});

test("shared fleet session atomically writes and reads schema 1", async () => {
  const root = await mkdtemp(join(tmpdir(), "fleet-session-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const parsed = parseFleetSession(JSON.stringify(session()));
  const valid = FleetSessionSchema.safeParse(parsed);
  expect(valid.success).toBe(true);
  if (!valid.success) return;
  expect(
    await writeFleetSession(valid.data, { XDG_RUNTIME_DIR: root }),
  ).toEqual({
    ok: true,
    value: undefined,
  });
  expect(await readFleetSession("sid-1", { XDG_RUNTIME_DIR: root })).toEqual(
    valid.data,
  );
  const disk = await readFile(
    join(root, "fleet", "sessions", "sid-1.json"),
    "utf8",
  );
  expect(jsonOf(FleetSessionSchema).safeParse(disk).data).toEqual(valid.data);
});

test("projects known identity metadata and labels unknown agents without model", async () => {
  const calls: string[][] = [];
  const agents = [
    {
      agent: "claude",
      pane_id: "pane-1",
      tab_id: "tab-1",
      agent_session: { value: "sid-1" },
      tokens: { rc: "🔗" },
    },
    {
      agent: "codex",
      pane_id: "pane-2",
      tab_id: "tab-2",
      agent_session: { value: "sid-2" },
    },
  ];
  const known = parseFleetSession(JSON.stringify(session()));
  const validKnown = FleetSessionSchema.safeParse(known);
  expect(validKnown.success).toBe(true);
  if (!validKnown.success) return;
  await projectAgents(
    agents,
    new Map<string, FleetSessionRead>([
      [validKnown.data.session_id, validKnown.data],
      ["sid-2", { na: true, why: "fleet session sid-2 is missing" }],
    ]),
    (args) => Promise.resolve(calls.push(args)).then(() => true),
  );
  expect(calls[0]).toEqual(["tab", "rename", "tab-1", "project-agt_abcd"]);
  expect(calls[1]).toContain("fullname=project-agt_abcd");
  expect(calls[1]).toContain("model=Opus 5.5");
  expect(calls[1]).toContain("effort=high");
  expect(calls[1]).toContain("rc=rc:?");
  expect(calls[2]).toEqual([
    "tab",
    "rename",
    "tab-2",
    "codex · n/a(no session file)",
  ]);
  expect(calls[3]).toContain("model=");
});

test("rejects a Claude session for a Codex pane and clears its identity", async () => {
  const calls: string[][] = [];
  const parsedClaude = FleetSessionSchema.safeParse(session());
  expect(parsedClaude.success).toBe(true);
  if (!parsedClaude.success) return;
  await projectAgents(
    [
      {
        agent: "codex",
        pane_id: "pane-2",
        tab_id: "tab-2",
        agent_session: { value: "sid-1" },
      },
    ],
    new Map([["sid-1", parsedClaude.data]]),
    (args) => Promise.resolve(calls.push(args)).then(() => true),
  );
  expect(calls[0]).toEqual([
    "tab",
    "rename",
    "tab-2",
    "codex · n/a(no session id)",
  ]);
  expect(calls[1]).toContain("model=");
  expect(calls[1]).toContain("fleet_session_id=");
});

test("uses Herdr's Codex id and statusline rollout selection when needed", async () => {
  const calls: string[][] = [];
  const parsedCodex = FleetSessionSchema.safeParse(
    session({
      vendor: "codex",
      session_id: "codex-thread",
      model: "gpt-6.1-sol",
    }),
  );
  expect(parsedCodex.success).toBe(true);
  if (!parsedCodex.success) return;
  let lookedUpCwd = "";
  await projectAgents(
    [
      {
        agent: "codex",
        pane_id: "pane-2",
        tab_id: "tab-2",
        agent_session: { value: "codex-thread" },
        cwd: "/workspace/project",
      },
      {
        agent: "codex",
        pane_id: "pane-3",
        tab_id: "tab-3",
        cwd: "/workspace/project",
      },
    ],
    new Map([["codex-thread", parsedCodex.data]]),
    (args) => Promise.resolve(calls.push(args)).then(() => true),
    (cwd) => {
      lookedUpCwd = cwd;
      return Promise.resolve("codex-thread");
    },
  );
  expect(lookedUpCwd).toBe("/workspace/project");
  expect(calls[1]).toContain("model=gpt-6.1-sol");
  expect(calls[3]).toContain("model=gpt-6.1-sol");
  expect(calls[3]).toContain("fleet_session_id=codex-thread");
});

test("keeps unavailable labels within 40 characters", async () => {
  const calls: string[][] = [];
  await projectAgents(
    [
      {
        agent: "codex-agent-name-that-is-much-too-long-to-fit",
        pane_id: "pane-2",
        tab_id: "tab-2",
      },
    ],
    new Map(),
    (args) => Promise.resolve(calls.push(args)).then(() => true),
  );
  const label = calls[0]?.[3] ?? "";
  expect(label.length).toBeLessThanOrEqual(40);
  expect(label).toContain(" · n/a(no session id)");
});

test("missing session clears stale identity tokens and explains the missing file", async () => {
  const calls: string[][] = [];
  await projectAgents(
    [
      {
        agent: "codex",
        pane_id: "pane-2",
        tab_id: "tab-2",
        agent_session: { value: "stale-id" },
        tokens: {
          fleet_session_id: "stale-id",
          fullname: "standard-skills-agt_0mr6",
          model: "Opus 5.5",
          effort: "medium",
          rc: "🔗",
        },
      },
    ],
    new Map([
      ["stale-id", { na: true, why: "fleet session stale-id is missing" }],
    ]),
    (args) => Promise.resolve(calls.push(args)).then(() => true),
  );
  expect(calls[0]).toEqual([
    "tab",
    "rename",
    "tab-2",
    "codex · n/a(no session file)",
  ]);
  expect(calls[1]).toContain("fullname=codex · n/a(no session file)");
  expect(calls[1]).toContain("model=");
  expect(calls[1]).toContain("effort=");
  expect(calls[1]).toContain("rc=rc:?");
  expect(calls[1]).toContain("fleet_session_id=");
});
