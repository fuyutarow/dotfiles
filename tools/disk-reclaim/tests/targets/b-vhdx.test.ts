import assert from "node:assert/strict";
import { expect, test } from "bun:test";
import { Plan } from "../../src/model.ts";
import { planOnlyNotices } from "../../src/reclaim.ts";
import { run } from "../../src/engine.ts";
import type { Context } from "../../src/targets/index.ts";
import {
  createVhdxTarget,
  distroName,
  isWslRuntime,
  parseLxssProbe,
  pickMethod,
  probeFailure,
  resolveVhdx,
} from "../../src/targets/vhdx.ts";

const GiB = 1024 ** 3;
const R99_BASE =
  "C:\\Users\\fuyutarow\\AppData\\Local\\wsl\\{ea4a1745-1d66-4001-9242-377948beece5}";
const R99_VHDX = `${R99_BASE}\\ext4.vhdx`;
const R99_MNT =
  "/mnt/c/Users/fuyutarow/AppData/Local/wsl/{ea4a1745-1d66-4001-9242-377948beece5}/ext4.vhdx";
// Ubuntu-24.04 also owns an ext4.vhdx; a fixed distro name would pick that disk.
const REGISTRY = [
  "lxss=Ubuntu-24.04|C:\\Users\\fuyutarow\\AppData\\Local\\Packages\\CanonicalGroupLimited.Ubuntu24.04LTS_79rhkp1fndgsc\\LocalState",
  `lxss=r99-u26|${R99_BASE}`,
].join("\n");
const planContext = {
  mode: "plan",
  explicit: false,
  config: {
    repo_roots: [],
    repos: [],
    scratch_roots: [],
    delete_roots: [],
    regenerable_ignored: [],
    session_grace_hours: 24,
    ignore_unreadable_procs: ["sshd"],
  },
  log: () => {},
} satisfies Context;

test("WSL detection recognizes procfs on SSH shells without WSL_DISTRO_NAME", () => {
  expect(
    isWslRuntime({
      platform: "linux",
      distroName: undefined,
      procVersion: "Linux version 6.18.54.1-microsoft-standard-WSL2",
      interop: false,
    }),
  ).toBe(true);
  expect(
    isWslRuntime({
      platform: "linux",
      distroName: undefined,
      procVersion: "Linux version 6.8.0-generic",
      interop: false,
    }),
  ).toBe(false);
  expect(
    isWslRuntime({
      platform: "linux",
      distroName: "Ubuntu-24.04",
      procVersion: "Linux version 6.8.0-generic",
      interop: false,
    }),
  ).toBe(true);
});

test("vhdx port preserves offline procedures and act never invokes its runner", async () => {
  for (const optimize of [true, false]) {
    const method = pickMethod(optimize);
    expect(method.name).toBe(optimize ? "Optimize-VHD" : "diskpart");
    const steps = method.steps("C:\\data\\ext4.vhdx", "Ubuntu");
    expect(steps[0]).toBe("wsl.exe --shutdown");
    expect(steps[1]).toContain("--set-sparse false");
    expect(
      steps.findIndex(
        (s) => s.includes("Optimize-VHD") || s.includes("compact vdisk"),
      ),
    ).toBeGreaterThan(1);
  }
  expect(
    probeFailure({ code: 255, out: "refused", timedOut: false }, "r99"),
  ).toContain("ssh r99 exited 255");
  let calls = 0;
  const target = createVhdxTarget({
    host: "local",
    distro: () => "r99-u26",
    probe: () =>
      Promise.resolve(
        `optimize_vhd=True\n${REGISTRY}\nlxss_logical=r99-u26|${50 * GiB}\n`,
      ),
    runner: () => {
      calls++;
      return Promise.resolve({ code: 0, out: "", timedOut: false });
    },
  });
  const plan = await target.plan(planContext);
  expect(plan[0]?.verdict).toBe("KEEP");
  expect(plan[0]?.reason).toContain("Optimize-VHD");
  expect(calls).toBe(2);
  const candidate = plan[0];
  assert.ok(candidate !== undefined);
  expect(
    target.act(candidate, {
      ...planContext,
      mode: "run",
    }).ok,
  ).toBe(false);
  expect(calls).toBe(2);
});

