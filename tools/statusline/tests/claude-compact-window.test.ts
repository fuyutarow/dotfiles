import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeStatuslineInputSchema } from "../src/adapters/claude-statusline.ts";
import { contextLabel, ctxSegment } from "../src/model-context.ts";
import { buildDataframe } from "../src/build-dataframe.ts";
import { ok } from "neverthrow";

const ansi = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "gu");
const directory = mkdtempSync(
  join(process.env["AGX_RUN_DIR"] ?? tmpdir(), "compact-test-"),
);

function parse(
  settings: string,
  model = "claude-opus-5-5",
  modelWindow?: number,
) {
  writeFileSync(join(directory, "settings.json"), settings);
  const previous = process.env["CLAUDE_CONFIG_DIR"];
  process.env["CLAUDE_CONFIG_DIR"] = directory;
  const parsed = ClaudeStatuslineInputSchema.safeParse({
    model: { id: model },
    context_window: {
      current_usage: { input_tokens: 120000 },
      used_percentage: 12,
      context_window_size: modelWindow,
    },
  });
  if (previous === undefined) delete process.env["CLAUDE_CONFIG_DIR"];
  else process.env["CLAUDE_CONFIG_DIR"] = previous;
  return parsed.success ? parsed.data : undefined;
}

describe("Claude auto-compact window", () => {
  const settings = JSON.stringify({
    modelSettings: { "claude-opus-5-5": { autoCompactWindow: 400000 } },
  });
  test("matches model and displays usage against its window", () => {
    const context = parse(settings, "claude-opus-5-5[1m]")?.context;
    expect(context?.compactWindow).toBe(400000);
    expect(
      ctxSegment({
        ctx: "120k",
        ctxPct: (100 * 120000) / (context?.compactWindow ?? 1),
        ctxWindow: context?.compactWindow,
      }).replaceAll(ansi, ""),
    ).toBe("Ctx: 30% (120k/400k)");
  });
  test("uses three significant figures for token and window labels", () => {
    for (const [value, label] of [
      [167600, "168k"],
      [12345, "12.3k"],
      [1234, "1.23k"],
      [999, "999"],
      [1000000, "1.00M"],
      [999999, "1.00M"],
    ] as const) {
      expect(contextLabel(value)).toBe(label);
    }
    const result = ctxSegment({ ctx: "168k", ctxPct: 42, ctxWindow: 400500 });
    expect(result.replaceAll(ansi, "")).toBe("Ctx: 42% (168k/401k)");
    expect(result).toContain(`${String.fromCodePoint(27)}[38;5;71m42%`);
    for (const [value, label] of [
      [1000000, "1M"],
      [400000, "400k"],
      [200000, "200k"],
      [123456, "123k"],
    ] as const) {
      expect(
        ctxSegment({ ctx: "120k", ctxPct: 12, ctxWindow: value }).replaceAll(
          ansi,
          "",
        ),
      ).toBe(`Ctx: 12% (120k/${label})`);
    }
    expect(
      ctxSegment({ ctx: "120k", ctxPct: 12, ctxWindow: undefined }).replaceAll(
        ansi,
        "",
      ),
    ).toBe("Ctx: 120k 12%");
  });
  test("retains percentage when setting is absent, another model, or invalid JSON", () => {
    for (const input of ["{}", settings, "{"]) {
      const context = parse(input, "claude-sonnet-5-5")?.context;
      expect(context?.compactWindow).toBeUndefined();
      expect(context?.usedPercent).toBe(12);
    }
  });
  test("dataframe computes the displayed percentage from the parsed window", async () => {
    const session = parse(settings, "claude-opus-5-5", 1000000);
    expect(session).toBeDefined();
    if (session === undefined) return;
    const frame = await buildDataframe(session, {
      fieldStoreRoot: directory,
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
        rcState: () => Promise.resolve("off"),
        repoState: () =>
          Promise.resolve({ branch: undefined, branchWhy: undefined }),
        jobScan: () => Promise.resolve({ jobs: [], orphans: 0 }),
        hostLoad: () =>
          Promise.resolve({
            cpuPct: ok(0),
            ram: ok({ frac: "0/1G", pct: 0 }),
            vram: undefined,
          }),
        routes: () => Promise.resolve(undefined),
        dispatchWarning: () => Promise.resolve(undefined),
        storage: () => Promise.resolve(ok([])),
        herdrReport: () => Promise.resolve(),
        codexRate: () => Promise.resolve(ok(undefined)),
        jevUsage: () => Promise.resolve(ok(undefined)),
        recoverHealth: () => Promise.resolve(undefined),
      },
    });
    expect(ctxSegment(frame).replaceAll(ansi, "")).toBe("Ctx: 30% (120k/400k)");
    const modelOnly = parse("{}", "claude-opus-5-5", 1000000);
    expect(modelOnly?.context?.modelWindow).toBe(1000000);
    if (modelOnly === undefined) return;
    const modelFrame = await buildDataframe(modelOnly, {
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
        rcState: () => Promise.resolve("off"),
        repoState: () =>
          Promise.resolve({ branch: undefined, branchWhy: undefined }),
        jobScan: () => Promise.resolve({ jobs: [], orphans: 0 }),
        hostLoad: () =>
          Promise.resolve({
            cpuPct: ok(0),
            ram: ok({ frac: "0/1G", pct: 0 }),
            vram: undefined,
          }),
        routes: () => Promise.resolve(undefined),
        dispatchWarning: () => Promise.resolve(undefined),
        storage: () => Promise.resolve(ok([])),
        herdrReport: () => Promise.resolve(),
        codexRate: () => Promise.resolve(ok(undefined)),
        jevUsage: () => Promise.resolve(ok(undefined)),
        recoverHealth: () => Promise.resolve(undefined),
      },
    });
    expect(ctxSegment(modelFrame).replaceAll(ansi, "")).toBe(
      "Ctx: 12% (120k/1M)",
    );
    expect(
      parse("{}", "claude-opus-5-5", 0)?.context?.modelWindow,
    ).toBeUndefined();
  });
});
