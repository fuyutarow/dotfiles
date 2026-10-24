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
  "agx-doctor.timer",
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

test("registry links all owner units; owner deployment enables triggers without activation", async () => {
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
    [
      "show",
      "agx-doctor.path",
      "--property=LoadState",
      "--property=ActiveState",
    ],
    ["stop", "agx-doctor.path"],
    ["daemon-reload"],
    ["enable", "statusline-sampler.timer"],
    ["enable", "agx-doctor.timer"],
  ]);
  calls.length = 0;
  expect(
    await deployStatuslineOwners({ ...ctx, mode: "check" }, probe, true),
  ).toBeUndefined();
  expect(calls).toEqual([]);
  const timer = await readFile(
    join(ctx.dotfiles, "systemd/agx-doctor.timer"),
    "utf8",
  );
  expect(timer).toContain("OnBootSec=60s");
  expect(timer).toContain("OnUnitInactiveSec=60s");
  expect(timer).toContain("Unit=agx-doctor.service");
  expect(timer).toContain("WantedBy=timers.target");
  expect(timer).not.toContain("PathChanged=");
  expect(LINKS.some(([, source]) => source === "systemd/agx-doctor.path")).toBe(
    false,
  );
  const service = await readFile(
    join(ctx.dotfiles, "systemd/agx-doctor.service"),
    "utf8",
  );
  expect(service).toContain("Type=oneshot");
  expect(service).not.toContain("ExecStartPre=");
  expect(service).toContain("agx doctor --json --refresh");
  expect(service).toContain("TimeoutStartSec=180s");
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

const doctorCtx: DoctorCtx = {
  home: "/fixture",
  dotfiles: "/fixture",
  isMac: false,
  isWsl: false,
  isCoreBox: false,
};

test("doctor reads each collector separately and names the failed unit", async () => {
  const calls: string[][] = [];
  const finding = await checkStatuslineOwners(doctorCtx, async (cmd) => {
    calls.push(cmd);
    const healthy = await ownerProbe(cmd);
    if (cmd.includes("agx-doctor.service"))
      return { ...healthy, out: "Result=exit-code\n" };
    return healthy;
  });
  expect(finding.verdict).toBe("FAIL");
  expect(finding.detail).toBe(
    "agx-doctor.service: collector failed: Result=exit-code",
  );
  expect(calls.filter((cmd) => cmd.includes("show"))).toEqual([
    [
      "systemctl",
      "--user",
      "show",
      "statusline-sampler.service",
      "--property=Result",
    ],
    ["systemctl", "--user", "show", "agx-doctor.service", "--property=Result"],
  ]);
});

test.each([
  {
    code: 1,
    err: "Unit agx-doctor.service could not be found.",
    timedOut: false,
    missing: false,
    reason: "systemctl exited 1; Unit agx-doctor.service could not be found.",
  },
  {
    code: 143,
    err: "",
    timedOut: true,
    missing: false,
    reason: "systemctl timed out; systemctl exited 143",
  },
  {
    code: 127,
    err: "",
    timedOut: false,
    missing: true,
    reason: "systemctl missing; systemctl exited 127",
  },
])(
  "doctor explains probe failure even with successful stdout: $reason",
  async ({ reason, ...failure }) => {
    const finding = await checkStatuslineOwners(doctorCtx, async (cmd) => {
      const healthy = await ownerProbe(cmd);
      return cmd.includes("agx-doctor.service")
        ? { ...healthy, ...failure }
        : healthy;
    });
    expect(finding.verdict).toBe("FAIL");
    expect(finding.detail).toContain(
      `agx-doctor.service: cannot read collector result: ${reason}`,
    );
    expect(finding.detail).not.toContain("collector failed: Result=success");
  },
);

test.each(["", "Result=\n", "LoadState=not-found\n"])(
  "doctor rejects missing collector Result: %j",
  async (out) => {
    const finding = await checkStatuslineOwners(doctorCtx, async (cmd) => {
      const healthy = await ownerProbe(cmd);
      return cmd.includes("agx-doctor.service") ? { ...healthy, out } : healthy;
    });
    expect(finding.verdict).toBe("FAIL");
    expect(finding.detail).toBe(
      "agx-doctor.service: systemctl returned no Result property",
    );
  },
);

test("doctor reports inactive triggers and preserves bus errors", async () => {
  const inactive = await checkStatuslineOwners(doctorCtx, async (cmd) => ({
    ...(await ownerProbe(cmd)),
    code: 3,
    out: "inactive\n",
  }));
  expect(inactive.verdict).toBe("FAIL");
  expect(inactive.detail).toContain(
    "statusline-sampler.timer: inactive; systemctl exited 3",
  );
  const inaccessible = await checkStatuslineOwners(doctorCtx, async (cmd) => ({
    ...(await ownerProbe(cmd)),
    code: 1,
    out: "",
    err: "Failed to connect to bus: No data available",
  }));
  expect(inaccessible.verdict).toBe("FAIL");
  expect(inaccessible.detail).toContain(
    "systemctl exited 1; Failed to connect to bus: No data available",
  );
});
