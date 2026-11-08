import { expect, test } from "bun:test";
import {
  closeSync,
  ftruncateSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  inspectRipGraveyard,
  RIP_GRAVEYARD_MAX_BYTES,
  discoverRipGraveyards,
} from "../../src/lib/graveyards.ts";

test("discovers only valid records within bounded roots without following links", async () => {
  const home = mkdtempSync(join(tmpdir(), "foreign-graveyard-"));
  const graveyard = join(home, "Workspace/project.ws/.graveyard-gc");
  const invalid = join(home, "Workspace/project.ws/not-graveyard");
  const outside = join(home, "outside");
  mkdirSync(graveyard, { recursive: true });
  mkdirSync(invalid, { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(
    join(graveyard, ".record"),
    `2000-01-01T00:00:00Z\t/source\t${join(graveyard, "old")}\n`,
  );
  writeFileSync(
    join(invalid, ".record"),
    `2000-01-01T00:00:00Z\t/source\t${join(outside, "old")}\n`,
  );
  writeFileSync(
    join(outside, ".record"),
    `2000-01-01T00:00:00Z\t/source\t${join(outside, "old")}\n`,
  );
  symlinkSync(outside, join(home, "Workspace/link"));
  expect(await discoverRipGraveyards(home)).toEqual([graveyard]);
  rmSync(home, { recursive: true, force: true });
});

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
