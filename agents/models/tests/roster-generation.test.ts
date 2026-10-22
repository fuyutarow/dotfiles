import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attempt, errorMessage } from "../../hooks/attempt.ts";
import { loadRoster } from "../roster.ts";

const committedRoster = Bun.file(
  join(import.meta.dir, "..", "dispatch-roster.toml"),
);

async function committedModel(id: string): Promise<string> {
  const source = await committedRoster.text();
  const row = new RegExp(
    `\\[\\[choice\\]\\]\\nid = "${id}"\\nroute = "[^"]+"\\nmodel = "([^"]+)"`,
    "u",
  );
  const model = row.exec(source)?.[1];
  if (model === undefined)
    return expect.unreachable(`fixture row ${id} is missing`);
  return model;
}

async function loadWithModelChanges(changes: Readonly<Record<string, string>>) {
  const folder = await mkdtemp(join(tmpdir(), "dispatch-roster-generation-"));
  const path = join(folder, "fixture.toml");
  let source = await committedRoster.text();
  const result = await attempt(async () => {
    for (const [id, model] of Object.entries(changes)) {
      const row = new RegExp(
        `(\\[\\[choice\\]\\]\\nid = "${id}"\\nroute = "[^"]+"\\nmodel = ")[^"]+(")`,
        "u",
      );
      expect(source).toMatch(row);
      source = source.replace(row, `$1${model}$2`);
    }
    await writeFile(path, source);
    return loadRoster(path);
  });
  await rm(folder, { recursive: true, force: true });
  if (!result.ok) return expect.unreachable(errorMessage(result.error));
  return result.value;
}

describe("dispatch roster model generations", () => {
  test("rejects Sol generations across choice ids and efforts with an actionable error", async () => {
    const currentSol = await committedModel("sol6-low");
    const alternateSol =
      currentSol === "gpt-6.1-sol" ? "gpt-6.0-sol" : "gpt-6.1-sol";
    const loaded = await loadWithModelChanges({ "sol6-low": alternateSol });
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error).toContain("model family sol");
      expect(loaded.error).toContain(currentSol);
      expect(loaded.error).toContain(alternateSol);
      expect(loaded.error).toContain("Keep one generation");
    }
  });

  test("allows all efforts of one exact Sol model", async () => {
    const loaded = await loadRoster();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      const solModel = await committedModel("sol6-low");
      expect(
        loaded.value.choice.filter((row) => row.model === solModel),
      ).toHaveLength(5);
    }
  });

  test("allows independent Sol, Astra, Luna, Terra, and Claude families", async () => {
    const loaded = await loadRoster();
    expect(loaded.ok).toBe(true);
  });

  test("rejects a second generation in another family", async () => {
    const loaded = await loadWithModelChanges({
      "sonnet-low": "claude-sonnet-5-4",
    });
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error).toContain("model family claude-sonnet");
      expect(loaded.error).toContain("claude-sonnet-5-4");
      expect(loaded.error).toContain("claude-sonnet-5-5");
    }
  });

  test("reports malformed supported-family slugs and keeps opaque custom slugs loadable", async () => {
    const malformed = await loadWithModelChanges({
      "sol6-low": "gpt-6..1-sol",
    });
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) {
      expect(malformed.error).toContain(
        "must use gpt-<numeric-generation>-sol",
      );
    }

    const malformedClaude = await loadWithModelChanges({
      "sonnet-low": "claude-sonnet-5",
    });
    expect(malformedClaude.ok).toBe(false);
    if (!malformedClaude.ok) {
      expect(malformedClaude.error).toContain(
        "must use claude-sonnet-<major>-<minor>",
      );
    }

    const opaque = await loadWithModelChanges({
      "sol6-low": "custom-catalog-v2",
    });
    expect(opaque.ok).toBe(true);

    const opaqueClaudeAlias = await loadWithModelChanges({
      "sonnet-low": "claude-sonnet-latest",
    });
    expect(opaqueClaudeAlias.ok).toBe(true);
  });
});

for (const [first, second] of [
  ["gpt-7-comet", "gpt-8-comet"],
  ["claude-comet-7-1", "claude-comet-8-1"],
  ["gpt-6-astra", "gpt-7-astra"],
] as const) {
  test(`rejects generic-family collision: ${first} / ${second}`, async () => {
    expect(
      (await loadWithModelChanges({ "sol6-low": first, "sol6-medium": second }))
        .ok,
    ).toBe(false);
  });
}
test("normalizes numeric generations without conflating independent families", async () => {
  expect((await loadWithModelChanges({ "sol6-low": "gpt-06.0-sol" })).ok).toBe(
    true,
  );
  expect(
    (
      await loadWithModelChanges({
        "sol6-low": "gpt-7-comet",
        "sol6-medium": "gpt-8-nova",
      })
    ).ok,
  ).toBe(true);
});
