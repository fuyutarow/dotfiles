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
const assistant = (content: unknown[]): string =>
  JSON.stringify({ type: "assistant", message: { content } });
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
    JSON.stringify({
      type: "result",
      subtype: "success",
      result: "OK",
      session_id: "fixture-session",
      total_cost_usd: 0,
    }),
  ])
    process.stdout.write(`${line}\n`);
  process.exit(0);
}

process.stdout.write(
  `${JSON.stringify({
    result: "OK",
    session_id: "fixture-session",
    total_cost_usd: 0,
    usage: { input_tokens: 1, output_tokens: 1 },
  })}\n`,
);
