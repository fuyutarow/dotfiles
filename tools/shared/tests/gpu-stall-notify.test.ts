import { afterEach, expect, test } from "bun:test";
import { err, ok } from "neverthrow";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  gpuStallNotificationCommand,
  notifyGpuStall,
  pendingGpuStall,
} from "../src/gpu-stall-notify.ts";
import { ownerState } from "./gpu-owner-fixture.ts";

const at = 1_792_368_000_000;
const healthy = ownerState(at);
const stalled = { ...healthy, unresponsiveSince: at };
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "gpu-stall-notify-"));
  dirs.push(dir);
  return {
    dir,
    statePath: join(dir, "gpu-owner.json"),
    receiptPath: join(dir, "gpu-stall-notified.json"),
  };
}

test.each([
  ["missing", undefined, undefined, undefined],
  ["malformed", { unresponsiveSince: at }, undefined, undefined],
  ["healthy omitted", healthy, undefined, undefined],
  [
    "healthy null",
    { ...healthy, unresponsiveSince: null },
    undefined,
    undefined,
  ],
  ["first stall", stalled, undefined, at],
  ["same stall", stalled, { unresponsiveSince: at }, undefined],
  [
    "later stall",
    { ...stalled, unresponsiveSince: at + 60_000 },
    { unresponsiveSince: at },
    at + 60_000,
  ],
  [
    "invalid timestamp",
    { ...stalled, unresponsiveSince: "today" },
    undefined,
    undefined,
  ],
] as const)("decision fixture: %s", (_name, state, receipt, expected) => {
  expect(pendingGpuStall(state, receipt)).toBe(expected);
});

test("persists one successful notification per stall across recovery and restarts", async () => {
  const f = await fixture();
  const sent: number[] = [];
  const options = {
    ...f,
    send: (since: number) => {
      sent.push(since);
      return Promise.resolve(ok(undefined));
    },
  };
  expect((await notifyGpuStall(options)).unwrapOr(undefined)).toBe(false);
  await Bun.write(
    f.statePath,
    JSON.stringify({ ...healthy, unresponsiveSince: null }),
  );
  expect((await notifyGpuStall(options)).unwrapOr(undefined)).toBe(false);
  await Bun.write(f.statePath, JSON.stringify(stalled));
  expect((await notifyGpuStall(options)).unwrapOr(undefined)).toBe(true);
  expect(await Bun.file(f.receiptPath).text()).toContain(String(at));
  expect((await notifyGpuStall(options)).unwrapOr(undefined)).toBe(false);
  await Bun.write(f.statePath, JSON.stringify(healthy));
  expect((await notifyGpuStall(options)).unwrapOr(undefined)).toBe(false);
  await Bun.write(
    f.statePath,
    JSON.stringify({ ...stalled, unresponsiveSince: at + 60_000 }),
  );
  expect((await notifyGpuStall(options)).unwrapOr(undefined)).toBe(true);
  expect(sent).toEqual([at, at + 60_000]);
});

test("a failed notification leaves the stall pending for the next state change", async () => {
  const f = await fixture();
  await Bun.write(f.statePath, JSON.stringify(stalled));
  const failed = await notifyGpuStall({
    ...f,
    send: () => Promise.resolve(err(new Error("desktop unavailable"))),
  });
  expect(failed.isErr()).toBe(true);
  expect(await Bun.file(f.receiptPath).exists()).toBe(false);
  expect(
    (
      await notifyGpuStall({ ...f, send: () => Promise.resolve(ok(undefined)) })
    ).unwrapOr(undefined),
  ).toBe(true);
});

test("malformed owner state or receipt cannot send or overwrite a receipt", async () => {
  const f = await fixture();
  let sent = 0;
  const options = {
    ...f,
    send: () => {
      sent++;
      return Promise.resolve(ok(undefined));
    },
  };
  await Bun.write(f.statePath, "{");
  expect((await notifyGpuStall(options)).isErr()).toBe(true);
  await Bun.write(f.statePath, JSON.stringify(stalled));
  await Bun.write(f.receiptPath, "{");
  expect((await notifyGpuStall(options)).isErr()).toBe(true);
  expect(sent).toBe(0);
  expect(await Bun.file(f.receiptPath).text()).toBe("{");
});

test("notification commands name the time and diagnostic; WSL always targets Windows", () => {
  const linux = gpuStallNotificationCommand(
    at,
    false,
    (name) => `/fixture/${name}`,
  ).unwrapOr([]);
  expect(linux.slice(0, 3)).toEqual([
    "/fixture/notify-send",
    "--urgency=critical",
    "GPU stall",
  ]);
  expect(linux[3]).toContain(
    Temporal.Instant.fromEpochMilliseconds(at).toString(),
  );
  expect(linux[3]).toContain("gpu-sampler --check");
  const windows = gpuStallNotificationCommand(at, true, (name) =>
    name === "powershell.exe" ? "/fixture/powershell.exe" : null,
  ).unwrapOr([]);
  expect(windows.slice(0, 4)).toEqual([
    "/fixture/powershell.exe",
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
  ]);
  const script = Buffer.from(windows[4] ?? "", "base64").toString("utf16le");
  expect(script).toContain("ToastNotificationManager");
  expect(script).toContain(
    Temporal.Instant.fromEpochMilliseconds(at).toString(),
  );
  expect(script).toContain("gpu-sampler --check");
  expect(gpuStallNotificationCommand(at, true, () => null).isErr()).toBe(true);
  expect(gpuStallNotificationCommand(at, false, () => null).isErr()).toBe(true);
  const fallback =
    "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
  expect(
    gpuStallNotificationCommand(at, true, (name) =>
      name === fallback ? fallback : null,
    ).unwrapOr([])[0],
  ).toBe(fallback);
});

test("service entrypoint sends through fixture executables once across separate processes", async () => {
  const f = await fixture();
  const log = join(f.dir, "notifications.jsonl");
  for (const name of ["notify-send", "powershell.exe"]) {
    const binary = join(f.dir, name);
    await Bun.write(
      binary,
      `#!${process.execPath}\nawait Bun.write(Bun.file(process.env.NOTIFICATION_LOG), (await Bun.file(process.env.NOTIFICATION_LOG).text().catch(() => "")) + JSON.stringify(process.argv.slice(2)) + "\\n");\nprocess.exit(Number(process.env.NOTIFICATION_EXIT ?? 0));\n`,
    );
    await chmod(binary, 0o755);
  }
  await Bun.write(f.statePath, JSON.stringify(stalled));
  async function run(exit = "0") {
    const child = Bun.spawn(
      [process.execPath, join(import.meta.dir, "../src/gpu-stall-notify.ts")],
      {
        env: {
          ...process.env,
          XDG_STATE_HOME: f.dir,
          PATH: f.dir,
          NOTIFICATION_LOG: log,
          NOTIFICATION_EXIT: exit,
        },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 10_000,
      },
    );
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { code, stdout, stderr };
  }
  const failed = await run("1");
  expect(failed.code).toBe(2);
  expect(failed.stderr).toContain("receipt not recorded");
  expect(await Bun.file(f.receiptPath).exists()).toBe(false);
  expect((await run()).stdout).toContain("sent");
  expect(await run()).toEqual({
    code: 0,
    stdout: "GPU stall notification: no new stall\n",
    stderr: "",
  });
  // Count notification executable invocations: one failed attempt and one success.
  expect((await Bun.file(log).text()).trim().split("\n")).toHaveLength(2);
});
