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
  expect(calls[1]).toContain("rc=🔗");
  expect(calls[2]).toEqual([
    "tab",
    "rename",
    "tab-2",
    "codex pane-2 (unidentified: fleet session sid-2 is missing)",
  ]);
  expect(calls[3]).toContain("model=");
});

test("unknown refresh does not overwrite an existing known identity for the same session", async () => {
  const calls: string[][] = [];
  await projectAgents(
    [
      {
        agent: "claude",
        pane_id: "pane-1",
        tab_id: "tab-1",
        agent_session: { value: "sid-1" },
        tokens: {
          fleet_session_id: "sid-1",
          fullname: "project-agt_abcd",
          model: "Opus 5.5",
        },
      },
    ],
    new Map(),
    (args) => Promise.resolve(calls.push(args)).then(() => true),
  );
  expect(calls).toEqual([]);
});
