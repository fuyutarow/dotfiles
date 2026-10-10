import { describe, expect, test } from "bun:test";
import { err, ok } from "neverthrow";
import { ClaudeStatuslineInputSchema } from "../src/adapters/claude-statusline.ts";
import { buildDataframe } from "../src/build-dataframe.ts";
import { render } from "../src/format.ts";

const ANSI = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "gu");

describe("statusline render golden", () => {
  test("fixed collector results keep the rendered rows unchanged", async () => {
    const parsed = ClaudeStatuslineInputSchema.safeParse({
      cwd: "/fixture/project",
      session_id: "fixture-session",
      model: { display_name: "Opus" },
      context_window: { total_input_tokens: 1000, used_percentage: 25 },
      cost: { total_lines_added: 4, total_lines_removed: 2 },
      effort: { level: "high" },
      worktree: { name: "fixture-worktree" },
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const dataframe = await buildDataframe(parsed.data, {
      sources: {
        identity: () =>
          Promise.resolve({
            email: "fixture@example.test",
            accountWhy: undefined,
            rlModel: [],
            modelCapsWhy: undefined,
            wfOn: false,
          }),
        agentName: () => Promise.resolve(ok("fixture-agent")),
        rcState: () => Promise.resolve("off"),
        repoState: () =>
          Promise.resolve({ branch: "fixture-branch", branchWhy: undefined }),
        jobScan: () => Promise.resolve({ jobs: [], orphans: 0 }),
        hostLoad: () =>
          Promise.resolve({
            cpuPct: ok(12),
            ram: ok({ frac: "2.0/8.0G", pct: 25 }),
            vram: undefined,
          }),
        routes: () => Promise.resolve(undefined),
        dispatchWarning: () => Promise.resolve(undefined),
        storage: () => Promise.resolve(ok([])),
        herdrReport: () => Promise.resolve(),
        codexRate: () => Promise.resolve(ok(undefined)),
        jevUsage: () => Promise.resolve(err("fixture unavailable")),
      },
    });

    const lines = render(dataframe).replaceAll(ANSI, "").split("\n");
    lines[0] = "<prompt-head>";
    expect(lines.join("\n")).toMatchSnapshot();
  });
});
