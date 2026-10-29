import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const modulePath = join(import.meta.dir, "../src/sampler-lock.ts");
const holder = `
  import { acquireSamplerLock } from ${JSON.stringify(modulePath)};
  await using owner = await acquireSamplerLock(process.env.TEST_LOCK);
  console.log(owner === undefined ? "skip" : "owner");
  if (owner !== undefined) await Bun.stdin.text();
`;

function spawn(lock: string) {
  const child = Bun.spawn([process.execPath, "-e", holder], {
    env: { ...process.env, TEST_LOCK: lock },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const reader = child.stdout.getReader();
  const result = reader
    .read()
    .then(({ value }) => new TextDecoder().decode(value).trim());
  return { child, result };
}

test("interrupted owner is recovered on the next run", async () => {
  const lock = join(mkdtempSync(join(tmpdir(), "sampler-lock-")), "lock");
  const first = spawn(lock);
  expect(await first.result).toBe("owner");
  expect(Number(readFileSync(join(lock, "pid"), "utf8"))).toBe(first.child.pid);
  first.child.kill("SIGKILL");
  await first.child.exited;
  expect(existsSync(lock)).toBe(true);
  const next = spawn(lock);
  expect(await next.result).toBe("owner");
  await next.child.stdin.end();
  expect(await next.child.exited).toBe(0);
  expect(existsSync(lock)).toBe(false);
}, 10_000);

test("live owner excludes another sampler", async () => {
  const lock = join(mkdtempSync(join(tmpdir(), "sampler-lock-")), "lock");
  const first = spawn(lock);
  expect(await first.result).toBe("owner");
  const next = spawn(lock);
  expect(await next.result).toBe("skip");
  expect(await next.child.exited).toBe(0);
  await first.child.stdin.end();
  expect(await first.child.exited).toBe(0);
}, 10_000);

test("concurrent racers recover a stale lock with exactly one owner", async () => {
  const lock = join(mkdtempSync(join(tmpdir(), "sampler-lock-")), "lock");
  const first = spawn(lock);
  expect(await first.result).toBe("owner");
  first.child.kill("SIGKILL");
  await first.child.exited;
  const racers = Array.from({ length: 12 }, () => spawn(lock));
  const results = await Promise.all(racers.map((racer) => racer.result));
  expect(results.filter((result) => result === "owner")).toHaveLength(1);
  expect(results.filter((result) => result === "skip")).toHaveLength(11);
  for (const racer of racers) await racer.child.stdin.end();
  expect(await Promise.all(racers.map((racer) => racer.child.exited))).toEqual(
    Array.from({ length: 12 }, () => 0),
  );
}, 10_000);

test("sampler publishes after an interrupted owner", async () => {
  const home = mkdtempSync(join(tmpdir(), "sampler-lock-"));
  const lock = join(home, "runtime/lock");
  const state = join(home, "state/owner.json");
  const first = spawn(lock);
  expect(await first.result).toBe("owner");
  first.child.kill("SIGKILL");
  await first.child.exited;
  const sampler = Bun.spawn(
    [process.execPath, join(import.meta.dir, "../src/sampler.ts")],
    {
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
    },
  );
  const [out, err, code] = await Promise.all([
    sampler.stdout.text(),
    sampler.stderr.text(),
    sampler.exited,
  ]);
  expect([code, out, err]).toEqual([0, "", ""]);
  expect(existsSync(state)).toBe(true);
}, 35_000);
