import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRoster, rosterTable } from "../roster.ts";

describe("dispatch roster", () => {
  test("loads all 35 route and effort rows with optional prices and benchmarks", async () => {
    const loaded = await loadRoster();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.choice).toHaveLength(35);
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
    expect(terra?.price_in).toBeUndefined();
    expect(terra?.price_out).toBeUndefined();
    expect(
      loaded.value.choice.find((row) => row.id === "astra-low")?.tb4,
    ).toBeUndefined();
    expect(rosterTable(loaded.value)).toContain("$0.10/$0.01/$0.50");
    expect(rosterTable(loaded.value)).toContain("—/—/—");
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
});
