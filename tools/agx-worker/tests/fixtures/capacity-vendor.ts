#!/usr/bin/env bun
// Fake vendor binary. All waits are killed by the wrapper under test; no network calls.
import { appendFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const model = args[args.indexOf("-m") + 1] ?? "";
const mode = process.env.AGX_CAPACITY_FIXTURE;
if (process.env.AGX_CAPACITY_LOG !== undefined)
  await appendFile(process.env.AGX_CAPACITY_LOG, `${JSON.stringify(args)}\n`);
const emit = (event: unknown) =>
  process.stdout.write(`${JSON.stringify(event)}\n`);
if (mode === "claude" || mode === "claude-stderr") {
  emit({
    type: "system",
    subtype: "init",
    session_id: "claude-capacity-session",
  });
  const error = {
    type: "error",
    error: { type: "overloaded_error", message: "Overloaded" },
  };
  if (mode === "claude") emit(error);
  else process.stderr.write(`API Error: 529 ${JSON.stringify(error)}`);
  await Bun.sleep(60_000);
  process.exit(1);
}
emit({ type: "thread.started", thread_id: "capacity-thread" });
if (
  mode === "codex" ||
  mode === "stubborn" ||
  mode === "stderr" ||
  (mode === "sol-only" && model === "gpt-6.1-sol")
) {
  if (mode === "stubborn") process.on("SIGTERM", () => {});
  const message =
    "Selected model is at capacity. Please try a different model.";
  if (mode === "stderr") {
    process.stderr.write("Selected model is at ");
    await Bun.sleep(10);
    process.stderr.write("capacity. Please try a different model.");
  } else emit({ type: "turn.failed", error: { message } });
  await Bun.sleep(60_000);
  process.exit(1);
}
if (mode === "wait") {
  // Metadata/reconnect traffic is not a model answer and cannot renew the startup bound.
  for (let i = 0; i < 1000; i++) {
    emit({ type: "turn.started" });
    emit({ type: "error", message: "Reconnecting..." });
    await Bun.sleep(10);
  }
}
if (mode === "auth") {
  emit({ type: "turn.failed", error: { message: "401 Unauthorized" } });
  process.exit(1);
}
emit({
  type: "item.started",
  item: { type: "command_execution", command: "work" },
});
if (mode === "working") await Bun.sleep(1_500);
const output = args[args.indexOf("-o") + 1];
if (output !== undefined)
  await writeFile(
    output,
    JSON.stringify({
      summary: "done",
      changes: [],
      checks: [],
      for_coordinator: [],
      open: [],
    }),
  );
emit({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } });
