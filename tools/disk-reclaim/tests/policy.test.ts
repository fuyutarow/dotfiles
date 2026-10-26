import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CollectionPolicyError, loadCollectionPolicy } from "../src/policy.ts";

const config = `
graveyard_min_age_hours = 24
graveyard_pressure_undo_minutes = 10

[collection_policy.class_rules.ownerless_cache]
default_owner = "dotfiles"
ttl_days = 14

[collection_policy.class_rules.deregistered_index_db]
ttl_days = 7
`;

async function withPolicy(
  source: string,
  run: (path: string) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "collection-policy-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const path = join(root, "reclaim.toml");
  await writeFile(path, source);
  await run(path);
}

async function expectPolicyError(path: string, message: string): Promise<void> {
  const result = await loadCollectionPolicy(path);
  const error = result.isErr() ? result.error : null;
  expect(error).toBeInstanceOf(CollectionPolicyError);
  if (error instanceof CollectionPolicyError)
    expect(error.message).toContain(message);
}

test("loads declared class policy and derives its graveyard age curve", async () => {
  const result = await loadCollectionPolicy();
  expect(result.isOk()).toBe(true);
  if (result.isOk()) {
    const policy = result.value;
    expect(policy.undoWindowMinutes).toBe(10);
    expect(policy.graveyardMinAgeHours).toBe(24);
    expect(policy.recoverHeadroomGiB).toBe(48);
    expect(policy.denyHeadroomGiB).toBe(6);
    expect(policy.stopFloorGiB).toBe(4);
    expect(policy.classRules.ownerlessCache).toEqual({
      defaultOwner: "dotfiles",
      ttlDays: 14,
    });
    expect(policy.classRules.deregisteredIndexDb).toEqual({ ttlDays: 7 });
    expect(policy.graveyardMinAgeMinutesAt(48)).toBe(1440);
    expect(policy.graveyardMinAgeMinutesAt(27)).toBe(725);
    expect(policy.graveyardMinAgeMinutesAt(6)).toBe(10);
  }
});

test("rejects unknown collection policy keys with a named error", async () => {
  await withPolicy(
    config.replace("ttl_days = 7", "ttl_days = 7\nunknown = true"),
    async (path) => {
      await expectPolicyError(path, "unknown");
    },
  );
});

test("rejects an undo window below one minute", async () => {
  await withPolicy(
    config.replace(
      "graveyard_pressure_undo_minutes = 10",
      "graveyard_pressure_undo_minutes = 0.5",
    ),
    async (path) => {
      await expectPolicyError(path, "graveyard_pressure_undo_minutes");
    },
  );
});

test("rejects a missing class rule with its name", async () => {
  await withPolicy(
    config.replace(
      '[collection_policy.class_rules.ownerless_cache]\ndefault_owner = "dotfiles"\nttl_days = 14\n',
      "",
    ),
    async (path) => {
      await expectPolicyError(
        path,
        "collection_policy.class_rules.ownerless_cache",
      );
    },
  );
});
