// bun test for scripts/wsl-audit.ts — the guest+host resource audit.
//
// Layer 1 only (the house's "unit tests against the exported pure helpers" layer): judge(),
// parseKv() and toMntPath() are pure functions over already-collected readings, so they are
// host-independent and need no fixture binary. The transport legs are deliberately NOT tested
// here — they were proven end-to-end against the real host over both ssh and interop, and a mock
// of ssh would prove only that the mock works.
//
// THE REASON THIS FILE EXISTS is the memory-PSI corroboration gate. That gate was added because
// warning on memory PSI alone fired permanently on a healthy WSL2 guest (dropCache refaults, not
// shortage). Proving it now stays SILENT is only half a proof: a condition that can never speak
// is indistinguishable from a deleted check, and it would sit in the monitor as dead code that
// looks like coverage. So every corroboration branch is exercised in both directions.
import { describe, expect, test } from "bun:test";

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
    .sort();

describe("judge — baseline", () => {
  test("a healthy pair produces no findings at all", () => {
    expect(judge(healthyGuest(), healthyHost())).toEqual([]);
  });
});

describe("judge — memory PSI needs corroboration (the dropCache false positive)", () => {
  // The exact shape measured on r99 2026-09-13: PSI pinned high, and every counter that a real
  // shortage would move sitting at zero.
  const dropCache = healthyGuest({
    mem_psi: "44.6",
    mem_psi300: "44.0",
    pgscan: "0",
  });

  test("high memory PSI ALONE is silent — WSL drops the page cache, that is not a shortage", () => {
    expect(keys(dropCache, healthyHost())).toEqual([]);
  });

  test("PSI plus ACTIVE kernel reclaim DOES warn", () => {
    const g = healthyGuest({
      mem_psi: "44.6",
      mem_psi300: "44.0",
      pgscan_rate: "3500",
    });
    expect(keys(g, healthyHost())).toEqual(["psi-memory"]);
    expect(judge(g, healthyHost())[0].text).toContain("3500 pages/s");
  });

  // The cumulative-counter trap: pgscan never decreases, so a gate on the total stays open for
  // the rest of the boot. Measured on r99 with total 8,358,408 and a rate of 0.
  test("a huge pgscan TOTAL with a zero rate is silent — the counter is cumulative", () => {
    const g = healthyGuest({
      mem_psi: "73.7",
      mem_psi300: "66.15",
      pgscan: "8358408",
      pgscan_rate: "0",
    });
    expect(keys(g, healthyHost())).toEqual([]);
  });

  // The self-refuting corroboration: "swap in use 0.0GB" was accepted as evidence.
  test("a trace of swap is not corroboration — it would print as 0.0GB", () => {
    const g = healthyGuest({
      mem_psi300: "66.15",
      swap_free: String(16 * GB - 4 * 1024 * 1024), // 4 MB used
    });
    expect(keys(g, healthyHost())).toEqual([]);
  });

  test("PSI plus swap in use DOES warn", () => {
    const g = healthyGuest({
      mem_psi: "44.6",
      mem_psi300: "44.0",
      swap_free: String(14 * GB), // 2 GB used
    });
    // swap-used has its own finding above 1 GB; psi-memory must appear alongside it.
    expect(keys(g, healthyHost())).toEqual(["psi-memory", "swap-used"]);
  });

  test("PSI plus a genuinely low MemAvailable DOES warn", () => {
    const g = healthyGuest({
      mem_psi: "44.6",
      mem_psi300: "44.0",
      mem_avail: String(2 * GB),
    });
    expect(keys(g, healthyHost())).toEqual(["mem-avail", "psi-memory"]);
  });

  test("corroboration is irrelevant when PSI itself is low", () => {
    const g = healthyGuest({
      mem_psi: "1.2",
      mem_psi300: "1.1",
      pgscan_rate: "3500",
    });
    expect(keys(g, healthyHost())).toEqual([]);
  });

  test("CPU and IO PSI are NOT gated — the artifact is specific to memory", () => {
    expect(keys(healthyGuest({ cpu_psi300: "55" }), healthyHost())).toEqual([
      "psi-cpu",
    ]);
    expect(keys(healthyGuest({ io_psi300: "55" }), healthyHost())).toEqual([
      "psi-io",
    ]);
  });

  // The burst that produced the third false positive: ccc indexing drove IO PSI avg10 to 20.42
  // while avg60 was 6.24 and avg300 was 3.39. A 10-second spike is the workload, not a fault.
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
    const g = healthyGuest({ io_psi: "0.4", io_psi300: "41.2" });
    expect(keys(g, healthyHost())).toEqual(["psi-io"]);
  });
});

describe("judge — C: is the drive that actually runs out", () => {
  test("12.4% free warns but is not critical", () => {
    const h = healthyHost({ host_c_free: String(115 * GB) });
    const f = judge(healthyGuest(), h);
    expect(f.map((x) => x.key)).toEqual(["c-free"]);
    expect(f[0].level).toBe("WARN");
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
    expect(f[0].text).toContain("sshd:254000s");
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
    expect(f[0].text).toContain("2861 hard page reads/s");
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
