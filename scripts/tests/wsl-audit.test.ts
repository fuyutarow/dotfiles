// bun test for scripts/wsl-audit.ts — the guest+host resource audit.
//
// Unit tests against the exported pure helpers: judge(),
// parseKv() and toMntPath() are pure functions over already-collected readings, so they are
// host-independent. A fixture ssh binary also checks text/JSON output through the CLI; it does
// not validate Windows counters or the real ssh/interop transports.
//
// THE REASON THIS FILE EXISTS is the memory-PSI corroboration gate. That gate was added because
// warning on memory PSI alone fired permanently on a healthy WSL2 guest (dropCache refaults, not
// shortage). Proving it now stays SILENT is only half a proof: a condition that can never speak
// is indistinguishable from a deleted check, and it would sit in the monitor as dead code that
// looks like coverage. So every corroboration branch is exercised in both directions.
import { describe, expect, test } from "bun:test";
import { mkdtemp, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { jsonText } from "../../agents/hooks/zod";
import { judge, parseKv, toMntPath } from "../wsl-audit";

const GB = 1024 ** 3;

// A guest reading with no problems: lots of memory, no swap, no reclaim, a third of the disk.
function healthyGuest(over: Record<string, string> = {}): Map<string, string> {
  return new Map(
    Object.entries({
      nproc: "12",
      load1: "1.0",
      cpu_psi: "0.5",
      cpu_psi300: "0.4",
      mem_psi: "0.0",
      mem_psi300: "0.0",
      io_psi: "0.0",
      io_psi300: "0.0",
      mem_total: String(55 * GB),
      mem_avail: String(43 * GB),
      swap_total: String(16 * GB),
      swap_free: String(16 * GB),
      pgscan: "0",
      pgscan_rate: "0",
      disk_total: String(1000 * GB),
      disk_used: String(360 * GB),
      disk_avail: String(590 * GB),
      ...over,
    }),
  );
}

function healthyHost(over: Record<string, string> = {}): Map<string, string> {
  return new Map(
    Object.entries({
      host_ram_total: String(64 * GB),
      host_ram_free: String(20 * GB),
      host_c_total: String(930 * GB),
      host_c_free: String(400 * GB),
      host_cpu_pct: "20",
      host_cpu_perf_pct: "125",
      host_vmmem: String(39 * GB),
      host_cpu_max: "25",
      host_cpu_n: "3",
      host_ram_avail: String(20 * GB),
      host_pagereads: "0",
      host_spin: "0",
      host_spin_names: "",
      host_crashes_1h: "0",
      ...over,
    }),
  );
}

const keys = (g: Map<string, string>, h: Map<string, string>) =>
  judge(g, h)
    .map((f) => f.key)
    .toSorted();

describe("wsl-audit — host CPU throttling", () => {
  test.each([
    ["125", "70", false],
    ["70", "70", true],
    ["70", "20", false],
    ["89.9", "50", true],
    ["90", "50", false],
    ["70", "49", false],
    ["70", "49.999", false],
    ["na", "70", false],
    ["", "70", false],
    ["invalid", "70", false],
    ["70", "na", false],
  ])("performance %s with CPU time %s warns=%s", (perf, cpu, warns) => {
    const h = parseKv(
      `host_cpu_perf_pct=${perf}\nhost_cpu_pct=${cpu}\nhost_cpu_n=3`,
    );
    const findings = judge(healthyGuest(), h);
    expect(findings.map((f) => f.key)).toEqual(
      warns ? ["host-cpu-throttle"] : [],
    );
    if (warns) {
      expect(findings[0]?.level).toBe("WARN");
      expect(findings[0]?.text).toContain("<90%");
      expect(findings[0]?.text).toContain(">=50%");
    }
  });

  test("wsl-audit reports performance beside CPU time in text and in --json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wsl-audit-performance-"));
    await using _cleanup = {
      [Symbol.asyncDispose]: () => rm(dir, { recursive: true, force: true }),
    };
    const ssh = join(dir, "ssh");
    const guest = [
      ...healthyGuest({
        disk_used: String(950 * GB),
        top1: "worker 12.345% 10MB",
      }),
    ]
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const host = [
      ...healthyHost({
        host_cpu_pct: "83.33333333333333",
        host_cpu_perf_pct: "70.66666666666667",
        host_cpu_max: "91.234",
      }),
    ]
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    await Bun.write(
      ssh,
      `#!${process.execPath}
const host = process.argv.includes("audit-host");
process.stdout.write(host ? ${JSON.stringify(host)} : ${JSON.stringify(guest)});
`,
    );
    await chmod(ssh, 0o755);
    for (const flags of [[], ["--json"]]) {
      const proc = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dir, "../wsl-audit.ts"),
          "--guest",
          "audit-guest",
          "--host",
          "audit-host",
          ...flags,
        ],
        {
          env: { ...process.env, PATH: `${dir}:${process.env["PATH"] ?? ""}` },
          stdout: "pipe",
          stderr: "pipe",
          signal: AbortSignal.timeout(10_000),
        },
      );
      const [out, err, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      expect(err).toBe("");
      expect(code).toBe(0);
      if (flags.length > 0) {
        const parsed = jsonText.safeParse(out);
        expect(parsed.success).toBe(true);
        expect(parsed.data).toMatchObject({
          host: {
            host_cpu_pct: "83.33333333333333",
            host_cpu_perf_pct: "70.66666666666667",
          },
          findings: [
            { key: "guest-disk", level: "WARN" },
            { key: "host-cpu-throttle", level: "WARN" },
            { key: "host-cpu", level: "WARN" },
          ],
        });
      } else {
        expect(out).toContain(
          "83.3% mean of 3 (max 91.2%)   processor performance 70.7% mean of rated speed",
        );
        expect(out).toContain("WARN  host CPU throttling:");
        expect(out).toContain(
          "performance 70.7% mean of rated speed (<90.0%) with CPU time 83.3% (>=50.0%)",
        );
        expect(out).toContain("worker 12.3% 10MB");
        expect(out).toContain("(95.0%)");
        expect(out).toContain("guest / at 95.0% used");
        const percentages = out.match(/\d+(?:\.\d+)?%/gu) ?? [];
        expect(percentages.length).toBeGreaterThan(0);
        expect(percentages.every((pct) => /^\d+\.\d%$/u.test(pct))).toBe(true);
      }
    }
  });
});

