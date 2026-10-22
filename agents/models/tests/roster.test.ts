import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Choice,
  criterionFor,
  loadRoster,
  rosterPolicy,
  rosterTable,
  ROUTING_OBJECTIVE,
} from "../roster.ts";

const routeBias = [
  ["no", "codex", "row"],
  ["choose", "codex"],
  ["when", "codex", "and", "claude", "rows", "are", "comparable"],
].map((words) => words.join(" "));

describe("dispatch roster", () => {
  test("committed policy restricts auto-pick but retains every rendered row", async () => {
    const loaded = await loadRoster();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.auto.routes).toEqual(["codex"]);
    for (const row of loaded.value.choice)
      expect(rosterTable(loaded.value)).toContain(`\`${row.id}\``);
  });

  test("route allowlist is optional and rejects empty or unknown routes naming known routes", async () => {
    const folder = await mkdtemp(join(tmpdir(), "dispatch-roster-routes-"));
    const original = await Bun.file(
      join(import.meta.dir, "..", "dispatch-roster.toml"),
    ).text();
    const path = join(folder, "routes.toml");
    for (const routes of [
      undefined,
      "[]",
      '["nope"]',
      '["codex", "nope"]',
      '["claude"]',
      '["codex", "claude"]',
    ]) {
      await writeFile(
        path,
        original.replace(
          /^routes = .*\n/mu,
          routes === undefined ? "" : `routes = ${routes}\n`,
        ),
      );
      const loaded = await loadRoster(path);
      const invalid = routes === "[]" || routes?.includes("nope") === true;
      expect(loaded.ok).toBe(!invalid);
      if (!loaded.ok) {
        expect(loaded.error).toContain("codex");
        expect(loaded.error).toContain("claude");
      } else if (routes === undefined)
        expect(loaded.value.auto.routes).toBeUndefined();
    }
    await rm(folder, { recursive: true, force: true });
  });

  test("routing objective excludes local history and criteria contain only roster evidence", async () => {
    for (const branch of [
      "A. Capability sufficiency (hard)",
      "B. Expected time to an accepted return",
      "C. Cost and subscription health",
    ])
      expect(ROUTING_OBJECTIVE).toContain(branch);
    expect(ROUTING_OBJECTIVE).not.toMatch(
      /history|prior|accepted\/partial\/rejected/iu,
    );
    expect(ROUTING_OBJECTIVE).toContain("7-day windows most");
    const loaded = await loadRoster();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const criterion = criterionFor(loaded.value, loaded.value.choice[0]!);
    expect(criterion).not.toMatch(
      /graded|history|recent|comparable|accepted/iu,
    );
  });
  test("loads all 40 route and effort rows with generation-specific Sol 6.0 ids", async () => {
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
    const sol6 = loaded.value.choice.filter((row) =>
      row.id.startsWith("sol6-"),
    );
    expect(sol6).toHaveLength(5);
    expect(sol6.map((row) => row.effort)).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    const evidence = [
      ["low", 34, 9.1, 50.2],
      ["medium", 40, 18.7, 53.8],
      ["high", 42, 26.3, 54.9],
      ["xhigh", 44, 30.3, 55.1],
      ["max", 48, 43.9, 57.6],
    ] as const satisfies ReadonlyArray<
      readonly [Choice["effort"], number, number, number]
    >;
    for (const [effort, aaIndex, tb4, scicode] of evidence) {
      const row = sol6.find((candidate) => candidate.effort === effort);
      if (row === undefined) {
        expect(row).toBeDefined();
        continue;
      }
      expect(row.model).toBe("gpt-6-sol");
      expect([row.aa_index, row.tb4, row.scicode]).toEqual([
        aaIndex,
        tb4,
        scicode,
      ]);
      expect(row.coding_agent).toBeUndefined();
      expect(row.tb4_source).toStartWith(
        "https://artificialanalysis.ai/models/comparisons/gpt-6-sol",
      );
      expect(row.scicode_source).toBe(row.tb4_source);
      const criterion = criterionFor(loaded.value, row);
      expect(criterion).toContain("Published benchmark snapshot");
      expect(criterion).toContain("measurement date unknown");
      expect(criterion).not.toContain(loaded.value.as_of);
      expect(criterion).not.toMatch(/graded|history|recent|comparable/iu);
      expect(row.price_in).toBe(2);
      expect(row.price_cached_in).toBe(0.2);
      expect(row.price_out).toBe(10);
    }
    expect(loaded.value.choice.some((row) => row.model === "gpt-6.1-sol")).toBe(
      false,
    );
    for (const id of [
      "sol-low",
      "sol-medium",
      "sol-high",
      "sol-xhigh",
      "sol-max",
    ])
      expect(loaded.value.choice.some((row) => row.id === id)).toBe(false);

    const rendered = rosterTable(loaded.value);
    const source =
      "([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra))";
    const expected = [
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
    expect(criterionFor(loaded.value, sol6[0]!)).toContain(
      "Artificial Analysis v4.3.2, accessed 2026-10-22; measurement date unknown; SciCode under review",
    );
  });

  test("allows unknown Jev list prices", async () => {
    const folder = await mkdtemp(join(tmpdir(), "dispatch-roster-price-"));
    const original = await Bun.file(
      join(import.meta.dir, "..", "dispatch-roster.toml"),
    ).text();
    const path = join(folder, "missing-price.toml");
    await writeFile(
      path,
      original.replace("price_per_mtok_output = 0.0\n", ""),
    );
    const loaded = await loadRoster(path);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.auto.jev.price_per_mtok_input).toBe(0.042);
      expect(loaded.value.auto.jev.price_per_mtok_output).toBeUndefined();
    }
    await rm(folder, { recursive: true, force: true });
  });

  test("default must name a codex-route row", async () => {
    const folder = await mkdtemp(join(tmpdir(), "dispatch-roster-test-"));
    const original = await Bun.file(
      join(import.meta.dir, "..", "dispatch-roster.toml"),
    ).text();
    const path = join(folder, "invalid.toml");
    await writeFile(
      path,
      original.replace('default = "luna-high"', 'default = "sonnet-medium"'),
    );
    const loaded = await loadRoster(path);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok)
      expect(loaded.error).toContain("default must name a codex-route");
    await rm(folder, { recursive: true, force: true });
  });

  test("rendered roster policy describes the six worker commands", async () => {
    const loaded = await loadRoster();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const policy = rosterPolicy(loaded.value);
    expect(routeBias.every((phrase) => !policy.includes(phrase))).toBe(true);
    expect(
      loaded.value.choice
        .filter((row) => row.route === "claude")
        .every(
          (row) => !/codex|no claude row|when no .* row/iu.test(row.use_for),
        ),
    ).toBe(true);
    expect(
      loaded.value.choice.find((row) => row.id === "luna-max")?.use_for,
    ).not.toMatch(/claude/iu);
    for (const command of [
      "agx worker dispatch",
      "agx worker run",
      "agx worker check",
      "agx worker ls",
      "agx worker judge",
      "agx worker stats",
    ])
      expect(policy).toContain(command);
    expect(policy).toContain(
      "systemd-run --user -E CLAUDE_CODE_SESSION_ID -E CODEX_SESSION_ID --unit=agt_<slug> --collect -- agx worker run",
    );
    expect(policy).toContain("--continue");
    expect(policy).not.toMatch(
      /\bagx\s+(?:run|dispatch|check|ls|judge|stats|roster|doctor|jev)\b/u,
    );
    expect(policy).not.toMatch(/\bagx-worker\s+jev\b/u);
    expect(policy).not.toContain("RESOURCE-CLASS");
    expect(policy).not.toContain("Ticket amend");
  });
});
