import { expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cliEnv } from "./fixtures/cli-env.ts";
import { tempRoot } from "./fixtures/temp.ts";

const script = resolve(import.meta.dir, "fixtures/slow-cli.ts");
const nowMs = () => Temporal.Now.instant().epochMilliseconds;
const waitFor = async (path: string, timeoutMs: number) => {
  const deadline = nowMs() + timeoutMs;
  while (!existsSync(path) && nowMs() < deadline) await Bun.sleep(10);
  return existsSync(path);
};
const startSlowCli = (root: string) => {
  const env = cliEnv(root);
  const ready = join(root, "scan-ready");
  const proc = Bun.spawn([process.execPath, script], {
    cwd: root,
    env: {
      ...env,
      RECLAIM_UNIT_PROC_ROOT: join(root, "proc"),
      RECLAIM_SLOW_READY: ready,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { proc, ready };
};
const guardProcess = (proc: ReturnType<typeof Bun.spawn>) => {
  const cleanup = new DisposableStack();
  cleanup.defer(() => {
    if (proc.exitCode === null) proc.kill("SIGKILL");
  });
  return cleanup;
};
const tempCleanup = (root: string) => {
  const cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(root, { recursive: true, force: true });
  });
  return cleanup;
};

test("SIGINT exits the real plan CLI and reaps its child during a slow scan", async () => {
  const root = tempRoot("reclaim-cancel-");
  using _cleanup = tempCleanup(root);
  const { proc, ready } = startSlowCli(root);
  using _processCleanup = guardProcess(proc);
  const started = nowMs();
  const pidFile = `${ready}.pid`;
  expect(await waitFor(pidFile, 5000), "slow target entered its scan").toBe(
    true,
  );
  const childPid = Number(readFileSync(pidFile, "utf8").trim());
  proc.kill("SIGINT");
  const code = await Promise.race([
    proc.exited,
    Bun.sleep(1900).then(() => null),
  ]);
  expect(code, "SIGINT should stop the process within two seconds").not.toBe(
    null,
  );
  expect(code).toBe(130);
  expect(nowMs() - started).toBeLessThan(2000);
  const stderr = await new Response(proc.stderr).text();
  expect(stderr).toContain("cancelled during scan");
  expect(() => process.kill(childPid, 0)).toThrow();
}, 10_000);

test("SIGTERM exits the real plan CLI with 143 and reaps its child", async () => {
  const root = tempRoot("reclaim-terminate-");
  using _cleanup = tempCleanup(root);
  const { proc, ready } = startSlowCli(root);
  using _processCleanup = guardProcess(proc);
  const pidFile = `${ready}.pid`;
  expect(await waitFor(pidFile, 5000), "slow target entered its scan").toBe(
    true,
  );
  const childPid = Number(readFileSync(pidFile, "utf8").trim());
  proc.kill("SIGTERM");
  const code = await Promise.race([
    proc.exited,
    Bun.sleep(1900).then(() => null),
  ]);
  expect(code).toBe(143);
  expect(() => process.kill(childPid, 0)).toThrow();
  const stderr = await new Response(proc.stderr).text();
  expect(stderr).toContain("cancelled during scan");
}, 10_000);

test("a second SIGINT forces exit while the first cancels scan work", async () => {
  const root = tempRoot("reclaim-double-interrupt-");
  using _cleanup = tempCleanup(root);
  const { proc, ready } = startSlowCli(root);
  using _processCleanup = guardProcess(proc);
  expect(
    await waitFor(`${ready}.pid`, 5000),
    "slow target entered its scan",
  ).toBe(true);
  proc.kill("SIGINT");
  proc.kill("SIGINT");
  const code = await Promise.race([
    proc.exited,
    Bun.sleep(1900).then(() => null),
  ]);
  expect(code).toBe(130);
  const stderr = await new Response(proc.stderr).text();
  expect(stderr.match(/cancelled during scan/gu)).toHaveLength(1);
}, 10_000);

test("SIGINT during deletion finishes only the active item and reports it", async () => {
  const root = tempRoot("reclaim-delete-cancel-");
  using _cleanup = tempCleanup(root);
  const env = cliEnv(root);
  const first = join(root, "first.item");
  const second = join(root, "second.item");
  const log = join(root, "actions.log");
  writeFileSync(first, "first");
  writeFileSync(second, "second");
  const proc = Bun.spawn([process.execPath, script], {
    cwd: root,
    env: {
      ...env,
      RECLAIM_UNIT_PROC_ROOT: join(root, "proc"),
      RECLAIM_SLOW_READY: join(root, "scan-ready"),
      RECLAIM_CANCEL_MODE: "delete",
      RECLAIM_ACT_LOG: log,
      RECLAIM_ITEM_ONE: first,
      RECLAIM_ITEM_TWO: second,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  using _processCleanup = guardProcess(proc);
  expect(await waitFor(log, 5000)).toBe(true);
  const startedBy = nowMs() + 5000;
  while (
    !readFileSync(log, "utf8").includes("item-1:start") &&
    nowMs() < startedBy
  )
    await Bun.sleep(10);
  expect(readFileSync(log, "utf8")).toContain("item-1:start");
  proc.kill("SIGINT");
  const code = await Promise.race([
    proc.exited,
    Bun.sleep(1900).then(() => null),
  ]);
  expect(code).toBe(130);
  expect(existsSync(first)).toBe(false);
  expect(existsSync(second)).toBe(true);
  expect(readFileSync(log, "utf8")).toContain("item-1:done");
  expect(readFileSync(log, "utf8")).not.toContain("item-2:");
  const stderr = await new Response(proc.stderr).text();
  expect(stderr).toContain("cancelled during deletion");
  expect(stderr).toContain(`deleted before cancellation: ${first}`);
}, 10_000);
