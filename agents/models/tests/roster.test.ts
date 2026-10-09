import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRoster, rosterPolicy, rosterTable } from "../roster.ts";

describe("dispatch roster", () => {
  test("loads all 40 route and effort rows with optional prices and benchmarks", async () => {
    const loaded = await loadRoster();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.choice).toHaveLength(40);
    expect(loaded.value.auto.jev).toMatchObject({
      price_per_mtok_input: 0.042,
      price_per_mtok_output: 0,
    });
    expect(new Set(loaded.value.choice.map((row) => row.route))).toEqual(
      new Set(["codex", "claude"]),
    );
    expect(
      loaded.value.choice.find((row) => row.id === "terra-max"),
    ).toMatchObject({
      route: "codex",
      model: "gpt-5.6-terra",
      effort: "max",
    });
    const terra = loaded.value.choice.find((row) => row.id === "terra-low");
    expect(terra).toMatchObject({
      price_in: 2,
      price_cached_in: 0.2,
      price_out: 12,
    });
    expect(loaded.value.choice.find((row) => row.id === "astra-low")?.tb4).toBe(
      41.9,
    );
    expect(rosterTable(loaded.value)).toContain("$0.10/$0.01/$0.50");
    expect(rosterTable(loaded.value)).toContain("$2/—/$10");
    const rendered = rosterTable(loaded.value);
    const source =
      "([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra))";
    const expected = [
      ["sol-low", 30.8, 53.2],
      ["sol-medium", 48, 53.2],
      ["sol-high", 51.5, 55.8],
      ["sol-xhigh", 54, 55.7],
      ["sol-max", 56.1, 54.2],
      ["astra-low", 41.9, 54.1],
      ["astra-medium", 49.5, 54.2],
      ["astra-high", 54, 55.4],
      ["astra-xhigh", 59.6, 55.7],
      ["astra-max", 59.1, 56.5],
    ] as const;
    for (const [id, tb4, scicode] of expected) {
      const row = rendered
        .split("\n")
        .find((line) => line.includes(`\`${id}\``));
      expect(row).toContain(`${tb4} ${source}`);
      expect(row).toContain(`${scicode} ${source}`);
    }
    const terraSource =
      "([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-astra-vs-gpt-5-6-terra))";
    const terraExpected = [
      ["terra-low", 1.5, 49.9],
      ["terra-medium", 1, 50.5],
      ["terra-high", 1.5, 52.4],
      ["terra-xhigh", 10.1, 52.3],
      ["terra-max", 35.4, 55],
    ] as const;
    for (const [id, tb4, scicode] of terraExpected) {
      const row = rendered
        .split("\n")
        .find((line) => line.includes(`\`${id}\``));
      expect(row).toContain(`${tb4} ${terraSource}`);
      expect(row).toContain(`${scicode} ${terraSource}`);
    }
    expect(rosterTable(loaded.value)).toContain("$2/$0.20/$12");
  });

  test("allows unknown Jev list prices", async () => {
    const folder = mkdtempSync(join(tmpdir(), "dispatch-roster-price-"));
    const original = await Bun.file(
      join(import.meta.dir, "..", "dispatch-roster.toml"),
    ).text();
    const path = join(folder, "missing-price.toml");
    writeFileSync(path, original.replace("price_per_mtok_output = 0.0\n", ""));
    const loaded = await loadRoster(path);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.auto.jev.price_per_mtok_input).toBe(0.042);
      expect(loaded.value.auto.jev.price_per_mtok_output).toBeUndefined();
    }
    rmSync(folder, { recursive: true, force: true });
  });

  test("default must name a codex-route row", async () => {
    const folder = mkdtempSync(join(tmpdir(), "dispatch-roster-test-"));
    const original = await Bun.file(
      join(import.meta.dir, "..", "dispatch-roster.toml"),
    ).text();
    const path = join(folder, "invalid.toml");
    writeFileSync(
      path,
      original.replace('default = "luna-high"', 'default = "sonnet-medium"'),
    );
    const loaded = await loadRoster(path);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok)
      expect(loaded.error).toContain("default must name a codex-route");
    rmSync(folder, { recursive: true, force: true });
  });

  test("rendered roster policy gives codex the tie-break when capability is comparable", async () => {
    const loaded = await loadRoster();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const policy = rosterPolicy(loaded.value);
    const sentence = policy.split("\n")[0] ?? "";
    expect(sentence).toContain(
      "when a codex and a claude row are comparable, pick codex",
    );
    expect(policy).toContain("`--choice` is refused");
    expect(policy).toContain("the default `luna-high` runs");
    expect(policy).toContain("hard worker bound defaults to 600 seconds");
    expect(policy).toContain("hard maximum 14400");
    expect(policy).toContain("values above 600 require `timeout_reason`");
    expect(policy).toContain("outcome `returned`");
  });
});
