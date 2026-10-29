import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sampler = join(import.meta.dir, "../src/sampler.ts");

test.each([false, true])(
  "sampler %s stale lock",
  async (stale) => {
    const home = mkdtempSync(join(tmpdir(), "sampler-lock-"));
    const lock = join(home, "runtime/lock");
    const state = join(home, "state/owner.json");
    mkdirSync(lock, { recursive: true });
    if (stale) {
      const old = (Temporal.Now.instant().epochMilliseconds - 120_000) / 1000;
      utimesSync(lock, old, old);
    }
    const child = Bun.spawn([process.execPath, sampler], {
      env: {
        ...process.env,
        HOME: home,
        STATUSLINE_SAMPLER_LOCK_DIR: lock,
        STATUSLINE_OWNER_STATE: state,
        STATUSLINE_CACHE_ROOT: join(home, "cache"),
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    });
    const [out, err, code] = await Promise.all([
      child.stdout.text(),
      child.stderr.text(),
      child.exited,
    ]);
    expect([code, out, err]).toEqual([0, "", ""]);
    expect(existsSync(state)).toBe(stale);
    expect(existsSync(lock)).toBe(!stale);
  },
  35_000,
);
