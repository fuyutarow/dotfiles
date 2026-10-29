import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, mkdir, readlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LINKS } from "../config-registry.ts";
import { deployWsGc, link, type Ctx } from "../link-dots.ts";

const REPO = join(import.meta.dir, "../..");
const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(
    scratch.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "ws-gc-timer-"));
  scratch.push(home);
  const bin = join(home, "bin");
  await mkdir(bin);
  const state = join(home, "state.json");
  const calls = join(home, "calls");
  const ctx: Ctx = {
    home,
    dotfiles: REPO,
    os: "linux",
    mode: "safe",
    drift: [],
  };
  const writeState = (
    active: string,
    result = "success",
    status = 0,
    fail = "",
  ) => Bun.write(state, JSON.stringify({ active, result, status, fail }));
  await writeState("inactive");
  // A real executable fixture drives deployment and the doctor CLI without the host manager.
  await Bun.write(
    join(bin, "systemctl"),
    `#!${process.execPath}
import { appendFile } from "node:fs/promises";
const state = ${JSON.stringify(state)};
const current = await Bun.file(state).json();
const args = process.argv.slice(2);
await appendFile(${JSON.stringify(calls)}, args.join(" ") + "\\n");
const verb = args[1];
if (verb === current.fail) process.exit(9);
if (verb === "is-active") {
  console.log(current.active);
  process.exit(current.active === "active" ? 0 : 3);
}
if (verb === "show") {
  console.log("Result=" + current.result + "\\nExecMainStatus=" + current.status + "\\nActiveState=" + (current.result === "success" ? "inactive" : "failed"));
}
if (verb === "enable") {
  if (args.includes("--now")) current.active = "active";
  await Bun.write(state, JSON.stringify(current));
}
`,
  );
  await chmod(join(bin, "systemctl"), 0o755);
  const env = {
    ...process.env,
    HOME: home,
    DOTFILES: REPO,
    PATH: `${bin}:${process.env["PATH"]}`,
    DOCTOR_ONLY: "ws-gc",
  };
  const run = async (cmd: string[]) => {
    const child = Bun.spawn(cmd, {
      env,
      cwd: home,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    });
    const [out, err, code] = await Promise.all([
      child.stdout.text(),
      child.stderr.text(),
      child.exited,
    ]);
    return { code, out: `${out}${err}` };
  };
  const probe = (args: string[]) =>
    run([join(bin, "systemctl"), "--user", ...args]);
  const doctor = () => run([process.execPath, join(REPO, "scripts/doctor.ts")]);
  return { home, ctx, calls, writeState, probe, doctor };
}

test("WS-GC-TIMER: registry links both units and the only service command uses safe unattended flags", async () => {
  const f = await fixture();
  for (const unit of ["ws-gc.service", "ws-gc.timer"]) {
    const row = LINKS.find(([, source]) => source === `systemd/${unit}`);
    expect(row).toEqual([
      "not-mac",
      `systemd/${unit}`,
      `.config/systemd/user/${unit}`,
    ]);
    if (row === undefined) return;
    link(f.ctx, row[1], join(f.home, row[2]));
    expect(await readlink(join(f.home, row[2]))).toBe(join(REPO, row[1]));
  }
  const service = await Bun.file(join(REPO, "systemd/ws-gc.service")).text();
  expect(service.split("\n").filter((line) => line.startsWith("Exec"))).toEqual(
    [
      "ExecStart=/usr/bin/env mise -C %h/dotfiles exec -- agx ws gc --all --legacy --json",
    ],
  );
  expect(service).toContain("StandardOutput=journal");
  expect(service).not.toContain("--abandoned");
  const timer = await Bun.file(join(REPO, "systemd/ws-gc.timer")).text();
  expect(timer).toContain("OnBootSec=5min");
  expect(timer).toContain("OnUnitActiveSec=1h");
  expect(timer).toContain("Unit=ws-gc.service");
  expect(await deployWsGc(f.ctx, f.probe, true)).toBeUndefined();
  expect(await Bun.file(f.calls).text()).toBe(
    "--user daemon-reload\n--user enable ws-gc.timer\n",
  );
  // Timer activation is owned by the registry-wide deployment pass.
  await f.writeState("active");
  expect((await f.doctor()).code).toBe(0);
});

test("WS-GC-TIMER: doctor CLI fails on an inactive timer and on last-run failures", async () => {
  const f = await fixture();
  const inactive = await f.doctor();
  expect(inactive.code).toBe(1);
  expect(inactive.out).toContain("FAIL");
  expect(inactive.out).toContain("inactive");
  await f.writeState("active");
  expect((await f.doctor()).code).toBe(0);
  for (const [result, status] of [
    ["exit-code", 1],
    ["timeout", 0],
    ["success", 2],
  ] as const) {
    await f.writeState("active", result, status);
    expect((await f.doctor()).code).toBe(1);
  }
  await f.writeState("active", "success", 0, "show");
  expect((await f.doctor()).code).toBe(1);
});

test("WS-GC-TIMER: check mode, macOS and hosts without systemd do not enable a timer", async () => {
  const f = await fixture();
  expect(
    await deployWsGc({ ...f.ctx, mode: "check" }, f.probe, true),
  ).toBeUndefined();
  expect(
    await deployWsGc({ ...f.ctx, os: "mac" }, f.probe, true),
  ).toBeUndefined();
  expect(await deployWsGc(f.ctx, f.probe, false)).toBeUndefined();
  expect(await Bun.file(f.calls).exists()).toBe(false);
});

test("WS-GC-TIMER: deployment refuses undeclared units and reports enable failure", async () => {
  const f = await fixture();
  expect(await deployWsGc(f.ctx, f.probe, true)).toBeInstanceOf(Error);
  expect(await Bun.file(f.calls).exists()).toBe(false);
  for (const unit of ["ws-gc.service", "ws-gc.timer"])
    link(f.ctx, `systemd/${unit}`, join(f.home, ".config/systemd/user", unit));
  await f.writeState("inactive", "success", 0, "enable");
  expect((await deployWsGc(f.ctx, f.probe, true))?.message).toContain(
    "enable ws-gc.timer failed",
  );
});
