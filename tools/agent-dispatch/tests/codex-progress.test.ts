import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../shared/src/zod.ts";
import {
  emptyTally,
  foldEvent,
  progressWriter,
  toProgress,
} from "../src/workers/codex-progress.ts";

// codex-progress: the fold from `codex exec --json` lines to the statusline's progress record.

const ev = (o: unknown): string => JSON.stringify(o);
const fold = (lines: string[]) =>
  lines.reduce((t, l) => foldEvent(t, l), emptyTally());

describe("foldEvent", () => {
  test("a started command is the latest activity and counts once", () => {
    const t = fold([
      ev({
        type: "item.started",
        item: { type: "command_execution", command: "bun test x.test.ts" },
      }),
      ev({
        type: "item.completed",
        item: { type: "command_execution", command: "bun test x.test.ts" },
      }),
    ]);
    expect(t.last).toBe("$ bun test x.test.ts");
    expect(t.commands).toBe(1);
  });

  test("codex's shell wrapper is dropped so the command itself is shown", () => {
    const run = (command: string) =>
      fold([
        ev({
          type: "item.started",
          item: { type: "command_execution", command },
        }),
      ]).last;
    expect(run(`/bin/zsh -lc "rr regex --context 14 -p cli.ts"`)).toBe(
      "$ rr regex --context 14 -p cli.ts",
    );
    expect(run(`/bin/bash -lc 'bun test x.test.ts'`)).toBe(
      "$ bun test x.test.ts",
    );
    expect(run("bash -c 'ls'")).toBe("$ ls");
    // not a wrapper (no -c, or mismatched quotes): shown unchanged
    expect(run("zsh script.zsh")).toBe("$ zsh script.zsh");
    expect(run(`/bin/zsh -lc "unterminated'`)).toBe(
      `$ /bin/zsh -lc "unterminated'`,
    );
  });

  test("file changes count distinct paths and name the latest file", () => {
    const t = fold([
      ev({
        type: "item.completed",
        item: {
          type: "file_change",
          changes: [{ path: "/w/a.ts" }, { path: "/w/b.ts" }],
        },
      }),
      ev({
        type: "item.completed",
        item: { type: "file_change", changes: [{ path: "/w/a.ts" }] },
      }),
    ]);
    expect(t.last).toBe("✎ a.ts");
    expect(t.files.size).toBe(2);
  });

  test("an agent message shows its first line, cut at 72 characters", () => {
    const long = `${"x".repeat(100)}\nsecond line`;
    const t = fold([
      ev({
        type: "item.completed",
        item: { type: "agent_message", text: long },
      }),
    ]);
    expect(t.last).toBe(`“${"x".repeat(71)}…”`);
  });

  test("a web search shows its query", () => {
    const t = fold([
      ev({
        type: "item.completed",
        item: { type: "web_search", query: "oxlint no-throw" },
      }),
    ]);
    expect(t.last).toBe("⌕ oxlint no-throw");
  });

  test("non-JSON lines and unrelated events leave the tally unchanged", () => {
    const before = fold([
      ev({
        type: "item.started",
        item: { type: "command_execution", command: "ls" },
      }),
    ]);
    const after = [
      "not json",
      ev({ type: "turn.completed" }),
      ev({ type: "item.started", item: { type: "reasoning" } }),
      ev({
        type: "item.completed",
        item: { type: "file_change", changes: [] },
      }),
    ].reduce((t, l) => foldEvent(t, l), before);
    expect(after).toEqual(before);
  });
});

test("turn completion adds cumulative usage to progress", () => {
  const t = fold([
    ev({
      type: "turn.completed",
      usage: {
        input_tokens: 100,
        cached_input_tokens: 40,
        output_tokens: 20,
        reasoning_output_tokens: 5,
      },
    }),
  ]);
  expect(toProgress(t, "2026-10-06T00:00:00Z").usage).toEqual({
    input_tokens: 100,
    cached_input_tokens: 40,
    output_tokens: 20,
    reasoning_output_tokens: 5,
  });
});

test("progress writer persists usage and row-priced cost immediately", () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-progress-cost-"));
  using _cleanup = {
    [Symbol.dispose]: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
  const path = join(dir, "worker.progress.json");
  const writer = progressWriter(path, undefined, {
    input: 2,
    cachedInput: 0.2,
    output: 10,
  });
  writer.feed(
    ev({
      type: "turn.completed",
      usage: { input_tokens: 1_000_000, output_tokens: 100_000 },
    }),
  );
  const progress = jsonOf(
    z.looseObject({
      usage: z.looseObject({ input_tokens: z.number() }).optional(),
      cost_usd: z.number().optional(),
    }),
  ).safeParse(readFileSync(path, "utf8"));
  expect(progress.success ? progress.data.usage?.input_tokens : undefined).toBe(
    1_000_000,
  );
  expect(progress.success ? progress.data.cost_usd : undefined).toBeCloseTo(
    3,
    10,
  );
});

test("toProgress is the state.ts record: counts, not the path set", () => {
  const t = fold([
    ev({
      type: "item.started",
      item: { type: "command_execution", command: "ls" },
    }),
    ev({
      type: "item.completed",
      item: { type: "file_change", changes: [{ path: "a" }] },
    }),
  ]);
  expect(toProgress(t, "2026-10-06T00:00:00Z")).toEqual({
    schema: 1,
    at: "2026-10-06T00:00:00Z",
    last: "✎ a",
    commands: 1,
    files: 1,
  });
});

// I1 (2026-10-06): codex names its thread on the first event; the tally keeps it so the Run row
// and the receipt can name the worker the way codex itself does (`codex exec resume <id>`).
test("thread.started's thread_id is the session id, kept in the progress record", () => {
  const t = fold([
    ev({
      type: "thread.started",
      thread_id: "01a1111b-7dab-7d61-8f9b-231c4cc9568a",
    }),
    ev({
      type: "item.started",
      item: { type: "command_execution", command: "ls" },
    }),
  ]);
  expect(t.session).toBe("01a1111b-7dab-7d61-8f9b-231c4cc9568a");
  expect(toProgress(t, "2026-10-06T00:00:00Z").session).toBe(
    "01a1111b-7dab-7d61-8f9b-231c4cc9568a",
  );
  expect(fold([]).session).toBeUndefined();
});
