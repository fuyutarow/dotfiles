// bun test for scripts/wsl-wake.ts — the host-selection logic only.
//
// Layer 1 (house pattern): the pure/injectable helpers. The ssh legs and the wake/sshd
// orchestration were proven end-to-end against the real host (the LAN alias fell back to the
// tailnet alias, the guest was verified reachable). What is unit-tested here is the one piece a
// live run cannot exercise deterministically: the fallback ORDER and the rule that an
// unreachable probe never counts as a win — the exact bug shipped and then fixed on 2026-09-17.
import { describe, expect, test } from "bun:test";

import { firstReachable, hostCandidates } from "../wsl-wake";

describe("hostCandidates — pin vs fallback", () => {
  test("no --host tries the LAN alias first, then the tailnet alias", () => {
    expect(hostCandidates(undefined)).toEqual(["r99-lan", "r99"]);
    expect(hostCandidates("")).toEqual(["r99-lan", "r99"]);
  });

  test("an explicit --host pins exactly that one alias", () => {
    expect(hostCandidates("r99")).toEqual(["r99"]);
  });
});

describe("firstReachable — order, fallback, and the false-win guard", () => {
  const probeFrom =
    (answers: Record<string, string | null>) =>
    (host: string): Promise<string | null> =>
      Promise.resolve(host in answers ? answers[host] : null);

  test("the first reachable host wins and later hosts are not probed", async () => {
    const probed: string[] = [];
    const probe = (host: string): Promise<string | null> => {
      probed.push(host);
      return Promise.resolve(
        host === "r99-lan" ? "* Ubuntu-24.04 Running 2" : null,
      );
    };
    const r = await firstReachable(["r99-lan", "r99"], probe);
    expect(r).toEqual({ host: "r99-lan", out: "* Ubuntu-24.04 Running 2" });
    expect(probed).toEqual(["r99-lan"]); // r99 never tried
  });

  test("falls through a null (unreachable) host to the next — the off-subnet case", async () => {
    const r = await firstReachable(
      ["r99-lan", "r99"],
      probeFrom({ "r99-lan": null, r99: "* Ubuntu-24.04 Stopped 2" }),
    );
    expect(r).toEqual({ host: "r99", out: "* Ubuntu-24.04 Stopped 2" });
  });

  test("an empty-string probe is NOT a win — it falls through like null", async () => {
    const r = await firstReachable(
      ["r99-lan", "r99"],
      probeFrom({ "r99-lan": "", r99: "* Ubuntu-24.04 Running 2" }),
    );
    expect(r?.host).toBe("r99");
  });

  test("all hosts unreachable returns null, never a false success", async () => {
    const r = await firstReachable(
      ["r99-lan", "r99"],
      probeFrom({ "r99-lan": null, r99: null }),
    );
    expect(r).toBeNull();
  });

  test("a pinned single host that is down returns null", async () => {
    const r = await firstReachable(["r99"], probeFrom({ r99: null }));
    expect(r).toBeNull();
  });
});
