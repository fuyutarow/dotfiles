import { expect, test } from "bun:test";
import {
  chmodSync,
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
import { z, jsonOf } from "../../agents/hooks/zod.ts";

const REPO = join(import.meta.dir, "../..");
function fixture(enabled = "disabled", active = "inactive") {
  const home = mkdtempSync(join(tmpdir(), "ccc-systemd-"));
  const bin = join(home, "bin");
  mkdirSync(bin);
  const fake = join(bin, "systemctl");
  writeFileSync(
    fake,
    `#!${process.execPath}\nawait import(${JSON.stringify(join(import.meta.dir, "fake-systemctl.ts"))});\n`,
  );
  chmodSync(fake, 0o755);
  writeFileSync(join(home, "state.json"), JSON.stringify({ enabled, active }));
  const env = {
    ...process.env,
    HOME: home,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
  };
  const ctx = { home, dotfiles: REPO, os: "linux", mode: "safe" };
  const run = (args: string[]) => {
    const r = Bun.spawnSync([fake, "--user", ...args], { env, timeout: 5000 });
    return { code: r.exitCode, out: r.stdout.toString().trim() };
  };
  const doctor = () => {
    const r = Bun.spawnSync(
      [
        process.execPath,
        "-e",
        `import { checkCccDaemon } from ${JSON.stringify(join(REPO, "scripts/doctor.ts"))}; process.stdout.write(JSON.stringify(await checkCccDaemon(${JSON.stringify({ home, dotfiles: REPO, isMac: false, isWsl: false, isCoreBox: true })})));`,
      ],
      { env, timeout: 15000 },
    );
    expect(r.exitCode).toBe(0);
    const parsed = jsonOf(
      z.object({ verdict: z.string(), fix: z.string().optional() }),
    ).safeParse(r.stdout.toString());
    if (!parsed.success)
      return { verdict: "fixture parse failed", fix: "fixture parse failed" };
    return parsed.data;
  };
  return { home, ctx, run, doctor };
}

test("deploy migrates the suffix alias, enables default.target and starts once; repeated deploy preserves the process and file", () => {
  const f = fixture("alias");
  const unit = join(f.home, ".config/systemd/user/ccc-daemon.service");
  mkdirSync(join(f.home, ".config/systemd/user"), { recursive: true });
  symlinkSync(join(REPO, "cocoindex/ccc-daemon.service.wsl"), unit);
  expect(f.doctor().verdict).toBe("FAIL");
  expect(deployCccDaemon(f.ctx, f.run, true)).toBeUndefined();
  expect(lstatSync(unit).isFile()).toBe(true);
  expect(readFileSync(unit, "utf8")).toContain("WantedBy=default.target");
  expect(f.doctor().verdict).toBe("PASS");
  const inode = statSync(unit).ino;
  expect(deployCccDaemon(f.ctx, f.run, true)).toBeUndefined();
  expect(statSync(unit).ino).toBe(inode);
  const calls = readFileSync(join(f.home, "calls"), "utf8");
  expect(calls.match(/--user start /gu)).toHaveLength(1);
  expect(calls.match(/--user enable /gu)).toHaveLength(2);
  expect(calls).not.toMatch(/\b(stop|restart)\b/u);
});

test.each(["linux", "wsl"])(
  "active but disabled on %s is repaired without starting or restarting",
  (os) => {
    const f = fixture("disabled", "active");
    expect(deployCccDaemon({ ...f.ctx, os }, f.run, true)).toBeUndefined();
    expect(f.doctor().verdict).toBe("PASS");
    expect(readFileSync(join(f.home, "calls"), "utf8")).not.toMatch(
      /\b(start|stop|restart)\b/u,
    );
  },
);

test("an old enable edge pointing directly at the repo declaration migrates to the real unit", () => {
  const f = fixture("alias", "active");
  const dir = join(f.home, ".config/systemd/user/default.target.wants");
  mkdirSync(dir, { recursive: true });
  symlinkSync(
    join(REPO, "cocoindex/ccc-daemon.service.wsl"),
    join(dir, "ccc-daemon.service"),
  );
  expect(deployCccDaemon(f.ctx, f.run, true)).toBeUndefined();
  expect(f.doctor().verdict).toBe("PASS");
});

test.each(["disabled", "alias", "enabled-runtime", "masked"])(
  "doctor rejects %s even while active, names deploy repair",
  (enabled) => {
    const f = fixture(enabled, "active");
    const finding = f.doctor();
    expect(finding.verdict).toBe("FAIL");
    expect(finding.fix).toBe("mise run link:dots");
  },
);

test("doctor rejects enabled without the default.target edge and enabled but inactive", () => {
  const f = fixture("enabled", "active");
  expect(f.doctor().verdict).toBe("FAIL");
  expect(deployCccDaemon(f.ctx, f.run, true)).toBeUndefined();
  writeFileSync(
    join(f.home, "state.json"),
    JSON.stringify({ enabled: "enabled", active: "inactive" }),
  );
  expect(f.doctor().verdict).toBe("FAIL");
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
);
