import { expect, test } from "bun:test";
import {
  closeSync,
  ftruncateSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  inspectRipGraveyard,
  RIP_GRAVEYARD_MAX_BYTES,
} from "../../src/lib/graveyards.ts";

test("a bounded graveyard scan measures a sparse file above the safety limit", async () => {
  const root = mkdtempSync(join(tmpdir(), "graveyard-bounded-"));
  const entry = join(root, "large-file");
  writeFileSync(entry, "");
  const fd = openSync(entry, "r+");
  ftruncateSync(fd, RIP_GRAVEYARD_MAX_BYTES + 1);
  closeSync(fd);

  const measured = await inspectRipGraveyard(root);
  expect(measured.complete).toBe(true);
  expect(measured.bytes).toBeGreaterThan(RIP_GRAVEYARD_MAX_BYTES);
  expect(measured.visited).toBeGreaterThan(0);
  rmSync(root, { recursive: true, force: true });
});

test("a zero-time budget reports an incomplete lower bound", async () => {
  const root = mkdtempSync(join(tmpdir(), "graveyard-timeout-"));
  mkdirSync(join(root, "nested"));
  writeFileSync(join(root, "nested", "entry"), "content");

  const measured = await inspectRipGraveyard(root, 0);
  expect(measured).toMatchObject({
    bytes: 0,
    complete: false,
    timedOut: true,
    visited: 0,
  });
  rmSync(root, { recursive: true, force: true });
});