describe("judge — baseline", () => {
  test("a healthy pair produces no findings at all", () => {
    expect(judge(healthyGuest(), healthyHost())).toEqual([]);
  });
});

describe("judge — memory PSI raises nothing on WSL2 (it is a diagnostic)", () => {
  // Three attempts were made to turn memory PSI into an alarm and all three fired on a healthy
  // machine, because .wslconfig leaves autoMemoryReclaim at its dropCache default: WSL drops the
  // guest page cache, the refaults stall tasks, and PSI counts exactly that. These pin the
  // decision so a fourth attempt has to argue with a test rather than with a comment.
  test("sustained memory PSI alone raises nothing", () => {
    const g = healthyGuest({ mem_psi: "73.7", mem_psi300: "66.15" });
    expect(keys(g, healthyHost())).toEqual([]);
  });

  test("memory PSI with active reclaim STILL raises nothing when memory is plentiful", () => {
    // Measured 2026-09-14: reclaim at 12000 pages/s with 41.5GB of 54.9GB available — the kernel
    // recycling cache under a write load, which is the system working.
    const g = healthyGuest({
      mem_psi300: "46.41",
      pgscan_rate: "12000",
      mem_avail: String(41.5 * GB),
    });
    expect(keys(g, healthyHost())).toEqual([]);
  });

  test("a huge cumulative pgscan raises nothing — the counter never decreases", () => {
    const g = healthyGuest({
      mem_psi300: "66.15",
      pgscan: "8358408",
      pgscan_rate: "0",
    });
    expect(keys(g, healthyHost())).toEqual([]);
  });

  // What a REAL guest shortage does, and these rows are the ones that carry it.
  test("exhausted MemAvailable warns on its own merits", () => {
    const g = healthyGuest({ mem_psi300: "66.15", mem_avail: String(2 * GB) });
    expect(keys(g, healthyHost())).toEqual(["mem-avail"]);
  });

  test("real swap use warns on its own merits", () => {
    const g = healthyGuest({
      mem_psi300: "66.15",
      swap_free: String(14 * GB), // 2 GB used
    });
    expect(keys(g, healthyHost())).toEqual(["swap-used"]);
  });

  test("CPU and IO PSI DO still alarm — the artifact is specific to memory", () => {
    expect(keys(healthyGuest({ cpu_psi300: "55" }), healthyHost())).toEqual([
      "psi-cpu",
    ]);
    expect(keys(healthyGuest({ io_psi300: "75" }), healthyHost())).toEqual([
      "psi-io",
    ]);
  });

  // The floors are separate because the two metrics have different normal ranges here. The
  // observed IO maximum under wanted work (ccc indexing) was 23.57, so a value in that band must
  // stay silent while the same number on the CPU side is far outside its 0.08-0.62 range.
  test("IO PSI inside its observed-normal band is silent; the same value on CPU is not", () => {
    expect(keys(healthyGuest({ io_psi300: "23.57" }), healthyHost())).toEqual(
      [],
    );
    expect(keys(healthyGuest({ cpu_psi300: "23.57" }), healthyHost())).toEqual([
      "psi-cpu",
    ]);
  });

  test("a 10-second PSI spike with a calm 5-minute window is SILENT", () => {
    const g = healthyGuest({
      io_psi: "20.42",
      io_psi300: "3.39",
      cpu_psi: "48",
      cpu_psi300: "0.08",
    });
    expect(keys(g, healthyHost())).toEqual([]);
  });

  test("a sustained 5-minute window warns even when the 10-second one has calmed", () => {
    const g = healthyGuest({ io_psi: "0.4", io_psi300: "82.5" });
    expect(keys(g, healthyHost())).toEqual(["psi-io"]);
  });
});

