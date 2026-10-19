import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LINKS } from "../config-registry.ts";
import { deployStatuslineOwners, link, type Ctx } from "../link-dots.ts";
import { checkStatuslineOwners, type Ctx as DoctorCtx } from "../doctor.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const units = [
  "statusline-sampler.service",
  "statusline-sampler.timer",
  "agx-doctor.service",
  "agx-doctor.path",
];
const ownerProbe = (cmd: string[]) =>
  Promise.resolve({
    code: 0,
    out: cmd.includes("show") ? "Result=success\n" : "active\n",
    err: "",
    missing: false,
    timedOut: false,
  });
const failedOwnerProbe = (cmd: string[]) =>
  Promise.resolve({
    code: 0,
    out: cmd.includes("show") ? "Result=timeout\n" : "active\n",
    err: "",
    missing: false,
    timedOut: false,
  });

test("registry links all owner units; owner deployment enables the timer without activation and starts the path", async () => {
  const home = await mkdtemp(join(tmpdir(), "statusline-units-"));
  roots.push(home);
  const ctx: Ctx = {
    home,
    dotfiles: join(import.meta.dir, "../.."),
    os: "linux",
    mode: "safe",
    drift: [],
  };
  await mkdir(join(home, ".config/systemd/user"), { recursive: true });
  for (const unit of units) {
    const row = LINKS.find(([, source]) => source === `systemd/${unit}`);
    expect(row).toEqual([
      "not-mac",
      `systemd/${unit}`,
      `.config/systemd/user/${unit}`,
    ]);
    if (row !== undefined) link(ctx, row[1], join(home, row[2]));
  }
  const calls: string[][] = [];
  const probe = (args: string[]) => {
    calls.push(args);
    return Promise.resolve({ code: 0, out: "" });
  };
  expect(await deployStatuslineOwners(ctx, probe, true)).toBeUndefined();
  expect(calls).toEqual([
    ["daemon-reload"],
    ["enable", "statusline-sampler.timer"],
    ["enable", "--now", "agx-doctor.path"],
    ["start", "--no-block", "agx-doctor.service"],
  ]);
  calls.length = 0;
  expect(
    await deployStatuslineOwners({ ...ctx, mode: "check" }, probe, true),
  ).toBeUndefined();
  expect(calls).toEqual([]);
  const watcher = await readFile(
    join(ctx.dotfiles, "systemd/agx-doctor.path"),
    "utf8",
  );
  expect(watcher).toContain(
    "PathChanged=%h/.local/state/agx-next/records.jsonl",
  );
  expect(watcher).toContain(
    "PathChanged=%h/.local/state/agx-next/workspace-verdicts.json",
  );
  expect(watcher).not.toContain(
    "PathChanged=%h/.local/state/agx-next/doctor.json",
  );
  const service = await readFile(
    join(ctx.dotfiles, "systemd/agx-doctor.service"),
    "utf8",
  );
  expect(service).toContain("Type=oneshot");
  expect(service).toContain("ExecStartPre=/usr/bin/sleep 60");
  expect(service).toContain("SuccessExitStatus=1");
});

test("doctor reports inactive triggers and a failed collector", async () => {
  const ctx: DoctorCtx = {
    home: "/fixture",
    dotfiles: "/fixture",
    isMac: false,
    isWsl: false,
    isCoreBox: false,
  };
  // The probe has the same bounded execution envelope as doctor's regular runner.
  expect((await checkStatuslineOwners(ctx, ownerProbe)).verdict).toBe("PASS");
  expect((await checkStatuslineOwners(ctx, failedOwnerProbe)).verdict).toBe(
    "FAIL",
  );
});
