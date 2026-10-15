import { expect, test } from "bun:test";
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deployCccDaemon } from "../../cocoindex/deploy-daemon.ts";
import { checkCccDaemon } from "../doctor.ts";
import { z, jsonOf } from "../../agents/hooks/zod.ts";

const REPO = join(import.meta.dir, "../..");
function fixture(enabled = "disabled", active = "inactive") {
  const home = mkdtempSync(join(tmpdir(), "ccc-systemd-"));
  writeFileSync(join(home, "state.json"), JSON.stringify({ enabled, active }));
  const ctx = { home, dotfiles: REPO, os: "linux", mode: "safe" };
  const run = (args: string[]) => {
    appendFileSync(join(home, "calls"), `--user ${args.join(" ")}\n`);
    const checked = jsonOf(
      z.object({ enabled: z.string(), active: z.string() }),
    ).safeParse(readFileSync(join(home, "state.json"), "utf8"));
    if (!checked.success) return { code: 2, out: "invalid fixture state" };
    const state = checked.data;
    const verb = args[0];
    if (verb === "is-active")
      return { code: state.active === "active" ? 0 : 3, out: state.active };
    if (verb === "is-enabled")
      return {
        code: state.enabled === "enabled" || state.enabled === "alias" ? 0 : 1,
        out: state.enabled,
      };
    if (verb === "enable") {
      const dir = join(home, ".config/systemd/user/default.target.wants");
      mkdirSync(dir, { recursive: true });
      const edge = join(dir, "ccc-daemon.service");
      if (!existsSync(edge)) symlinkSync("../ccc-daemon.service", edge);
      state.enabled = "enabled";
    }
    if (verb === "start") state.active = "active";
    writeFileSync(join(home, "state.json"), JSON.stringify(state));
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
  return { home, ctx, run, doctor };
}

test("deploy migrates the suffix alias, enables default.target and starts once; repeated deploy preserves the process and file", async () => {
  const f = fixture("alias");
  const unit = join(f.home, ".config/systemd/user/ccc-daemon.service");
  mkdirSync(join(f.home, ".config/systemd/user"), { recursive: true });
  symlinkSync(join(REPO, "cocoindex/ccc-daemon.service.wsl"), unit);
  expect((await f.doctor()).verdict).toBe("FAIL");
  expect(deployCccDaemon(f.ctx, f.run, true)).toBeUndefined();
  expect(lstatSync(unit).isFile()).toBe(true);
  expect(readFileSync(unit, "utf8")).toContain("WantedBy=default.target");
  expect((await f.doctor()).verdict).toBe("PASS");
  const inode = statSync(unit).ino;
  expect(deployCccDaemon(f.ctx, f.run, true)).toBeUndefined();
  expect(statSync(unit).ino).toBe(inode);
  const calls = readFileSync(join(f.home, "calls"), "utf8");
  expect(calls.match(/--user start /gu)).toHaveLength(1);
  expect(calls.match(/--user enable /gu)).toHaveLength(2);
  expect(calls).not.toMatch(/\b(stop|restart)\b/u);
}, 30_000);

test.each(["linux", "wsl"])(
  "active but disabled on %s is repaired without starting or restarting",
  async (os) => {
    const f = fixture("disabled", "active");
    expect(deployCccDaemon({ ...f.ctx, os }, f.run, true)).toBeUndefined();
    expect((await f.doctor()).verdict).toBe("PASS");
    expect(readFileSync(join(f.home, "calls"), "utf8")).not.toMatch(
      /\b(start|stop|restart)\b/u,
    );
  },
  20_000,
);

test("an old enable edge pointing directly at the repo declaration migrates to the real unit", async () => {
  const f = fixture("alias", "active");
  const dir = join(f.home, ".config/systemd/user/default.target.wants");
  mkdirSync(dir, { recursive: true });
  symlinkSync(
    join(REPO, "cocoindex/ccc-daemon.service.wsl"),
    join(dir, "ccc-daemon.service"),
  );
  expect(deployCccDaemon(f.ctx, f.run, true)).toBeUndefined();
  expect((await f.doctor()).verdict).toBe("PASS");
}, 20_000);

test("doctor reports the GPU-only policy and rejects an old CPU/RAM-only unit", async () => {
  const f = fixture("enabled", "active");
  expect(deployCccDaemon(f.ctx, f.run, true)).toBeUndefined();
  expect((await f.doctor()).detail).toContain("GPU-only indexing");
  const unit = join(f.home, ".config/systemd/user/ccc-daemon.service");
  writeFileSync(
    unit,
    readFileSync(unit, "utf8").replaceAll(
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
  const f = fixture("enabled", "active");
  expect(deployCccDaemon(f.ctx, f.run, true)).toBeUndefined();
  const unit = join(f.home, ".config/systemd/user/ccc-daemon.service");
  const lines = readFileSync(unit, "utf8").split("\n");
  writeFileSync(
    unit,
    lines.filter((line) => !line.startsWith(`Environment="${key}=`)).join("\n"),
  );
  expect((await f.doctor()).verdict).toBe("FAIL");
});

test.each(["disabled", "alias", "enabled-runtime", "masked"])(
  "doctor rejects %s even while active, names deploy repair",
  async (enabled) => {
    const f = fixture(enabled, "active");
    const finding = await f.doctor();
    expect(finding.verdict).toBe("FAIL");
    expect(finding.fix).toBe("mise run link:dots");
  },
  20_000,
);

test("doctor rejects enabled without the default.target edge and enabled but inactive", async () => {
  const f = fixture("enabled", "active");
  expect((await f.doctor()).verdict).toBe("FAIL");
  expect(deployCccDaemon(f.ctx, f.run, true)).toBeUndefined();
  writeFileSync(
    join(f.home, "state.json"),
    JSON.stringify({ enabled: "enabled", active: "inactive" }),
  );
  expect((await f.doctor()).verdict).toBe("FAIL");
}, 20_000);

test("macOS, check mode and hosts without systemd skip without writes or commands", () => {
  for (const variant of [
    { os: "mac", mode: "safe", available: true },
    { os: "linux", mode: "check", available: true },
    { os: "linux", mode: "safe", available: false },
  ]) {
    const f = fixture();
    expect(
      deployCccDaemon({ ...f.ctx, ...variant }, f.run, variant.available),
    ).toBeUndefined();
    expect(existsSync(join(f.home, "calls"))).toBe(false);
    expect(existsSync(join(f.home, ".config"))).toBe(false);
  }
});

test.each(["daemon-reload", "enable", "start"])(
  "deploy fails closed on %s failure",
  (verb) => {
    const f = fixture();
    const run = (args: string[]) =>
      args[0] === verb ? { code: 9, out: "fixture failure" } : f.run(args);
    const error = deployCccDaemon(f.ctx, run, true);
    expect(error?.message).toContain("mise run link:dots");
  },
  20_000,
);
