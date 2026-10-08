import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { acquire, tryAcquire, type Holder } from "../src/dir-lock.ts";

function fixture(): { dir: string; lock: string } {
  const dir = mkdtempSync(join(import.meta.dir, "lock-"));
  return { dir, lock: join(dir, "state", "lock") };
}

const holder = (pid: number, what: string): Holder => ({
  pid,
  host: hostname(),
  what,
  since: Temporal.Now.instant().toString(),
});

describe("directory lock", () => {
  test("acquires an absent lock and releases only its own lock", () => {
    const { dir, lock } = fixture();
    const result = tryAcquire(lock, holder(process.pid, "test"));
    expect(result.ok).toBe(true);
    expect(existsSync(join(lock, "owner.json"))).toBe(true);
    if (result.ok) result.release();
    expect(existsSync(lock)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("waits for a live holder, then acquires", async () => {
    const { dir, lock } = fixture();
    const first = tryAcquire(lock, holder(process.pid, "first"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const pending = acquire(lock, holder(process.pid, "second"), {
      waitMs: 500,
      pollMs: 5,
      onWait: () => {
        setTimeout(first.release, 25);
      },
    });
    const secondRelease = await pending;
    expect(typeof secondRelease).toBe("function");
    if (typeof secondRelease === "function") secondRelease();
    expect(existsSync(lock)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("takes over a dead same-host holder", async () => {
    const { dir, lock } = fixture();
    mkdirSync(lock, { recursive: true });
    writeFileSync(
      join(lock, "owner.json"),
      `${JSON.stringify(holder(99_999_999, "dead"))}\n`,
    );
    const result = await acquire(lock, holder(process.pid, "replacement"), {
      waitMs: 50,
      pollMs: 5,
    });
    expect(typeof result).toBe("function");
    if (typeof result === "function") result();
    expect(existsSync(lock)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});
