// bun test for scripts/config-map.ts — the completeness gate over scripts/config-registry.ts.
// The negative half matters: an unregistered config file and a row naming a missing source must
// each be reported, all in one run; exclusions must stay narrow.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { surfaces, type Surface } from "../config-registry.ts";
import { findings } from "../config-map.ts";

const row = (sources: string[]): Surface => ({
  kind: "in-place",
  when: "all",
  sources,
  deployed: "the checkout",
  consumer: "test",
  writer: "test",
  verify: "none",
});

describe("config-map findings", () => {
  test("a file under a registered directory or equal to a source is covered", () => {
    expect(
      findings(
        [row(["mise.toml", "karabiner"])],
        ["mise.toml", "karabiner/karabiner.json"],
      ),
    ).toEqual([]);
  });

  test("an unregistered config file is reported", () => {
    const f = findings(
      [row(["mise.toml"])],
      ["mise.toml", "new-tool/config.toml"],
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toStartWith("unregistered: new-tool/config.toml");
  });

  test("a prefix that is not a path segment does not cover (karabiner ≠ karabiner-old)", () => {
    expect(
      findings([row(["karabiner"])], ["karabiner-old/a.json"]),
    ).toHaveLength(1);
  });

  test("tests, fixtures, examples and archives are excluded; a sibling of them is not", () => {
    expect(
      findings(
        [row(["mise.toml"])],
        [
          "a/tests/x.json",
          "a/fixtures/y.json",
          "a/examples/z.json",
          "archives/w.toml",
          "goal.example.json",
        ],
      ),
    ).toEqual([]);
    expect(findings([row(["mise.toml"])], ["a/testsuite/x.json"])).toHaveLength(
      1,
    );
  });

  test("a row naming a missing source is reported, with the unregistered file, in one run", () => {
    const f = findings([row(["no/such/file.toml"])], ["other.json"]);
    expect(
      f
        .map((l) => l.split(":")[0])
        .toSorted((x, y) => (x ?? "").localeCompare(y ?? "")),
    ).toEqual(["missing", "unregistered"]);
  });
});

describe("the live registry", () => {
  test("every source a row names exists in this checkout", () => {
    expect(
      findings(surfaces(), []).filter((l) => l.startsWith("missing:")),
    ).toEqual([]);
  });

  test("every row states a verifier, or the explicit gap `none`", () => {
    expect(surfaces().filter((s) => s.verify.trim() === "")).toEqual([]);
  });

  test("the gate passes on this checkout (mise run lint:config-map)", () => {
    const r = Bun.spawnSync(
      ["bun", join(import.meta.dir, "..", "config-map.ts"), "--check"],
      {
        timeout: 60_000,
      },
    );
    expect(r.stdout.toString()).toContain("every config file is registered");
    expect(r.exitCode).toBe(0);
  });
});
