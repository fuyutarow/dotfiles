import { describe, expect, test } from "bun:test";
import { err, ok } from "neverthrow";
import { ClaudeStatuslineInputSchema } from "../src/adapters/claude-statusline.ts";
import { buildDataframe, type SourceClock } from "../src/build-dataframe.ts";
import { render } from "../src/format.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ESC = String.fromCodePoint(27);

describe("buildDataframe source budgets", () => {
  test("a hung git source yields a named placeholder within the render budget", async () => {
    const parsed = ClaudeStatuslineInputSchema.safeParse({ cwd: "/fixture" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const fieldStoreRoot = await mkdtemp(join(tmpdir(), "budget-fields-"));
    let now = 0;
    const timers = new Map<() => void, number>();
    const clock: SourceClock = {
      now: () => now,
      timeout: (callback, ms) => {
        timers.set(callback, ms);
        return () => {
          timers.delete(callback);
        };
      },
    };
    let gitStarted = false;
    const pending = buildDataframe(parsed.data, {
      clock,
      fieldStoreRoot,
      sources: {
        identity: () =>
          Promise.resolve({
            email: undefined,
            accountWhy: undefined,
            rlModel: [],
            modelCapsWhy: undefined,
            wfOn: false,
          }),
        agentName: () => Promise.resolve(ok(undefined)),
        rcState: () => Promise.resolve("unknown"),
        repoState: () => {
          gitStarted = true;
          return new Promise(() => {});
        },
        jobScan: () => Promise.resolve({ jobs: [], orphans: 0 }),
        hostLoad: () =>
          Promise.resolve({
            cpuPct: err("host unavailable"),
            ram: err("host unavailable"),
            vram: err("host unavailable"),
          }),
        routes: () => Promise.resolve(ok({ runs: [], unreadable: 0 })),
        dispatchWarning: () => Promise.resolve(undefined),
        storage: () => Promise.resolve(ok([])),
        herdrReport: () => Promise.resolve(),
        codexRate: () => Promise.resolve(ok(undefined)),
        jevUsage: () => Promise.resolve(ok(undefined)),
        recoverHealth: () => Promise.resolve(undefined),
      },
      budgets: { repoState: 40 },
    });
    // Let immediate sources settle, then fire exactly the git deadline without a real wait.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(gitStarted).toBe(true);
    expect([...timers.values()]).toEqual([40]);
    now = 40;
    for (const callback of timers.keys()) callback();
    const dataframe = await pending;
    const text = render(dataframe).replaceAll(
      new RegExp(`${ESC}\\[[0-9;]*m`, "gu"),
      "",
    );
    expect(text).toContain("branch n/a (git timeout 40ms)");
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(timers.size).toBe(0);
    await rm(fieldStoreRoot, { recursive: true, force: true });
  });
});
