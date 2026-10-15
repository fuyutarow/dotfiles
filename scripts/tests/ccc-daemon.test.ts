import { expect, test } from "bun:test";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deployCccDaemon } from "../../cocoindex/deploy-daemon.ts";
import { checkCccDaemon } from "../doctor.ts";
import { z } from "../../agents/hooks/zod.ts";

const REPO = join(import.meta.dir, "../..");

// deployCccDaemon is owned by a later async unit; Promise.resolve keeps this call
// correct whether it returns the result directly or a Promise.
const deploy = (...args: Parameters<typeof deployCccDaemon>) =>
  Promise.resolve(deployCccDaemon(...args));
const pathExists = async (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );
async function fixture(enabled = "disabled", active = "inactive") {
  const home = await mkdtemp(join(tmpdir(), "ccc-systemd-"));
  const state = { enabled, active };
  const calls: string[] = [];
  const ctx = { home, dotfiles: REPO, os: "linux", mode: "safe" };
  const run = (args: string[]) => {
    calls.push(`--user ${args.join(" ")}`);
    const checked = z
      .object({ enabled: z.string(), active: z.string() })
      .safeParse(state);
    if (!checked.success) return { code: 2, out: "invalid fixture state" };
    const current = checked.data;
    const verb = args[0];
    if (verb === "is-active")
      return { code: current.active === "active" ? 0 : 3, out: current.active };
    if (verb === "is-enabled")
      return {
        code:
          current.enabled === "enabled" || current.enabled === "alias" ? 0 : 1,
        out: current.enabled,
      };
    if (verb === "enable") {
      current.enabled = "enabled";
    }
    if (verb === "start") current.active = "active";
    Object.assign(state, current);
    return { code: 0, out: "" };
  };
  const doctor = () =>
    checkCccDaemon(
      { home, dotfiles: REPO, isMac: false, isWsl: false, isCoreBox: true },
      (cmd) => {
        const result = run(cmd.slice(2));
        return Promise.resolve({
          ...result,
          err: "",
          timedOut: false,
          missing: false,
        });
      },
    );
  const enableEdge = async () => {
    const dir = join(home, ".config/systemd/user/default.target.wants");
    await mkdir(dir, { recursive: true });
    await symlink("../ccc-daemon.service", join(dir, "ccc-daemon.service"));
  };
  return { home, ctx, run, doctor, calls, pathExists, enableEdge, state };
}

test("deploy migrates the suffix alias, enables default.target and starts once; repeated deploy preserves the process and file", async () => {
  const f = await fixture("alias");
  const unit = join(f.home, ".config/systemd/user/ccc-daemon.service");
  await mkdir(join(f.home, ".config/systemd/user"), { recursive: true });
  await symlink(join(REPO, "cocoindex/ccc-daemon.service.wsl"), unit);
  await f.enableEdge();
  expect((await f.doctor()).verdict).toBe("FAIL");
  expect(await deploy(f.ctx, f.run, true)).toBeUndefined();
  if (
    !(await f.pathExists(
      join(
        f.home,
        ".config/systemd/user/default.target.wants/ccc-daemon.service",
      ),
    ))
  ) {
    await f.enableEdge();
  }
  expect((await lstat(unit)).isFile()).toBe(true);
  expect(await readFile(unit, "utf8")).toContain("WantedBy=default.target");
  const firstDoctor = await f.doctor();
  expect(firstDoctor.verdict).toBe("PASS");
  const inode = (await lstat(unit)).ino;
  expect(await deploy(f.ctx, f.run, true)).toBeUndefined();
  expect((await lstat(unit)).ino).toBe(inode);
  const calls = f.calls.join("\n");
  expect(calls.match(/--user start /gu)).toHaveLength(1);
  expect(calls.match(/--user enable /gu)).toHaveLength(2);
  expect(calls).not.toMatch(/\b(stop|restart)\b/u);
}, 30_000);

test.each(["linux", "wsl"])(
  "active but disabled on %s is repaired without starting or restarting",
  async (os) => {
    const f = await fixture("disabled", "active");
    await f.enableEdge();
    expect(await deploy({ ...f.ctx, os }, f.run, true)).toBeUndefined();
    expect((await f.doctor()).verdict).toBe("PASS");
    expect(f.calls.join("\n")).not.toMatch(/\b(start|stop|restart)\b/u);
  },
  20_000,
);

