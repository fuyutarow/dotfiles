import { describe, expect, test } from "bun:test";
import { err, ok } from "neverthrow";
import { ClaudeStatuslineInputSchema } from "../src/adapters/claude-statusline.ts";
import { buildDataframe } from "../src/build-dataframe.ts";
import { render } from "../src/format.ts";

const ESC = String.fromCodePoint(27);

describe("buildDataframe source budgets", () => {
  test("a hung git source yields a named placeholder within the render budget", async () => {
    const parsed = ClaudeStatuslineInputSchema.safeParse({ cwd: "/fixture" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const started = performance.now();
    const dataframe = await buildDataframe(parsed.data, {
      sources: {
        rcState: () => Promise.resolve("unknown"),
        repoState: () => new Promise(() => {}),
        jobScan: () => Promise.resolve({ jobs: [], orphans: 0 }),
        hostLoad: () =>
          Promise.resolve({
            cpuPct: err("host unavailable"),
            ram: err("host unavailable"),
            vram: err("host unavailable"),
          }),
        storage: () => Promise.resolve(ok([])),
        herdrReport: () => Promise.resolve(),
      },
      budgets: { repoState: 40 },
    });
    const elapsed = performance.now() - started;
    const text = render(dataframe).replaceAll(
      new RegExp(`${ESC}\\[[0-9;]*m`, "gu"),
      "",
    );
    expect(text).toContain("branch n/a (git timeout 40ms)");
    expect(elapsed).toBeLessThan(300);
  });
});
