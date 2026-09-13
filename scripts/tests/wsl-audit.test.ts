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
      mem_psi: "0.0",
      io_psi: "0.0",
      mem_total: String(55 * GB),
      mem_avail: String(43 * GB),
      swap_total: String(16 * GB),
      swap_free: String(16 * GB),
      pgscan: "0",
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
  const dropCache = healthyGuest({ mem_psi: "44.6", pgscan: "0" });

  test("high memory PSI ALONE is silent — WSL drops the page cache, that is not a shortage", () => {
    expect(keys(dropCache, healthyHost())).toEqual([]);
  });

  test("PSI plus kernel reclaim (pgscan > 0) DOES warn", () => {
    const g = healthyGuest({ mem_psi: "44.6", pgscan: "918273" });
    expect(keys(g, healthyHost())).toEqual(["psi-memory"]);
    expect(judge(g, healthyHost())[0].text).toContain("pgscan=918273");
  });

  test("PSI plus swap in use DOES warn", () => {
    const g = healthyGuest({
      mem_psi: "44.6",
      swap_free: String(14 * GB), // 2 GB used
    });
    // swap-used has its own finding above 1 GB; psi-memory must appear alongside it.
    expect(keys(g, healthyHost())).toEqual(["psi-memory", "swap-used"]);
  });

  test("PSI plus a genuinely low MemAvailable DOES warn", () => {
    const g = healthyGuest({ mem_psi: "44.6", mem_avail: String(2 * GB) });
    expect(keys(g, healthyHost())).toEqual(["mem-avail", "psi-memory"]);
  });

  test("corroboration is irrelevant when PSI itself is low", () => {
    const g = healthyGuest({ mem_psi: "1.2", pgscan: "918273" });
    expect(keys(g, healthyHost())).toEqual([]);
  });

  test("CPU and IO PSI are NOT gated — the artifact is specific to memory", () => {
    expect(keys(healthyGuest({ cpu_psi: "55" }), healthyHost())).toEqual([
      "psi-cpu",
    ]);
    expect(keys(healthyGuest({ io_psi: "55" }), healthyHost())).toEqual([
      "psi-io",
    ]);
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

describe("judge — a missing reading is never read as a healthy zero", () => {
  test("an empty host map produces no host findings rather than false CRITs", () => {
    expect(judge(healthyGuest(), new Map())).toEqual([]);
  });

  test("an empty guest map produces no guest findings", () => {
    expect(judge(new Map(), healthyHost())).toEqual([]);
  });

  test("'na' from a kernel without PSI is not treated as 0 or as a breach", () => {
    const g = healthyGuest({ mem_psi: "na", cpu_psi: "na", io_psi: "na" });
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
