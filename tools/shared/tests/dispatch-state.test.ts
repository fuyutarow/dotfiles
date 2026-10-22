import { expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  ActiveMarkerReaderSchema,
  ActiveMarkerSchema,
  ProgressSchema,
  ProgressReaderSchema,
  dispatchStateDir,
  dispatchLegacyStateDir,
  dispatchStateReadDirs,
  parseActiveMarker,
  serializeActiveMarker,
  type Progress,
} from "../src/dispatch-state.ts";
import {
  malformedMarker,
  ownFreshMarker,
  unreadableMarker,
} from "./fixtures/active-markers.ts";

const progress = {
  schema: 1,
  at: "2026-10-10T12:53:23.049083Z",
  last: "$ bun test tools/statusline tools/shared",
  commands: 84,
  turns: 0,
  files: 3,
  session: "real-shaped-rollout-session",
} satisfies Progress;

test("progress writers are strict and readers ignore future fields", () => {
  expect(ProgressSchema.safeParse(progress).success).toBe(true);
  const future = { ...progress, future_progress_field: { events: 84 } };
  expect(ProgressSchema.safeParse(future).success).toBe(false);
  const read = ProgressReaderSchema.safeParse(future);
  expect(read.success).toBe(true);
  if (read.success) expect(read.data).toEqual(progress);
  const { turns: _turns, ...legacy } = progress;
  expect(ProgressSchema.safeParse(legacy).success).toBe(true);
  expect(ProgressReaderSchema.safeParse(legacy).success).toBe(true);
});

test.each([
  { turns: -1 },
  { turns: 1.5 },
  { commands: "84" },
  { commands: -1 },
  { files: -1 },
  { schema: 2 },
  { cost_usd: -1 },
  { usage: { input_tokens: -1 } },
])("progress readers still reject invalid known fields: %j", (invalid) => {
  expect(
    ProgressReaderSchema.safeParse({ ...progress, ...invalid }).success,
  ).toBe(false);
  expect(ProgressSchema.safeParse({ ...progress, ...invalid }).success).toBe(
    false,
  );
});

test.each([
  [{}, join(homedir(), ".local/state/agx")],
  [
    { AGX_STATE_DIR: "", XDG_STATE_HOME: "" },
    join(homedir(), ".local/state/agx"),
  ],
  [
    { XDG_STATE_HOME: "/fixture/state", AGX_STATE_DIR: "" },
    "/fixture/state/agx",
  ],
  [
    { AGX_STATE_DIR: "/fixture/isolated", XDG_STATE_HOME: "/fixture/state" },
    "/fixture/isolated",
  ],
])("state and legacy reads share one root: %j", (env, root) => {
  expect(dispatchStateDir(env)).toBe(root);
  expect(dispatchStateReadDirs(env)).toEqual([root]);
  expect(dispatchLegacyStateDir(env)).toBe(join(root, "legacy-v1"));
});

test("the strict writer and forward-compatible reader share the active marker contract", () => {
  const serialized = serializeActiveMarker(ownFreshMarker);
  expect(serialized.success).toBe(true);
  if (!serialized.success) return;
  const read = parseActiveMarker(serialized.text);
  expect(read.kind).toBe("valid");
  if (read.kind === "valid") {
    expect(read.marker.kind).toBe("token");
    expect(read.marker.labels).toEqual([]);
  }
  expect(
    ActiveMarkerSchema.safeParse({
      ...ownFreshMarker,
      future_marker_field: true,
    }).success,
  ).toBe(false);
  expect(
    serializeActiveMarker({ ...ownFreshMarker, future_marker_field: true })
      .success,
  ).toBe(false);
  const forward = ActiveMarkerReaderSchema.safeParse({
    ...ownFreshMarker,
    future_marker_field: true,
  });
  expect(forward.success).toBe(true);
  if (forward.success) expect(forward.data["future_marker_field"]).toBe(true);
});

test("marker parsing skips missing identities and counts other unreadable markers", () => {
  expect(parseActiveMarker(JSON.stringify(malformedMarker))).toEqual({
    kind: "malformed",
  });
  expect(parseActiveMarker(JSON.stringify(unreadableMarker)).kind).toBe(
    "unreadable",
  );
  expect(parseActiveMarker("{").kind).toBe("unreadable");
  expect(parseActiveMarker(JSON.stringify(ownFreshMarker)).kind).toBe("valid");
});

test("active markers retain post-worker phase, session, cost and usage", () => {
  const serialized = serializeActiveMarker({
    ...ownFreshMarker,
    phase: "verifying 2/3 bun test",
    worker_session: "resumed-vendor-session",
    cost_usd: 0.548,
    worker_usage: { input_tokens: 120, output_tokens: 30 },
  });
  expect(serialized.success).toBe(true);
  if (!serialized.success) return;
  const parsed = parseActiveMarker(serialized.text);
  expect(parsed.kind).toBe("valid");
  if (parsed.kind === "valid")
    expect(parsed.marker).toMatchObject({
      phase: "verifying 2/3 bun test",
      worker_session: "resumed-vendor-session",
      cost_usd: 0.548,
      worker_usage: { input_tokens: 120, output_tokens: 30 },
    });
});
