#!/usr/bin/env bun

import { appendFileSync } from "node:fs";
import { join } from "node:path";

// This call's argv (one JSON line) in `fake-claude-argv.log` in its cwd (the run's target), for tests
// of the flags run-claude passes.
appendFileSync(
  join(process.cwd(), "fake-claude-argv.log"),
  `${JSON.stringify(Bun.argv.slice(2))}\n`,
);

const modelIndex = Bun.argv.indexOf("--model");
const model = modelIndex === -1 ? "" : Bun.argv[modelIndex + 1];

if (model === "wait") {
  await Bun.sleep(10_000);
}

if (model === "reject") {
  process.stderr.write("model rejected\n");
  process.exit(1);
}

// --output-format stream-json: the event lines claude 2.1.290 prints (sampled 2026-10-06), then the
// result event, which carries what --output-format json would print.
// The result event for the model names that stand for a stop reason (claude 2.1.290 result shapes).
const stops: Record<string, Record<string, unknown>> = {
  "max-turns": {
    subtype: "error_max_turns",
    is_error: true,
    num_turns: 61,
    total_cost_usd: 0.4,
  },
  "max-budget": {
    subtype: "error_max_budget_usd",
    is_error: true,
    num_turns: 9,
    total_cost_usd: 2.01,
  },
  "exec-error": {
    subtype: "error_during_execution",
    is_error: true,
    num_turns: 3,
    total_cost_usd: 0.1,
  },
};
const structured = {
  result: "",
  structured_output: {
    summary: "typed",
    changes: [],
    checks: [],
    for_coordinator: [],
    open: [],
  },
};
const assistant = (content: unknown[]): string =>
  JSON.stringify({ type: "assistant", message: { content } });
const resultEvent = JSON.stringify({
  type: "result",
  subtype: "success",
  result: "OK",
  num_turns: 4,
  is_error: false,
  session_id: "fixture-session",
  total_cost_usd: 0,
  ...(model === "structured" ? structured : undefined),
  ...stops[model ?? ""],
});
const resultLines = model === "no-result" ? [] : [resultEvent];
if (Bun.argv.includes("stream-json")) {
  for (const line of [
    JSON.stringify({ type: "system", subtype: "init" }),
    assistant([
      {
        type: "tool_use",
        name: "Bash",
        input: { command: "bun test x.test.ts" },
      },
    ]),
    assistant([
      {
        type: "tool_use",
        name: "Edit",
        input: { file_path: "/w/src/kernel.ts" },
      },
    ]),
    assistant([{ type: "text", text: "done" }]),
    ...resultLines,
  ])
    process.stdout.write(`${line}\n`);
  process.exit(
    model === "no-result" || stops[model ?? ""] !== undefined ? 1 : 0,
  );
}

process.stdout.write(
  `${JSON.stringify({
    result: "OK",
    session_id: "fixture-session",
    total_cost_usd: 0,
    usage: { input_tokens: 1, output_tokens: 1 },
  })}\n`,
);