test("vhdx probe failure reports local timeout, empty output and successful output", () => {
  expect(probeFailure({ code: 0, out: "", timedOut: true }, "local")).toContain(
    "interop powershell.exe timed out",
  );
  expect(
    probeFailure({ code: 0, out: "  \n", timedOut: false }, "r99"),
  ).toContain("returned nothing");
  expect(
    probeFailure({ code: 0, out: "c_free=1\n", timedOut: false }, "r99"),
  ).toBeNull();
});

test("vhdx plan measures logical, allocated and guest-used bytes through the injected runner", async () => {
  const calls: string[] = [];
  const target = createVhdxTarget({
    host: "local",
    distro: () => "r99-u26",
    runner: (host, script) => {
      calls.push(`${host}:${script}`);
      if (script === "$probe")
        return Promise.resolve({
          code: 0,
          out: `optimize_vhd=False\n${REGISTRY}\nlxss_logical=r99-u26|${50 * GiB}\n`,
          timedOut: false,
        });
      if (script.startsWith("df "))
        return Promise.resolve({
          code: 0,
          out: `${30 * GiB}\n`,
          timedOut: false,
        });
      return Promise.resolve({
        code: 0,
        out: `${40 * GiB}\n`,
        timedOut: false,
      });
    },
  });
  const plan = await target.plan(planContext);
  expect(calls).toHaveLength(3);
  expect(calls[0]).toBe("local:$probe");
  expect(plan[0]?.bytes).toBe(10 * GiB);
  expect(plan[0]?.reason).toContain(
    "allocated 40.0GB logical 50.0GB guest-used 30.0GB",
  );
  expect(plan[0]?.reason).toContain("reclaimable gap 10.0GB");
  expect(plan[0]?.reason).not.toContain("preallocated");
  expect(plan[0]?.verdict).toBe("KEEP");
});

test("fixed 587 GiB VHDX with 399 GiB used names the vhdx, its gap, and the operator step", async () => {
  const calls: string[] = [];
  const target = createVhdxTarget({
    host: "local",
    distro: () => "r99-u26",
    runner: (_host, script) => {
      calls.push(script);
      if (script === "$probe")
        return Promise.resolve({
          code: 0,
          out: `optimize_vhd=True\n${REGISTRY}\nlxss_logical=r99-u26|${587 * GiB}\n`,
          timedOut: false,
        });
      if (script.startsWith("df "))
        return Promise.resolve({
          code: 0,
          out: `${399 * GiB}\n`,
          timedOut: false,
        });
      return Promise.resolve({
        code: 0,
        out: `${587 * GiB}\n`,
        timedOut: false,
      });
    },
  });
  const [plan] = await target.plan(planContext);
  assert.ok(plan !== undefined);
  expect(plan.verdict).toBe("KEEP");
  expect(plan.bytes).toBe(188 * GiB);
  expect(plan.reason).toContain(`vhdx=${R99_VHDX}`);
  expect(plan.reason).toContain("reclaimable gap 188.0GB");
  expect(plan.reason).toContain("preallocated");
  expect(plan.reason).toContain(`Optimize-VHD -Path "${R99_VHDX}"`);
  expect(plan.reason).toContain("wsl.exe --manage r99-u26 --set-sparse false");
  expect(calls).toContain(`du -B1 -s "${R99_MNT}" | awk '{print $1}'`);
});

test("an unregistered distro is ASK, names the registrations, and measures nothing", async () => {
  let measured = 0;
  const target = createVhdxTarget({
    host: "local",
    distro: () => "missing-distro",
    runner: (_host, script) => {
      if (script !== "$probe") measured++;
      return Promise.resolve({ code: 0, out: REGISTRY, timedOut: false });
    },
  });
  const [plan] = await target.plan(planContext);
  expect(plan?.verdict).toBe("ASK");
  expect(plan?.bytes).toBeNull();
  expect(plan?.reason).toBe(
    "no WSL registration named missing-distro; registered: Ubuntu-24.04, r99-u26",
  );
  expect(measured).toBe(0);
});

test("a remote host keeps guest-used unknown instead of measuring a guessed guest", async () => {
  const calls: string[] = [];
  const target = createVhdxTarget({
    host: "r99",
    distro: () => "r99-u26",
    runner: (host, script) => {
      calls.push(`${host}:${script}`);
      return Promise.resolve({
        code: 0,
        out: `optimize_vhd=True\n${REGISTRY}\nlxss_logical=r99-u26|${50 * GiB}\n`,
        timedOut: false,
      });
    },
  });
  const [plan] = await target.plan(planContext);
  expect(calls).toEqual(["r99:$probe"]);
  expect(plan?.bytes).toBeNull();
  expect(plan?.reason).toContain("allocated ? logical");
});