describe("judge — C: is the drive that actually runs out", () => {
  test("12.4% free warns but is not critical", () => {
    const h = healthyHost({ host_c_free: String(115 * GB) });
    const f = judge(healthyGuest(), h);
    expect(f.map((x) => x.key)).toEqual(["c-free"]);
    expect(f[0]?.level).toBe("WARN");
  });

  test("below 8% escalates to CRIT, not a second WARN", () => {
    const h = healthyHost({ host_c_free: String(40 * GB) });
    const f = judge(healthyGuest(), h);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ key: "c-free", level: "CRIT" });
  });

  test("a healthy C: is silent", () => {
    expect(keys(healthyGuest(), healthyHost())).toEqual([]);
  });
});

describe("judge — the host-side failures the guest cannot see", () => {
  test("spinning processes are reported with their names", () => {
    const h = healthyHost({
      host_spin: "7",
      host_spin_names: "sshd:254000s pwsh:251000s",
    });
    const f = judge(healthyGuest(), h);
    expect(f.map((x) => x.key)).toEqual(["host-spin"]);
    expect(f[0]?.text).toContain("sshd:254000s");
    // CPU time flags long-lived live sessions too; the finding must point at the structural reaper.
    expect(f[0]?.text).toContain("mise run wsl:reap");
  });

  test("a single service crash in the last hour is already a finding", () => {
    expect(keys(healthyGuest(), healthyHost({ host_crashes_1h: "1" }))).toEqual(
      ["host-crashes"],
    );
  });

  test("host CPU saturation is reported even when the guest looks idle", () => {
    expect(keys(healthyGuest(), healthyHost({ host_cpu_pct: "95" }))).toEqual([
      "host-cpu",
    ]);
  });
});

