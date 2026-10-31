import { describe, expect, test } from "bun:test";
import { err, ok } from "neverthrow";
import { ClaudeStatuslineInputSchema } from "../src/adapters/claude-statusline.ts";
import { buildDataframe } from "../src/build-dataframe.ts";
import { render } from "../src/format.ts";
import { currentDispatcherSession } from "../src/dispatch-display.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ANSI = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "gu");

describe("statusline render golden", () => {
  test("fixed collector results keep the rendered rows unchanged", async () => {
    const sessionId = "fixture-session";
    const parsed = await ClaudeStatuslineInputSchema.safeParseAsync({
      cwd: "/fixture/project",
      session_id: sessionId,
      model: { display_name: "Opus" },
      context_window: { total_input_tokens: 1000, used_percentage: 25 },
      cost: { total_lines_added: 4, total_lines_removed: 2 },
      effort: { level: "high" },
      worktree: { name: "fixture-worktree" },
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const fieldStoreRoot = await mkdtemp(
      join(tmpdir(), "render-golden-fields-"),
    );
    const dataframe = await buildDataframe(parsed.data, {
      fieldStoreRoot,
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
        routes: () => Promise.resolve(ok({ runs: [], unreadable: 0 })),
        dispatchWarning: () => Promise.resolve(undefined),
        storage: () => Promise.resolve(ok([])),
        herdrReport: () => Promise.resolve(),
        codexRate: () => Promise.resolve(ok(undefined)),
        jevUsage: () => Promise.resolve(err("fixture unavailable")),
        recoverHealth: () => Promise.resolve(undefined),
      },
    });

    const lines = render(dataframe).replaceAll(ANSI, "").split("\n");
    lines[0] = "<prompt-head>";
    expect(lines.join("\n")).toMatchSnapshot();
    const summary = lines.find((line) => line.startsWith("agx "));
    expect(summary).toBeUndefined();
    expect(lines.join("\n")).not.toContain("dispatch warning: none");
    const emptyWarning = render({
      ...dataframe,
      fields: {
        ...dataframe.fields,
        "dispatch-warning": { kind: "fresh", value: "  " },
      },
    })
      .replaceAll(ANSI, "")
      .split("\n")
      .find((line) => line.startsWith("agx "));
    expect(emptyWarning).toBeUndefined();

    const workerLines = render({
      ...dataframe,
      fields: {},
      routes: ok({
        runs: [
          {
            displayId: undefined,
            choice: "terra-high",
            label: "STATUSLINE-WORKER-ROWS",
            workerName: "agx-x",
            workspaceName: "ws_x",
            pickSource: "agx",
            phase: "working",
            workerSession: "01a1111b-7dab-7d61-8f9b-231c4cc9082b",
            markerCostUsd: 0.03,
            secs: 90,
            alive: true,
            dispatcherSession: currentDispatcherSession(sessionId),
            doing: undefined,
          },
        ],
        sessionScope: sessionId,
        unreadable: 0,
      }),
    })
      .replaceAll(ANSI, "")
      .split("\n");
    workerLines[0] = "<prompt-head>";
    expect(workerLines.join("\n")).toMatchSnapshot();
    expect(workerLines.join("\n")).toContain(
      "agt_x@ws_x tkt_STATUSLINE-WORKER-ROWS",
    );
    expect(workerLines.join("\n")).not.toMatch(/01a1|082b|agx-x/u);

    const codexLines = render(dataframe, { codex: true }).replaceAll(ANSI, "");
    expect(codexLines).not.toContain("fixture@example.test");
    expect(codexLines).not.toContain("claude");
    expect(codexLines).not.toContain("Jev");
    expect(codexLines).not.toContain("diff");
    expect(codexLines).not.toContain("payload has no cost block");
    await rm(fieldStoreRoot, { recursive: true, force: true });
  });
});
