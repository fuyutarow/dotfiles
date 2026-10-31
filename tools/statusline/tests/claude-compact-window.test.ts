import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
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

async function parse(
  settings: string,
  model = "claude-opus-5-5",
  modelWindow?: number,
  transcript?: string,
  tokens = 120000,
  sessionId = "test-session",
) {
  writeFileSync(join(directory, "settings.json"), settings);
  const previousState = process.env["XDG_STATE_HOME"];
  process.env["XDG_STATE_HOME"] = directory;
  const previous = process.env["CLAUDE_CONFIG_DIR"];
  process.env["CLAUDE_CONFIG_DIR"] = directory;
  const parsed = await ClaudeStatuslineInputSchema.safeParseAsync({
    session_id: sessionId,
    model: { id: model },
    transcript_path: transcript,
    context_window: {
      current_usage: { input_tokens: tokens },
      used_percentage: 12,
      context_window_size: modelWindow,
    },
  });
  if (previous === undefined) delete process.env["CLAUDE_CONFIG_DIR"];
  else process.env["CLAUDE_CONFIG_DIR"] = previous;
  if (previousState === undefined) delete process.env["XDG_STATE_HOME"];
  else process.env["XDG_STATE_HOME"] = previousState;
  return parsed.success ? parsed.data : undefined;
}

const record = (content: string) =>
  JSON.stringify({ type: "user", message: { role: "user", content } });

describe("Claude auto-compact window", () => {
  const settings = JSON.stringify({
    modelSettings: { "claude-opus-5-5": { autoCompactWindow: 400000 } },
  });
  test("matches model and displays usage against its window", async () => {
    const context = (
      await parse(
        settings,
        "claude-opus-5-5[1m]",
        1000000,
        join(import.meta.dir, "fixtures/claude-autocompact.jsonl"),
      )
    )?.context;
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
  test("ignores host settings regardless of their contents", async () => {
    for (const input of ["{}", settings, "{"]) {
      const context = (await parse(input, "claude-sonnet-5-5"))?.context;
      expect(context?.compactWindow).toBeUndefined();
      expect(context?.usedPercent).toBe(12);
    }
  });
  test("scans older records incrementally and resumes across renders", async () => {
    const path = join(directory, "large.jsonl");
    const command = record("<command-name>/autocompact</command-name>");
    const output = record(
      "<local-command-stdout>Auto-compact window for Opus 5.5 set to 400k tokens</local-command-stdout>",
    );
    // The output straddles the 8 MiB boundary and lies more than 256 KiB before EOF.
    const prefix = "x".repeat(8 * 1024 * 1024 - command.length - 30) + "\n";
    writeFileSync(
      path,
      prefix + command + "\n" + output + "\n" + "x".repeat(300000) + "\n",
    );
    expect(
      (await parse(settings, "claude-opus-5-5", 1000000, path, 120000, "large"))
        ?.context?.compactWindow,
    ).toBeUndefined();
    expect(
      (await parse(settings, "claude-opus-5-5", 1000000, path, 120000, "large"))
        ?.context?.compactWindow,
    ).toBe(400000);
  });
  test("rescans replaced transcripts and corrupt state", async () => {
    const path = join(directory, "replace.jsonl");
    const command = record("<command-name>/autocompact</command-name>");
    const output = (n: number) =>
      record(
        `<local-command-stdout>Auto-compact window for Opus 5.5 set to ${n}k tokens</local-command-stdout>`,
      );
    writeFileSync(path, [command, output(400), ""].join("\n"));
    expect(
      (
        await parse(
          settings,
          "claude-opus-5-5",
          1000000,
          path,
          120000,
          "replace",
        )
      )?.context?.compactWindow,
    ).toBe(400000);
    const replacement = path + ".new";
    writeFileSync(
      replacement,
      [command, output(600), "", "x".repeat(100), ""].join("\n"),
    );
    renameSync(replacement, path);
    expect(
      (
        await parse(
          settings,
          "claude-opus-5-5",
          1000000,
          path,
          120000,
          "replace",
        )
      )?.context?.compactWindow,
    ).toBe(600000);
    writeFileSync(path, [command, output(300), ""].join("\n"));
    expect(
      (
        await parse(
          settings,
          "claude-opus-5-5",
          1000000,
          path,
          120000,
          "replace",
        )
      )?.context?.compactWindow,
    ).toBe(300000);
    const key = createHash("sha256").update("replace").digest("hex");
    writeFileSync(
      join(directory, "statusline", `claude-compact-${key}.json`),
      "{corrupt",
    );
    expect(
      (
        await parse(
          settings,
          "claude-opus-5-5",
          1000000,
          path,
          120000,
          "replace",
        )
      )?.context?.compactWindow,
    ).toBe(300000);
    expect(
      (await parse(settings, "claude-opus-5-5", 1000000, path + "-missing"))
        ?.context?.compactWindow,
    ).toBeUndefined();
  });
  test("dataframe computes the displayed percentage from the parsed window", async () => {
    const session = await parse(
      settings,
      "claude-opus-5-5",
      1000000,
      join(import.meta.dir, "fixtures/claude-autocompact.jsonl"),
    );
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
    const modelOnly = await parse(
      settings,
      "claude-opus-5-5",
      1000000,
      undefined,
      953000,
    );
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
      "Ctx: 95% (953k/1M)",
    );
    expect(
      (await parse("{}", "claude-opus-5-5", 0))?.context?.modelWindow,
    ).toBeUndefined();
  });
});
