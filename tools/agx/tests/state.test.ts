import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseActiveMarker } from "../../shared/src/dispatch-state.ts";
import {
  briefLabel,
  STATE_SCHEMA,
  type Active,
  writeActiveMarker,
} from "../src/state.ts";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

// A worker's default label skips the dispatch declaration every brief starts with (Vast 2026-10-06:
// three Run rows all read "RESOURCE-CLASS(NONCOMPUTE): read").
test.each([
  [
    "RESOURCE-CLASS(NONCOMPUTE): edits only\n\n# Resolve one jj merge conflict\nbody",
    "Resolve one jj merge conflict",
  ],
  [
    "RESOURCE-ENVELOPE(/tmp/e.json): agent-resource-run only\n## Run R17\n",
    "Run R17",
  ],
  ["plain first line\nsecond", "plain first line"],
  ["RESOURCE-CLASS(NONCOMPUTE): only a declaration", ""],
])("%j → %j", (brief, label) => {
  expect(briefLabel(brief)).toBe(label);
});

test("active marker updates atomically retain phase, final usage, cost and worker session", () => {
  const root = mkdtempSync(join(tmpdir(), "agx-active-marker-"));
  roots.push(root);
  const path = join(root, "active.json");
  const active = {
    schema: STATE_SCHEMA,
    run_id: "run-fixture",
    pid: process.pid,
    label: "fixture worker",
    choice: "luna-high",
    pick_source: "resume",
    started_at: Temporal.Now.instant().toString(),
    cwd: root,
    dispatcher_session: "dispatcher-session",
    phase: "working",
    worker_session: "resumed-vendor-session",
  } satisfies Active;
  expect(writeActiveMarker(path, active)).toBe(true);
  expect(
    writeActiveMarker(path, {
      ...active,
      phase: "verifying 1/1 bun test",
      cost_usd: 0.0149,
      worker_usage: { input_tokens: 100, output_tokens: 20 },
    }),
  ).toBe(true);
  const parsed = parseActiveMarker(readFileSync(path, "utf8"));
  expect(parsed.kind).toBe("valid");
  if (parsed.kind === "valid")
    expect(parsed.marker).toMatchObject({
      phase: "verifying 1/1 bun test",
      worker_session: "resumed-vendor-session",
      cost_usd: 0.0149,
      worker_usage: { input_tokens: 100, output_tokens: 20 },
    });
});
