#!/usr/bin/env bun

// An empty export makes this file a module: top-level await and file-scoped consts.
export {};

const modelIndex = Bun.argv.indexOf("--model");
const model = modelIndex === -1 ? "" : Bun.argv[modelIndex + 1];

if (model === "wait") {
  await Bun.sleep(10_000);
}

if (model === "reject") {
  process.stderr.write("model rejected\n");
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  result: "OK",
  session_id: "fixture-session",
  total_cost_usd: 0,
  usage: { input_tokens: 1, output_tokens: 1 },
})}\n`);
