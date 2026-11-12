import { expect, test } from "bun:test";
import {
  agentSecondRow,
  agentSecondRowArgs,
  CTX_TOKENS,
  HERDR_MAX_METADATA_TOKENS,
  metadataReportChunks,
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

test("hidden footer: session context forms the second line", async () => {
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
    // Row 2 is two tokens: the model/effort part and the graded ctx token.
    expect(calls[1]).toContain(`agent_detail=${expected}`);
    expect(calls[1]).toContain("ctx_lo=ctx 29%/700k");
    expect(calls[1]?.join(" ")).not.toContain("\u30FB");
  }
  expect(agentSecondRow("opus-medium", "29% (203k/700k)")).toEqual({
    detail: "opus-medium",
    ctx: { token: "ctx_lo", text: "ctx 29%/700k" },
  });
  expect(rosterRow(rows, "claude", "unknown", "medium")).toBeUndefined();
});

test("ctx level: 0, 69, 70, 89, 90 and unknown choose exactly one token, the rest are cleared", () => {
  for (const [pct, token] of [
    [0, "ctx_lo"],
    [69, "ctx_lo"],
    [70, "ctx_mid"],
    [89, "ctx_mid"],
    [90, "ctx_hi"],
    [100, "ctx_hi"],
  ] as const) {
    const second = agentSecondRow("opus-medium", `${pct}% (1k/600k)`);
    expect(second.ctx).toEqual({ token, text: `ctx ${pct}%/600k` });
    const args = agentSecondRowArgs(second);
    expect(args).toContain("--token");
    expect(args).toContain("agent_detail=opus-medium");
    expect(args).toContain(`${token}=ctx ${pct}%/600k`);
    for (const other of CTX_TOKENS.filter((name) => name !== token))
      expect(args.join(" ")).toContain(`--clear-token ${other}`);
    expect(args.filter((arg) => /^ctx_\w+=/u.test(arg))).toHaveLength(1);
  }
  // The level is read on the rounded percentage, as the statusline's pctFmt rounds it.
  expect(agentSecondRow("x", "69.6% (1k/600k)").ctx.token).toBe("ctx_mid");
  expect(agentSecondRow("x", "89.4% (1k/600k)").ctx.token).toBe("ctx_mid");
  expect(agentSecondRow("x", "89.5% (1k/600k)").ctx.token).toBe("ctx_hi");
  expect(agentSecondRow("x", "69.4% (1k/600k)").ctx.token).toBe("ctx_lo");
  // Unknown goes to the neutral token.
  for (const context of [undefined, "", "203k 29%"]) {
    const second = agentSecondRow("opus-medium", context);
    expect(second.ctx).toEqual({ token: "ctx_off", text: "ctx ?/?" });
    expect(agentSecondRowArgs(second).join(" ")).toContain("ctx_off=ctx ?/?");
    for (const other of ["ctx_lo", "ctx_mid", "ctx_hi"])
      expect(agentSecondRowArgs(second).join(" ")).toContain(
        `--clear-token ${other}`,
      );
  }
});

test("codex row: unknown model and context read '? · ctx ?/?' with ctx_off", () => {
  const second = agentSecondRow(undefined, undefined);
  expect(second).toEqual({
    detail: "?",
    ctx: { token: "ctx_off", text: "ctx ?/?" },
  });
  expect(`${second.detail} · ${second.ctx.text}`).toBe("? · ctx ?/?");
});

test("row 2 fit: an over-wide row drops the detail whole, never cuts a token", () => {
  const detail = "opus-medium";
  const ctx = "ctx 38%/600k";
  const drawn = `${detail} · ${ctx}`.length;
  expect(agentSecondRow(detail, "38% (1k/600k)", drawn).detail).toBe(detail);
  const narrow = agentSecondRow(detail, "38% (1k/600k)", drawn - 1);
  expect(narrow.detail).toBeUndefined();
  expect(narrow.ctx).toEqual({ token: "ctx_lo", text: ctx });
  const args = agentSecondRowArgs(narrow);
  expect(args.join(" ")).toContain("--clear-token agent_detail");
  expect(args.some((arg) => arg.startsWith("agent_detail="))).toBe(false);
});

test("ctx tokens stay inside the metadata token limit when chunked", () => {
  const args = agentSecondRowArgs(agentSecondRow("opus-medium", "95% (1k/1M)"));
  expect(args.length / 2).toBe(1 + CTX_TOKENS.length);
  for (const chunk of metadataReportChunks(args))
    expect(chunk.length / 2).toBeLessThanOrEqual(HERDR_MAX_METADATA_TOKENS);
});

test("stale ctx token is cleared when the level changes between projections", async () => {
  const id = "c602d8dc-0a46-438f-aca5-88a88ff0f0dd";
  const agents = [
    {
      agent: "claude",
      pane_id: "pane",
      tab_id: "tab",
      agent_session: { value: id },
    },
  ];
  const project = async (pct: number) => {
    const sessions = new Map([
      [
        id,
        {
          schema: 1 as const,
          session_id: id,
          vendor: "claude" as const,
          name: { na: true as const, why: "unknown" },
          model: "Opus 5.5",
          effort: "medium",
          ctx: { tokens: 1000, pct, window: 700000 },
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
    return calls.filter((call) => call[1] === "report-metadata").flat();
  };
  const low = await project(40);
  expect(low).toContain("ctx_lo=ctx 40%/700k");
  expect(low.join(" ")).toContain("--clear-token ctx_hi");
  const high = await project(95);
  expect(high).toContain("ctx_hi=ctx 95%/700k");
  expect(high.some((arg) => arg.startsWith("ctx_lo="))).toBe(false);
  for (const stale of ["ctx_lo", "ctx_mid", "ctx_off"])
    expect(high.join(" ")).toContain(`--clear-token ${stale}`);
});