test("an old enable edge pointing directly at the repo declaration migrates to the real unit", async () => {
  const f = await fixture("alias", "active");
  const dir = join(f.home, ".config/systemd/user/default.target.wants");
  await mkdir(dir, { recursive: true });
  await symlink(
    join(REPO, "cocoindex/ccc-daemon.service.wsl"),
    join(dir, "ccc-daemon.service"),
  );
  expect(await deploy(f.ctx, f.run, true)).toBeUndefined();
  expect(await f.pathExists(join(dir, "ccc-daemon.service"))).toBe(false);
  await f.enableEdge();
  expect((await f.doctor()).verdict).toBe("PASS");
}, 20_000);

test("doctor reports the GPU-only policy and rejects an old CPU/RAM-only unit", async () => {
  const f = await fixture("enabled", "active");
  await f.enableEdge();
  expect(await deploy(f.ctx, f.run, true)).toBeUndefined();
  expect((await f.doctor()).detail).toContain("GPU-only indexing");
  const unit = join(f.home, ".config/systemd/user/ccc-daemon.service");
  await writeFile(
    unit,
    (await readFile(unit, "utf8")).replaceAll(
      /^Environment="(?:CCC_GPU_|COCOINDEX_RUN_GPU_IN_SUBPROCESS).*\n/gmu,
      "",
    ),
  );
  expect((await f.doctor()).verdict).toBe("FAIL");
}, 20_000);

test.each([
  "CCC_GPU_UTILIZATION_PERCENT",
  "CCC_GPU_BATCH_SIZE",
  "CCC_GPU_WAIT_SECONDS",
  "CCC_GPU_WINDOW",
  "COCOINDEX_RUN_GPU_IN_SUBPROCESS",
])("doctor rejects an installed unit missing %s", async (key) => {
  const f = await fixture("enabled", "active");
  await f.enableEdge();
  expect(await deploy(f.ctx, f.run, true)).toBeUndefined();
  const unit = join(f.home, ".config/systemd/user/ccc-daemon.service");
  const lines = (await readFile(unit, "utf8")).split("\n");
  await writeFile(
    unit,
    lines.filter((line) => !line.startsWith(`Environment="${key}=`)).join("\n"),
  );
  expect((await f.doctor()).verdict).toBe("FAIL");
});

test.each(["disabled", "alias", "enabled-runtime", "masked"])(
  "doctor rejects %s even while active, names deploy repair",
  async (enabled) => {
    const f = await fixture(enabled, "active");
    const finding = await f.doctor();
    expect(finding.verdict).toBe("FAIL");
    expect(finding.fix).toBe("mise run link:dots");
  },
  20_000,
);

test("doctor rejects enabled without the default.target edge and enabled but inactive", async () => {
  const f = await fixture("enabled", "active");
  await f.enableEdge();
  expect((await f.doctor()).verdict).toBe("FAIL");
  expect(await deploy(f.ctx, f.run, true)).toBeUndefined();
  f.state.active = "inactive";
  expect((await f.doctor()).verdict).toBe("FAIL");
}, 20_000);

test("macOS, check mode and hosts without systemd skip without writes or commands", async () => {
  for (const variant of [
    { os: "mac", mode: "safe", available: true },
    { os: "linux", mode: "check", available: true },
    { os: "linux", mode: "safe", available: false },
  ]) {
    const f = await fixture();
    expect(
      await deploy({ ...f.ctx, ...variant }, f.run, variant.available),
    ).toBeUndefined();
    expect(f.calls).toEqual([]);
    expect(await f.pathExists(join(f.home, ".config"))).toBe(false);
  }
});

test.each(["daemon-reload", "enable", "start"])(
  "deploy fails closed on %s failure",
  async (verb) => {
    const f = await fixture();
    const run = (args: string[]) =>
      args[0] === verb ? { code: 9, out: "fixture failure" } : f.run(args);
    const error = await deploy(f.ctx, run, true);
    expect(error?.message).toContain("mise run link:dots");
  },
  20_000,
);
