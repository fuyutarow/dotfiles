#!/usr/bin/env bun
// Fixture for doctor.test.ts "codex hook trust" — stands in for `codex app-server`, speaking the same
// stdio JSON-RPC subset the doctor drives: initialize, initialized, hooks/list. Never touches real
// Codex state.
//
// Env controls:
//   FAKE_HOOKS_LIST - fixture JSON file whose `result` answers hooks/list
//   FAKE_MODE       - "error": hooks/list answers a JSON-RPC error; "hang": hooks/list never answers
// The placeholder __HOOKS__ in the fixture becomes $CODEX_HOME/hooks.json, the path Codex reports
// for the copy it loaded.
import { readFile } from "node:fs/promises";
import { jsonText, z } from "../../../../agents/hooks/zod.ts";

const Request = z.object({
  id: z.number().optional(),
  method: z.string(),
});

const write = (message: unknown) =>
  process.stdout.write(`${JSON.stringify(message)}\n`);

async function listHooks(id: number): Promise<void> {
  if (process.env["FAKE_MODE"] === "hang") return;
  if (process.env["FAKE_MODE"] === "error") {
    write({ id, error: { code: -32000, message: "fake failure" } });
    return;
  }
  const codexHome = process.env["CODEX_HOME"] ?? "";
  const text = await readFile(process.env["FAKE_HOOKS_LIST"] ?? "", "utf8");
  const filled = text.split("__HOOKS__").join(`${codexHome}/hooks.json`);
  const result = jsonText.safeParse(filled);
  write(
    result.success
      ? { id, result: result.data }
      : { id, error: { code: -32001, message: "fixture is not JSON" } },
  );
}

async function handle(line: string): Promise<void> {
  const parsed = jsonText.safeParse(line);
  const request = Request.safeParse(parsed.success ? parsed.data : undefined);
  if (!request.success) return;
  const { id, method } = request.data;
  if (method === "initialize") {
    write({
      id,
      result: { userAgent: "fake-app-server", platformOs: "linux" },
    });
    return;
  }
  if (method === "hooks/list" && id !== undefined) await listHooks(id);
}

async function drain(lines: string[]): Promise<void> {
  for (const line of lines) {
    if (line.trim() !== "") await handle(line);
  }
}

const reader = Bun.stdin.stream().getReader();
const decoder = new TextDecoder();
let buffered = "";
for (
  let chunk = await reader.read();
  !chunk.done;
  chunk = await reader.read()
) {
  buffered += decoder.decode(chunk.value, { stream: true });
  const lines = buffered.split("\n");
  buffered = lines.pop() ?? "";
  await drain(lines);
}
