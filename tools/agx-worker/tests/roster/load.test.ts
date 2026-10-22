import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { loadRoster } from "../../src/roster/load.ts";
import { loadRoster as loadLegacyRoster } from "../../../../agents/models/roster.ts";

const catalogPath = join(import.meta.dir, "../../src/roster/catalog.toml");
const examplePath = join(
  import.meta.dir,
  "../../src/roster/policy.example.toml",
);
const productionPath = join(
  import.meta.dir,
  "../../../../agents/models/dispatch-roster.toml",
);
const tempDirs: string[] = [];

async function withPolicy(contents: string) {
  const directory = await mkdtemp(join(tmpdir(), "agx-roster-test-"));
  tempDirs.push(directory);
  const policyPath = join(directory, "agx.toml");
  await writeFile(policyPath, contents, "utf8");
  return loadRoster({ catalogPath, policyPath });
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("roster loader", () => {
  test("catalog and example policy equal today's production roster", async () => {
    const [actual, expected] = await Promise.all([
      loadRoster({ catalogPath, policyPath: examplePath }),
      loadLegacyRoster(productionPath),
    ]);
    expect(actual.ok).toBe(true);
    expect(expected.ok).toBe(true);
    if (actual.ok && expected.ok) expect(actual.value).toEqual(expected.value);
  });

  test("exclude removes a catalog row", async () => {
    const example = await readFile(examplePath, "utf8");
    const result = await withPolicy(
      example.replace("exclude = []", 'exclude = ["luna-low"]'),
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.choice.some((row) => row.id === "luna-low")).toBe(
        false,
      );
  });

  test("unknown policy keys are rejected", async () => {
    const example = await readFile(examplePath, "utf8");
    const result = await withPolicy(
      example.replace("[route]\n", "[route]\nunknown = true\n"),
    );
    expect(result.ok).toBe(false);
  });

  test("missing policy schema is rejected", async () => {
    const example = await readFile(examplePath, "utf8");
    const result = await withPolicy(example.replace("schema = 1\n", ""));
    expect(result.ok).toBe(false);
  });

  test("unknown default is rejected", async () => {
    const example = await readFile(examplePath, "utf8");
    const result = await withPolicy(
      example.replace('default = "luna-high"', 'default = "missing-row"'),
    );
    expect(result.ok).toBe(false);
  });

  test("policy cannot change a catalog price", async () => {
    const example = await readFile(examplePath, "utf8");
    const result = await withPolicy(
      example.replace("[route]\n", "[route]\nprice_in = 999\n"),
    );
    expect(result.ok).toBe(false);
  });
});
