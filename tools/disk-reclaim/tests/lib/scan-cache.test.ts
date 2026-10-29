import { afterAll, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  MAX_SCAN_CACHE_ENTRIES,
  defaultScanCacheDir,
  scanCache,
} from "../../src/lib/scan-cache.ts";
import { tempRoot } from "../fixtures/temp.ts";

const root = tempRoot("reclaim-scan-cache-");
const cacheRoot = join(root, "cache");
const scanned = join(root, "scanned");
mkdirSync(scanned);
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

test("default cache follows XDG cache storage and ignores reclaim state", () => {
  const previousCache = process.env["XDG_CACHE_HOME"];
  const previousState = process.env["RECLAIM_STATE_DIR"];
  using restore = new DisposableStack();
  restore.defer(() => {
    if (previousCache === undefined) delete process.env["XDG_CACHE_HOME"];
    else process.env["XDG_CACHE_HOME"] = previousCache;
    if (previousState === undefined) delete process.env["RECLAIM_STATE_DIR"];
    else process.env["RECLAIM_STATE_DIR"] = previousState;
  });
  const xdg = join(root, "xdg-cache");
  const state = join(root, "state");
  process.env["XDG_CACHE_HOME"] = xdg;
  process.env["RECLAIM_STATE_DIR"] = state;
  expect(defaultScanCacheDir()).toBe(join(xdg, "disk-reclaim"));
  scanCache(scanned, "default", { mode: "plan", log: () => {} }).save(
    "fixture",
  );
  expect(readdirSync(join(xdg, "disk-reclaim", "scan-cache"))).toHaveLength(1);
  expect(existsSync(join(state, "scan-cache"))).toBe(false);
  process.env["XDG_CACHE_HOME"] = "";
  expect(defaultScanCacheDir()).toBe(join(homedir(), ".cache", "disk-reclaim"));
});

test("scan cache evicts the oldest entries to its fixed entry cap", () => {
  const cacheDir = join(cacheRoot, "scan-cache");
  mkdirSync(cacheDir, { recursive: true });
  for (let index = 0; index < MAX_SCAN_CACHE_ENTRIES; index += 1) {
    const name = `old-${String(index).padStart(4, "0")}.json`;
    const path = join(cacheDir, name);
    writeFileSync(path, "{}");
    utimesSync(path, 1, 1);
  }

  scanCache(scanned, "new-entry", {
    mode: "plan",
    scanCacheDir: cacheRoot,
    log: () => {},
  }).save(["fresh"]);

  const entries = readdirSync(cacheDir).filter((name) =>
    name.endsWith(".json"),
  );
  expect(entries.length).toBeLessThanOrEqual(MAX_SCAN_CACHE_ENTRIES);
  expect(existsSync(join(cacheDir, "old-0000.json"))).toBe(false);
});
