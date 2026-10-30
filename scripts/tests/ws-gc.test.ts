import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, mkdir, readlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkWsGc } from "../doctor.ts";
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
  const doctor = async () => {
    if (process.platform !== "darwin")
      return run([process.execPath, join(REPO, "scripts/doctor.ts")]);
    const finding = await checkWsGc(
      { home, dotfiles: REPO, isMac: false, isWsl: false, isCoreBox: true },
      async (cmd) => {
        const result = await run([join(bin, "systemctl"), ...cmd.slice(1)]);
        return { ...result, err: "", timedOut: false, missing: false };
      },
    );
    return {
      code: finding.verdict === "FAIL" ? 1 : 0,
      out: finding.verdict + " " + finding.detail,
    };
  };
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
    ["ExecStart=/usr/bin/env bun %h/dotfiles/scripts/ws-gc-log.ts"],
  );
  expect(service).toContain("StandardOutput=journal");
  expect(service).toContain("StandardError=journal");
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

test("WS-GC-TIMER: wrapper journals both streams and keeps the newest 48 run files", async () => {
  const f = await fixture();
  const state = join(f.home, "state");
  const logs = join(state, "ws-gc");
  await mkdir(logs, { recursive: true });
  for (let i = 0; i < 49; i++) {
    await Bun.write(
      join(
        logs,
        `ws-gc-2020-01-01T00-00-${String(i).padStart(2, "0")}.000Z-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.log`,
      ),
      "old\n",
    );
  }
  await Bun.write(join(logs, "unrelated.log"), "untouched\n");
  const mise = join(f.home, "bin/mise");
  await Bun.write(
    mise,
    `#!${process.execPath}\nprocess.stdout.write('{"rows":1}\\n');\nprocess.stderr.write('gc removed /example reason=test\\n');\nprocess.exitCode = 7;\n`,
  );
  await chmod(mise, 0o755);
  const child = Bun.spawn(
    [process.execPath, join(REPO, "scripts/ws-gc-log.ts")],
    {
      env: {
        ...process.env,
        HOME: f.home,
        XDG_STATE_HOME: state,
        PATH: join(f.home, "bin"),
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    },
  );
  const [out, err, code] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  expect(code).toBe(7);
  expect(out).toBe('{"rows":1}\n');
  expect(err).toBe("gc removed /example reason=test\n");
  const { readdir } = await import("node:fs/promises");
  const names = await readdir(logs);
  expect(names.filter((name) => name.startsWith("ws-gc-")).length).toBe(48);
  expect(names).toContain("unrelated.log");
  const current = names.find(
    (name) => name.startsWith("ws-gc-20") && !name.startsWith("ws-gc-2020"),
  );
  expect(current).toBeDefined();
  if (current === undefined) return;
  const contents = await Bun.file(join(logs, current)).text();
  expect(contents).toContain(out);
  expect(contents).toContain(err);
});
