import { expect, test } from "bun:test";
import {
  agentSecondLine,
  projectAgents,
  rosterRow,
} from "../src/herdr-projector.ts";

const rows = [
  {
    id: "opus-medium",
    route: "claude",
    model: "claude-opus-5-5",
    effort: "medium",
  },
  { id: "terra-low", route: "codex", model: "gpt-6.1-terra", effort: "low" },
  {
    id: "opus-xhigh",
    route: "claude",
    model: "claude-opus-5-5",
    effort: "xhigh",
  },
];

test("hidden footer: session context and native remote control form the second line", async () => {
  for (const [vendor, model, effort, expected] of [
    ["claude", "Opus 5.5", "medium", "opus-medium"],
    ["codex", "GPT-6.1-Terra", "low", "terra-low"],
    ["claude", "Opus 5.5", "xhigh+WF", "opus-xhigh+WF"],
  ] as const) {
    const id = "c602d8dc-0a46-438f-aca5-88a88ff0f0dd";
    const agents = [
      {
        agent: vendor,
        pane_id: "pane",
        tab_id: "tab",
        agent_session: { value: id },
      },
    ];
    const sessions = new Map([
      [
        id,
        {
          schema: 1 as const,
          session_id: id,
          vendor,
          name: { na: true as const, why: "unknown" },
          model,
          effort,
          ctx: { tokens: 203000, pct: 29, window: 700000 },
          rate: { na: true as const, why: "unknown" },
          cwd: "/tmp",
          pane_id: "pane",
          updated_at: "2026-11-05T00:00:00Z",
        },
      ],
    ]);
    const calls: string[][] = [];
    await projectAgents(
      agents,
      sessions,
      (args) => {
        calls.push(args);
        return Promise.resolve(true);
      },
      new Map(),
      new Map([["pane", "rc:on"]]),
      new Map(),
      undefined,
      new Map(),
      rows,
    );
    expect(calls[1]).toContain(
      `agent_detail=${expected} ・ ctx 29%/700k ・ 🔗`,
    );
  }
  expect(agentSecondLine("opus-medium", "29% (203k/700k)", "rc:off")).toBe(
    "opus-medium ・ ctx 29%/700k ・ rc:off",
  );
  expect(agentSecondLine("opus-medium", "29% (203k/700k)", "rc:?")).toBe(
    "opus-medium ・ ctx 29%/700k ・ rc:?",
  );
  expect(agentSecondLine(undefined, undefined, undefined)).toBe(
    "? ・ ctx ?/? ・ rc:?",
  );
  expect(agentSecondLine("opus-medium", "203k 29%", "rc:on")).toBe(
    "opus-medium ・ ctx ?/? ・ 🔗",
  );
  expect(rosterRow(rows, "claude", "unknown", "medium")).toBeUndefined();
});
