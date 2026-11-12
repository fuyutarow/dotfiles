import { afterAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { err, ok } from "neverthrow";
import { ClaudeStatuslineInputSchema } from "../src/adapters/claude-statusline.ts";
import { buildDataframe } from "../src/build-dataframe.ts";
import { render } from "../src/format.ts";
import { cleanupTempDirs, tempDir } from "./helpers.ts";

// The statusline paints only xterm-256 named colors: SGR 38;5;N, plus reset (0) and bold (1).
// Dim (2), the 16-color codes (30-37, 90-97, 39) and truecolor (38;2;...) must not appear in a
// rendered status, and every N that appears must be a row of the table in ansi.ts.
const ESC = String.fromCodePoint(27);
const SGR = new RegExp(`${ESC}\\[([0-9;]*)m`, "gu");
const ANSI_SOURCE = join(import.meta.dir, "../src/ansi.ts");

afterAll(cleanupTempDirs);

async function renderFixture(wfOn: boolean): Promise<string> {
  const parsed = await ClaudeStatuslineInputSchema.safeParseAsync({
    cwd: "/fixture/project",
    session_id: "fixture-session",
    model: { display_name: "Opus" },
    context_window: { total_input_tokens: 1000, used_percentage: 25 },
    cost: { total_lines_added: 4, total_lines_removed: 2 },
    effort: { level: "high" },
    worktree: { name: "fixture-worktree" },
  });
  expect(parsed.success).toBe(true);
  if (!parsed.success) return "";
  const dataframe = await buildDataframe(parsed.data, {
    fieldStoreRoot: tempDir("named-palette-"),
    sources: {
      identity: () =>
        Promise.resolve({
          email: "fixture@example.test",
          accountWhy: undefined,
          rlModel: [],
          modelCapsWhy: undefined,
          wfOn,
        }),
      agentName: () => Promise.resolve(ok("fixture-agent")),
      rcState: () => Promise.resolve("on"),
      repoState: () =>
        Promise.resolve({ branch: "fixture-branch", branchWhy: undefined }),
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
  return render(dataframe);
}

test("the full rendered status paints only named xterm-256 colors", async () => {
  const rendered = [await renderFixture(false), await renderFixture(true)].join(
    "\n",
  );
  const params = [...rendered.matchAll(SGR)].map((match) => match[1] ?? "");
  expect(params.length).toBeGreaterThan(0);
  expect(rendered).not.toContain(`${ESC}[2m`);

  const forbidden = params.filter(
    (param) =>
      param !== "0" &&
      param !== "1" &&
      !/^38;5;(?:[0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/u.test(param),
  );
  expect(forbidden).toEqual([]);

  const table = readFileSync(ANSI_SOURCE, "utf8");
  const indexes = new Set(
    params.filter((param) => param.startsWith("38;5;")).map((p) => p.slice(5)),
  );
  const unlisted = [...indexes].filter(
    (n) => !new RegExp(`^//\\s+${n}\\s`, "mu").test(table),
  );
  expect(unlisted).toEqual([]);
});
