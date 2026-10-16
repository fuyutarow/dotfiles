import { afterEach, expect, test } from "bun:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir, cpus } from "node:os";
import { join } from "node:path";
import {
  acquireJuliaCompileSlot,
  compileSlotStatus,
} from "../src/lib/compile-slot.ts";

const directories: string[] = [];
const oldSlotsPath = process.env.AGENT_RESOURCE_SLOTS;
const runner = new URL("../src/agent-resource-run.ts", import.meta.url)
  .pathname;

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
  if (oldSlotsPath === undefined) delete process.env.AGENT_RESOURCE_SLOTS;
  else process.env.AGENT_RESOURCE_SLOTS = oldSlotsPath;
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "arr-status-"));
  directories.push(directory);
  const config = join(directory, "slots.toml");
  await writeFile(config, "schema = 1\njulia_compile = 2\n");
  process.env.AGENT_RESOURCE_SLOTS = config;
  return {
    directory,
    config,
    slots: join(directory, "agent-resource-control", "slots"),
  };
}

async function statusCommand(
  directory: string,
  config: string,
  args: string[] = [],
) {
  const child = Bun.spawn(["bun", runner, "status", ...args], {
    env: {
      ...process.env,
      XDG_RUNTIME_DIR: directory,
      AGENT_RESOURCE_SLOTS: config,
      AGENT_RESOURCE_POLICY: join(directory, "no-policy.toml"),
    },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5_000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}

test("status prints two holders and three FIFO waiters with identities and since-times, without changing state", async () => {
  const { directory, config, slots } = await fixture();
  const leases = [];
  for (let index = 1; index <= 2; index++) {
    leases.push(
      (
        await acquireJuliaCompileSlot({
          stateDirectory: slots,
          capacity: 2,
          jobId: `holder-${index}`,
          unit: "fixture.service",
        })
      )._unsafeUnwrap(),
    );
  }
  const events: string[] = [];
  const pending = [];
  for (let index = 1; index <= 3; index++) {
    const waiting = Promise.withResolvers<void>();
    pending.push(
      acquireJuliaCompileSlot({
        stateDirectory: slots,
        capacity: 2,
        jobId: `waiter-${index}`,
        unit: "fixture.service",
        pollMs: 10,
        report: (line) => {
          events.push(line);
          if (line.startsWith("WAIT ")) waiting.resolve();
        },
      }),
    );
    await waiting.promise;
  }
  const queueDir = join(slots, "julia-compile", "queue");
  const holderDir = join(slots, "julia-compile", "holders");
  const snapshot = async () =>
    Promise.all(
      [queueDir, holderDir].map(async (path) =>
        Promise.all(
          (await readdir(path))
            .toSorted()
            .map(async (name) => [
              name,
              await readFile(join(path, name), "utf8"),
            ]),
        ),
      ),
    );
  const before = await snapshot();
  const status = await statusCommand(directory, config);
  const after = await snapshot();
  // Always drain fixture jobs before assertions/cleanup; these never use the live slot directory.
  for (const lease of leases) lease.release();
  for (const promise of pending) (await promise)._unsafeUnwrap().release();

  expect(status.exit).toBe(0);
  expect(status.stderr).toBe("");
  expect(after).toEqual(before);
  expect(status.stdout).toContain(
    `capacity=2 source=${JSON.stringify(`${config}:julia_compile`)} holders=2 queued=3`,
  );
  const lines = status.stdout.trim().split("\n");
  expect(lines).toHaveLength(6);
  for (let index = 1; index <= 2; index++)
    expect(lines[index]).toMatch(
      new RegExp(
        `^HOLDER .*pid=${process.pid} unit="fixture.service" job="holder-${index}" .*since=\\d{4}-.*Z$`,
        "u",
      ),
    );
  for (let index = 1; index <= 3; index++) {
    expect(lines[index + 2]).toMatch(
      new RegExp(
        `^QUEUE .*position=${index} pid=${process.pid} unit="fixture.service" job="waiter-${index}" .*since=\\d{4}-.*Z$`,
        "u",
      ),
    );
    const wait = events.find(
      (line) =>
        line.startsWith("WAIT ") && line.includes(`job="waiter-${index}"`),
    );
    const acquired = events.find(
      (line) =>
        line.startsWith("ACQUIRED ") && line.includes(`job="waiter-${index}"`),
    );
    const waitingSince = wait?.match(/waiting-since=(\S+)/u)?.[1];
    const acquiredAt = acquired?.match(/acquired-at=(\S+)/u)?.[1];
    expect(waitingSince).toBeDefined();
    expect(acquiredAt).toBeDefined();
    expect(acquired).toContain(`waiting-since=${waitingSince}`);
    expect(
      Temporal.Instant.from(acquiredAt ?? "").epochMilliseconds,
    ).toBeGreaterThanOrEqual(
      Temporal.Instant.from(waitingSince ?? "").epochMilliseconds,
    );
  }
});

test("status reports the derived default and formula for an unused pool without creating state", async () => {
  const { directory } = await fixture();
  const result = await statusCommand(
    directory,
    join(directory, "missing.toml"),
  );
  expect(result.exit).toBe(0);
  expect(result.stdout).toContain(
    `capacity=${Math.max(1, Math.floor(cpus().length / 6))}`,
  );
  expect(result.stdout).toContain(
    'source="derived default: max(1, floor(host CPU count / 6))',
  );
  expect(result.stdout).toContain("holders=0 queued=0");
  expect(await readdir(directory)).toEqual(["slots.toml"]);
});

test("legacy entries remain visible and dead entries are left untouched", async () => {
  const { slots } = await fixture();
  const queue = join(slots, "julia-compile", "queue");
  await mkdir(queue, { recursive: true });
  const legacy = JSON.stringify({
    pid: process.pid,
    token: "legacy",
    created_at: 1000,
  });
  const dead = JSON.stringify({
    pid: 2147483647,
    token: "dead",
    created_at: 0,
  });
  await writeFile(join(queue, "legacy.json"), legacy);
  await writeFile(join(queue, "dead.json"), dead);
  const result = (await compileSlotStatus(slots))._unsafeUnwrap();
  expect(result).toContain("position=1");
  expect(result).toContain(
    'unit="unknown" job="unknown" token=legacy since=1970-01-01T00:00:01.000Z',
  );
  expect(result).not.toContain("token=dead");
  expect(await readFile(join(queue, "dead.json"), "utf8")).toBe(dead);
});

test("status refuses invalid capacity declarations and extra operands", async () => {
  const { directory, config } = await fixture();
  expect((await statusCommand(directory, config, ["unexpected"])).exit).toBe(2);
  await writeFile(config, "schema = 1\njulia_compile = 0\n");
  const result = await statusCommand(directory, config);
  expect(result.exit).toBe(70);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("positive julia_compile count");
});

test("status fails visibly on malformed queue entries rather than omitting a waiter", async () => {
  const { slots } = await fixture();
  const queue = join(slots, "julia-compile", "queue");
  await mkdir(queue, { recursive: true });
  await writeFile(join(queue, "broken.json"), "{");
  expect((await compileSlotStatus(slots))._unsafeUnwrapErr().message).toContain(
    "invalid slot entry",
  );
});
