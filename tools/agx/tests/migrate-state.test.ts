import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateState } from "../src/migrate-state.ts";

const scratch: string[] = [];
const fixture = () => {
  const base = mkdtempSync(join(tmpdir(), "agx-migration-"));
  scratch.push(base);
  return {
    base,
    previous: join(base, ["agent", "router"].join("-")),
    current: join(base, "agx"),
  };
};
afterEach(() => {
  for (const path of scratch.splice(0))
    rmSync(path, { recursive: true, force: true });
});

test("moves the whole state once, preserving run log, incidents and markers", async () => {
  const { base, previous, current } = fixture();
  mkdirSync(join(previous, "active"), { recursive: true });
  writeFileSync(join(previous, "runs.jsonl"), "private run log\n");
  writeFileSync(join(previous, "incidents.jsonl"), "incident\n");
  writeFileSync(
    join(previous, "active/dead.json"),
    JSON.stringify({ run_id: "dead", pid: 2147483647 }),
  );
  writeFileSync(join(previous, "active/dead.progress.json"), "{}");
  expect(await migrateState(base)).toBe(`OK: moved ${previous} -> ${current}`);
  expect(existsSync(previous)).toBe(false);
  expect(readFileSync(join(current, "runs.jsonl"), "utf8")).toBe(
    "private run log\n",
  );
  expect(readFileSync(join(current, "incidents.jsonl"), "utf8")).toBe(
    "incident\n",
  );
  expect(existsSync(join(current, "active/dead.json"))).toBe(true);
  expect(await migrateState(base)).toContain("nothing to move");
});

test("names every live run and leaves its state untouched", async () => {
  const { base, previous, current } = fixture();
  mkdirSync(join(previous, "active"), { recursive: true });
  for (const run_id of ["live-a", "live-b"])
    writeFileSync(
      join(previous, "active", `${run_id}.json`),
      JSON.stringify({ run_id, pid: process.pid }),
    );
  expect(await migrateState(base)).toContain("live run ids: live-a, live-b");
  expect(existsSync(previous)).toBe(true);
  expect(existsSync(current)).toBe(false);
});

test("refuses two existing directories and corrupt run markers", async () => {
  const { base, previous, current } = fixture();
  mkdirSync(previous);
  mkdirSync(current);
  expect(await migrateState(base)).toContain("both");
  expect(existsSync(previous)).toBe(true);
  rmSync(current, { recursive: true });
  mkdirSync(join(previous, "active"));
  writeFileSync(join(previous, "active/broken.json"), "invalid json");
  expect(await migrateState(base)).toContain("unreadable run marker");
  expect(existsSync(current)).toBe(false);
});