test("vhdx missing measurements remain unknown and run refuses", async () => {
  const target = createVhdxTarget({
    host: "local",
    distro: () => "r99-u26",
    runner: (_host, script) =>
      Promise.resolve(
        script === "$probe"
          ? { code: 0, out: REGISTRY, timedOut: false }
          : { code: 2, out: "measurement unavailable", timedOut: false },
      ),
  });
  const plan = await target.plan(planContext);
  expect(plan[0]?.bytes).toBeNull();
  expect(plan[0]?.reason).toContain("allocated ? logical ? guest-used ?");
  const candidate = plan[0];
  assert.ok(candidate !== undefined);
  expect(target.act(candidate, { ...planContext, mode: "run" })).toEqual({
    ok: false,
    bytes_freed: null,
    error: "vhdx is plan-only",
  });
});

test("engine run refuses vhdx with exit 2 before calling its runner", async () => {
  let calls = 0;
  const target = createVhdxTarget({
    runner: () => {
      calls++;
      return Promise.resolve({ code: 0, out: "", timedOut: false });
    },
  });
  const result = await run([target], {
    context: planContext,
    explicit: ["vhdx"],
    yes: true,
    headroom: { drives: [] },
  });
  expect(result.exit).toBe(2);
  expect(result.error).toContain("plan-only");
  expect(calls).toBe(0);
});

test("Lxss resolution matches the distro name case-insensitively and strips the \\\\?\\ prefix", () => {
  const text = `optimize_vhd=False\nlxss=U24|\\\\?\\E:\\wsl\\u24\nlxss=R99-U26|${R99_BASE}\nlxss_logical=U24|7\n`;
  expect(parseLxssProbe(text).registrations).toEqual([
    { name: "U24", base: "E:\\wsl\\u24" },
    { name: "R99-U26", base: R99_BASE },
  ]);
  expect(resolveVhdx(text, "u24")).toEqual({
    ok: true,
    name: "U24",
    path: "E:\\wsl\\u24\\ext4.vhdx",
    logical: 7,
    optimize: false,
  });
  // The registry spelling names the procedure, even when the probe asks in another case.
  expect(resolveVhdx(text, "r99-u26")).toEqual({
    ok: true,
    name: "R99-U26",
    path: R99_VHDX,
    logical: null,
    optimize: false,
  });
});

test("distroName prefers WSL_DISTRO_NAME, then hostname, and rejects unusable names", () => {
  expect(distroName({ WSL_DISTRO_NAME: "r99-u26" }, "other")).toBe("r99-u26");
  expect(distroName({ WSL_DISTRO_NAME: "" }, "R99-U26")).toBe("R99-U26");
  expect(distroName({}, "bad name!")).toBeNull();
});

test("plan-only candidates without a path are named on stderr lines", () => {
  const parsed = Plan.safeParse({
    schema: "reclaim.plan/1",
    host: "local",
    generated_at: "2026-11-05T00:00:00Z",
    mode: "plan",
    headroom: { drives: [] },
    targets: [
      {
        name: "vhdx",
        tier: "plan-only",
        available: true,
        skip_reason: null,
        exit: null,
        candidates: [
          {
            id: "vhdx-compaction",
            path: null,
            verdict: "KEEP",
            reason: `plan only: vhdx=${R99_VHDX}`,
            checks: [
              {
                name: "procedure-planned",
                ok: true,
                detail: "never execute from disk-reclaim",
              },
            ],
            bytes: 1,
            bytes_kind: "estimate",
            action: { kind: "command", argv: [] },
            result: null,
          },
        ],
        totals: { reclaim: 0, ask: 0, keep: 1 },
      },
    ],
    totals: { reclaim_bytes: 0, ask_bytes: 0, freed_bytes: null },
    receipt: null,
  });
  assert.ok(parsed.success, "fixture plan must match the Plan schema");
  expect(planOnlyNotices(parsed.data)).toEqual([
    `disk-reclaim: PLAN vhdx KEEP: plan only: vhdx=${R99_VHDX}`,
  ]);
});
