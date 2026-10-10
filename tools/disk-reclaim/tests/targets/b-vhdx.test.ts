import { expect, test } from "bun:test";
import {
  createVhdxTarget,
  isWslRuntime,
  pickMethod,
  probeFailure,
} from "../../src/targets/vhdx.ts";
import { run } from "../../src/engine.ts";

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
    probe: () =>
      Promise.resolve("vhdx_path=C:\\data\\ext4.vhdx\noptimize_vhd=True"),
    runner: () => {
      calls++;
      return Promise.resolve({ code: 0, out: "", timedOut: false });
    },
  });
  const plan = await target.plan({
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
  });
  expect(plan[0]?.verdict).toBe("KEEP");
  expect(plan[0]?.reason).toContain("Optimize-VHD");
  expect(calls).toBe(2);
  expect(
    target.act(plan[0]!, {
      mode: "run",
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
    host: "fixture-host",
    runner: (host, script) => {
      calls.push(`${host}:${script}`);
      if (script === "$probe")
        return Promise.resolve({
          code: 0,
          out: "state=Ubuntu-24.04 Running\noptimize_vhd=False\nvhdx_path=C:\\data\\ext4.vhdx\nvhdx_logical=50000000000\n",
          timedOut: false,
        });
      if (script.startsWith("df "))
        return Promise.resolve({
          code: 0,
          out: "30000000000\n",
          timedOut: false,
        });
      return Promise.resolve({
        code: 0,
        out: "40000000000\n",
        timedOut: false,
      });
    },
  });
  const plan = await target.plan({
    mode: "plan",
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
  });
  expect(calls).toHaveLength(3);
  expect(calls.every((call) => call.startsWith("fixture-host-wsl:"))).toBe(
    false,
  );
  expect(plan[0]?.bytes).toBe(10_000_000_000);
  expect(plan[0]?.reason).toContain(
    "allocated 37.3GB logical 46.6GB guest-used 27.9GB",
  );
  expect(plan[0]?.reason).toContain("reclaimable gap 9.3GB");
  expect(plan[0]?.verdict).toBe("KEEP");
});

test("vhdx missing measurements remain unknown and run refuses", async () => {
  const target = createVhdxTarget({
    runner: (_host, script) =>
      Promise.resolve(
        script === "$probe"
          ? { code: 0, out: "vhdx_path=C:\\data\\ext4.vhdx\n", timedOut: false }
          : { code: 2, out: "measurement unavailable", timedOut: false },
      ),
  });
  const plan = await target.plan({
    mode: "plan",
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
  });
  expect(plan[0]?.bytes).toBeNull();
  expect(plan[0]?.reason).toContain("allocated ? logical ? guest-used ?");
  expect(
    target.act(plan[0]!, {
      mode: "run",
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
    }),
  ).toEqual({ ok: false, bytes_freed: null, error: "vhdx is plan-only" });
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
    context: {
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
    },
    explicit: ["vhdx"],
    yes: true,
    headroom: { drives: [] },
  });
  expect(result.exit).toBe(2);
  expect(result.error).toContain("plan-only");
  expect(calls).toBe(0);
});
