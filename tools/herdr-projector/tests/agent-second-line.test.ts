import { expect, test } from "bun:test";
import {
  agentSecondLine,
  claudeFooterObservation,
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

test("roster names, statusline context and verified remote control form the second line", async () => {
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
          ctx: { na: true as const, why: "unknown" },
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
      new Map([["pane", "29% (203k/700k)"]]),
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

test("reads the context already rendered in a verified Claude footer", () => {
  const id = "c602d8dc-0a46-438f-aca5-88a88ff0f0dd";
  const footer = `  user@host:11-05 12:00+09|~/repo\n  Claude (stdin) | name | Opus 5.5 | medium | 🔗 | Ctx: 29% (203k/700k) | account | Session: ${id}\n  ⏵⏵ auto mode on (shift+tab to cycle)`;
  expect(claudeFooterObservation(footer)).toMatchObject({
    id,
    context: "29% (203k/700k)",
    rc: "rc:on",
  });
  expect(claudeFooterObservation(footer.replace("🔗", "rc:off"))?.rc).toBe(
    "rc:off",
  );
  expect(
    claudeFooterObservation(footer.replace("🔗", "rc n/a (unavailable)"))?.rc,
  ).toBe("rc:?");
});
