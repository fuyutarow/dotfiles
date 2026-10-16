import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import type { Result } from "neverthrow";
import {
  acquireJuliaCompileSlot,
  defaultJuliaCompileSlots,
  juliaCompileSlotCapacity,
  type CompileSlotLease,
  type CompileSlotOptions,
} from "../src/lib/compile-slot.ts";

const directories: string[] = [];
const oldSlotsPath = process.env.AGENT_RESOURCE_SLOTS;

function stateDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "compile-slot-test-"));
  directories.push(directory);
  return directory;
}

function valueOf<T, E>(result: Result<T, E>): T {
  return result._unsafeUnwrap();
}

async function acquire(options: CompileSlotOptions): Promise<CompileSlotLease> {
  return valueOf(await acquireJuliaCompileSlot(options));
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  if (oldSlotsPath === undefined) delete process.env.AGENT_RESOURCE_SLOTS;
  else process.env.AGENT_RESOURCE_SLOTS = oldSlotsPath;
});

describe("Julia compile slots", () => {
  test("defaults to one slot per six host CPUs, with a floor of one", () => {
    expect(defaultJuliaCompileSlots()).toBe(
      Math.max(1, Math.floor(cpus().length / 6)),
    );
    expect(defaultJuliaCompileSlots()).toBeGreaterThanOrEqual(1);
  });

  test("reads an explicit host slot declaration", async () => {
    const path = join(stateDirectory(), "slots.toml");
    writeFileSync(path, "schema = 1\njulia_compile = 3\n");
    process.env.AGENT_RESOURCE_SLOTS = path;
    const capacity = await juliaCompileSlotCapacity();
    expect(capacity.isOk() ? capacity.value : null).toBe(3);
  });

  test("enforces capacity and reports the queue position while waiting", async () => {
    const directory = stateDirectory();
    const first = await acquire({
      stateDirectory: directory,
      capacity: 1,
    });
    const events: string[] = [];
    const secondPromise = acquire({
      stateDirectory: directory,
      capacity: 1,
      pollMs: 5,
      report: (line) => {
        events.push(line);
      },
    });
    await Bun.sleep(30);
    expect(
      events.some((line) =>
        line.startsWith("WAIT slot=julia-compile holders=1/1 ahead=0 "),
      ),
    ).toBe(true);
    first.release();
    const second = await secondPromise;
    second.release();
  });

  test("serves queued callers in FIFO order", async () => {
    const directory = stateDirectory();
    const first = await acquire({
      stateDirectory: directory,
      capacity: 1,
    });
    const entered: number[] = [];
    const firstWaiting = Promise.withResolvers<void>();
    const firstQueued = acquire({
      stateDirectory: directory,
      capacity: 1,
      pollMs: 5,
      report: () => {
        firstWaiting.resolve();
      },
    }).then((lease) => {
      entered.push(1);
      return lease;
    });
    await firstWaiting.promise;
    const secondWaiting = Promise.withResolvers<void>();
    let secondWaitMessage = "";
    const secondQueued = acquire({
      stateDirectory: directory,
      capacity: 1,
      pollMs: 5,
      report: (line) => {
        secondWaitMessage = line;
        secondWaiting.resolve();
      },
    }).then((lease) => {
      entered.push(2);
      return lease;
    });
    await secondWaiting.promise;
    expect(secondWaitMessage).toContain("ahead=1");
    first.release();
    const firstQueuedLease = await firstQueued;
    expect(entered).toEqual([1]);
    firstQueuedLease.release();
    const secondQueuedLease = await secondQueued;
    expect(entered).toEqual([1, 2]);
    secondQueuedLease.release();
  });

  test("reclaims a holder after its owner process crashes", async () => {
    const directory = stateDirectory();
    const source = new URL("../src/lib/compile-slot.ts", import.meta.url)
      .pathname;
    const script = `import { acquireJuliaCompileSlot } from ${JSON.stringify(source)}; const slot = await acquireJuliaCompileSlot({ stateDirectory: process.env.SLOT_DIR ?? "", capacity: 1 }); if (slot.isErr()) process.exit(1); process.stdout.write("READY\\n"); await new Promise(() => {});`;
    const child = Bun.spawn(["bun", "-e", script], {
      env: { ...process.env, SLOT_DIR: directory },
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = child.stdout.getReader();
    const ready = await output.read();
    expect(new TextDecoder().decode(ready.value)).toContain("READY");
    child.kill();
    await child.exited;
    const lease = await acquire({
      stateDirectory: directory,
      capacity: 1,
    });
    lease.release();
  });
});