describe("judge — host memory starvation (available, corroborated by hard reads)", () => {
  test("low available memory ALONE is silent — Windows caches to near-zero free by design", () => {
    const h = healthyHost({
      host_ram_avail: String(1.65 * GB),
      host_pagereads: "0",
    });
    expect(keys(healthyGuest(), h)).toEqual([]);
  });

  // The recovering host measured on 2026-09-14: available climbing back, pages/sec still spiking
  // from dirty-page writeback, but the reads that actually block already at single digits.
  test("a recovering host is silent — writeback spikes are not a shortage", () => {
    const h = healthyHost({
      host_ram_avail: String(2.28 * GB),
      host_pagereads: "15",
    });
    expect(keys(healthyGuest(), h)).toEqual([]);
  });

  test("low available AND sustained hard reads DOES warn", () => {
    const h = healthyHost({
      host_ram_avail: String(0.7 * GB),
      host_pagereads: "2861",
    });
    const f = judge(healthyGuest(), h);
    expect(f.map((x) => x.key)).toEqual(["host-mem"]);
    expect(f[0]?.text).toContain("2861 hard page reads/s");
  });

  test("hard reads with plenty of memory available is not a memory finding", () => {
    const h = healthyHost({
      host_ram_avail: String(20 * GB),
      host_pagereads: "2861",
    });
    expect(keys(healthyGuest(), h)).toEqual([]);
  });
});

describe("judge — a missing reading is never read as a healthy zero", () => {
  test("an empty host map produces no host findings rather than false CRITs", () => {
    expect(judge(healthyGuest(), new Map())).toEqual([]);
  });

  test("an empty guest map produces no guest findings", () => {
    expect(judge(new Map(), healthyHost())).toEqual([]);
  });

  test("'na' from a kernel without PSI is not treated as 0 or as a breach", () => {
    const g = healthyGuest({
      mem_psi: "na",
      mem_psi300: "na",
      cpu_psi: "na",
      cpu_psi300: "na",
      io_psi: "na",
      io_psi300: "na",
    });
    expect(keys(g, healthyHost())).toEqual([]);
  });
});

describe("parseKv — the transport is not the contract", () => {
  test("keeps bare key=value lines and drops everything else", () => {
    const out = [
      "Preparing modules for first use.",
      "#< CLIXML",
      "host_c_free=123",
      '<Objs Version="1.1.0.1"><Obj S="progress" /></Objs>',
      "  host_spin=0  ",
      "not a pair",
      "Host key verification banner: hello",
    ].join("\n");
    expect(Object.fromEntries(parseKv(out))).toEqual({
      host_c_free: "123",
      host_spin: "0",
    });
  });

  test("an empty value survives as an empty string, not as a missing key", () => {
    expect(parseKv("host_spin_names=").get("host_spin_names")).toBe("");
  });
});

describe("toMntPath — a wrong path would make du report 0 and read as 'tiny vhdx'", () => {
  test("strips the \\\\?\\ prefix and lowercases the drive", () => {
    expect(toMntPath("\\\\?\\C:\\Users\\me\\AppData\\Local\\wsl\\abc")).toBe(
      "/mnt/c/Users/me/AppData/Local/wsl/abc",
    );
  });

  test("handles a plain drive path", () => {
    expect(toMntPath("D:\\wsl\\Ubuntu")).toBe("/mnt/d/wsl/Ubuntu");
  });

  test("returns null rather than guessing on anything unexpected", () => {
    expect(toMntPath("")).toBeNull();
    expect(toMntPath("/already/posix")).toBeNull();
    expect(toMntPath("\\\\server\\share\\x")).toBeNull();
  });
});
