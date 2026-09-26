// bun test for scripts/reclaim-vhdx.ts — the edition-branch method selection.
//
// The host probe (path resolution, gap measurement) was proven live. What is unit-tested is the
// branch a live run on ONE box cannot cover both sides of: Optimize-VHD where present (Pro), the
// diskpart fallback where absent (Home). Both paths must begin with the shutdown and name the
// vhdx.
import { describe, expect, test } from "bun:test";

import { pickMethod, probeFailure } from "../reclaim-vhdx";

const VHDX =
  "C:\\Users\\me\\AppData\\Local\\Packages\\x\\LocalState\\ext4.vhdx";

const DISTRO = "Ubuntu-24.04";

describe("pickMethod — one method per Windows edition", () => {
  test("Optimize-VHD is chosen when the Hyper-V module is present (Pro/Enterprise)", () => {
    const m = pickMethod(true);
    expect(m.name).toBe("Optimize-VHD");
    const steps = m.steps(VHDX, DISTRO);
    expect(
      steps.some((s) => s.includes("Optimize-VHD") && s.includes(VHDX)),
    ).toBe(true);
  });

  test("diskpart is the fallback when Optimize-VHD is absent (Home)", () => {
    const m = pickMethod(false);
    expect(m.name).toBe("diskpart");
    const steps = m.steps(VHDX, DISTRO);
    expect(
      steps.some((s) => s.includes("compact vdisk") && s.includes(VHDX)),
    ).toBe(true);
  });

  test("both editions shut the distro down FIRST — compaction is offline", () => {
    expect(pickMethod(true).steps(VHDX, DISTRO)[0]).toBe("wsl.exe --shutdown");
    expect(pickMethod(false).steps(VHDX, DISTRO)[0]).toBe("wsl.exe --shutdown");
  });

  test("both editions CLEAR SPARSE before compacting — compact refuses a sparse vhdx", () => {
    for (const avail of [true, false]) {
      const steps = pickMethod(avail).steps(VHDX, DISTRO);
      const sparseIdx = steps.findIndex((s) =>
        s.includes(`--manage ${DISTRO} --set-sparse false`),
      );
      const compactIdx = steps.findIndex(
        (s) => s.includes("compact vdisk") || s.includes("Optimize-VHD"),
      );
      expect(sparseIdx).toBeGreaterThan(-1);
      expect(compactIdx).toBeGreaterThan(sparseIdx); // clear sparse BEFORE compacting
    }
  });
});

describe("probeFailure — the transport is judged before the output is parsed", () => {
  test("a refused ssh names ssh and its error, not the vhdx lookup (2026-09-27)", () => {
    const msg = probeFailure(
      {
        code: 255,
        out: "ssh: connect to host r99 port 22: Connection refused\n",
        timedOut: false,
      },
      "r99",
    );
    expect(msg).toContain("ssh r99 exited 255");
    expect(msg).toContain("Connection refused");
    expect(msg).not.toContain("vhdx");
  });

  test("the local leg is reported as interop powershell.exe", () => {
    expect(
      probeFailure({ code: 0, out: "", timedOut: true }, "local"),
    ).toContain("interop powershell.exe timed out");
  });

  test("exit 0 with empty output is still a failure", () => {
    expect(
      probeFailure({ code: 0, out: "  \n", timedOut: false }, "r99"),
    ).toContain("returned nothing");
  });

  test("exit 0 with output passes through to parsing", () => {
    expect(
      probeFailure({ code: 0, out: "c_free=1\n", timedOut: false }, "r99"),
    ).toBeNull();
  });
});
