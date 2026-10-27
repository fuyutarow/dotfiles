import { expect, test } from "bun:test";
import { fail } from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadGraveyardAgePolicy } from "../src/graveyard-age.ts";
import { loadCollectionPolicy } from "../src/policy.ts";

const GIB = 1024 ** 3;
const validPolicy = `
graveyard_min_age_hours = 24
graveyard_pressure_undo_minutes = 10

[collection_policy.class_rules.ownerless_cache]
default_owner = "dotfiles"
ttl_days = 14

[collection_policy.class_rules.deregistered_index_db]
ttl_days = 7
`;

async function withTempDirectory(
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "graveyard-age-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  await run(root);
}

async function writePolicy(
  root: string,
  source = validPolicy,
): Promise<string> {
  const path = join(root, "reclaim.toml");
  await writeFile(path, source);
  return path;
}

test("returns the relaxed age when injected free space meets recover headroom", async () => {
  await withTempDirectory(async (root) => {
    const policyPath = await writePolicy(root);
    const policy = await loadCollectionPolicy(policyPath);
    expect(policy.isOk()).toBe(true);
    if (policy.isErr()) return;

    const graveyardPath = join(root, "graveyard");
    let probedPath: string | undefined;
    const result = await loadGraveyardAgePolicy(graveyardPath, {
      availableBytes: (path) => {
        probedPath = path;
        return policy.value.recoverHeadroomGiB * 2 * GIB;
      },
      policyPath,
    });

    expect(probedPath).toBe(graveyardPath);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        minimumAgeMinutes: policy.value.graveyardMinAgeHours * 60,
        undoWindowMinutes: policy.value.undoWindowMinutes,
      });
    }
  });
});

test("uses the policy age curve below recover headroom", async () => {
  await withTempDirectory(async (root) => {
    const policyPath = await writePolicy(root);
    const policy = await loadCollectionPolicy(policyPath);
    expect(policy.isOk()).toBe(true);
    if (policy.isErr()) return;

    const availableGiB =
      (policy.value.recoverHeadroomGiB + policy.value.denyHeadroomGiB) / 2;
    const result = await loadGraveyardAgePolicy(join(root, "graveyard"), {
      availableBytes: () => Promise.resolve(availableGiB * GIB),
      policyPath,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.minimumAgeMinutes).toBe(
        policy.value.graveyardMinAgeMinutesAt(availableGiB),
      );
      expect(result.value.minimumAgeMinutes).toBeLessThan(
        policy.value.graveyardMinAgeHours * 60,
      );
      expect(result.value.undoWindowMinutes).toBe(
        policy.value.undoWindowMinutes,
      );
    }
  });
});

test("returns an error when the configured age is below the undo window", async () => {
  await withTempDirectory(async (root) => {
    const source = validPolicy.replace(
      "graveyard_min_age_hours = 24",
      "graveyard_min_age_hours = 0.1",
    );
    const policyPath = await writePolicy(root, source);
    const result = await loadGraveyardAgePolicy(join(root, "graveyard"), {
      availableBytes: () => 0,
      policyPath,
    });

    expect(result.isErr()).toBe(true);
  });
});

test("returns an error for missing and invalid policy files without a default", async () => {
  await withTempDirectory(async (root) => {
    const missingPath = join(root, "missing.toml");
    const invalidPath = await writePolicy(
      root,
      validPolicy.replace(
        "graveyard_min_age_hours = 24",
        'graveyard_min_age_hours = "old"',
      ),
    );
    const probe = () => 64 * GIB;

    const missing = await loadGraveyardAgePolicy(join(root, "graveyard"), {
      availableBytes: probe,
      policyPath: missingPath,
    });
    const invalid = await loadGraveyardAgePolicy(join(root, "graveyard"), {
      availableBytes: probe,
      policyPath: invalidPath,
    });

    expect(missing.isErr()).toBe(true);
    expect(invalid.isErr()).toBe(true);
  });
});

test("returns an error when the injected free-space probe throws", async () => {
  await withTempDirectory(async (root) => {
    const policyPath = await writePolicy(root);
    const result = await loadGraveyardAgePolicy(join(root, "graveyard"), {
      availableBytes: () => fail("probe failed"),
      policyPath,
    });

    expect(result.isErr()).toBe(true);
  });
});

test("returns an error for negative or non-finite free-space measurements", async () => {
  await withTempDirectory(async (root) => {
    const policyPath = await writePolicy(root);
    for (const availableBytes of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = await loadGraveyardAgePolicy(join(root, "graveyard"), {
        availableBytes: () => availableBytes,
        policyPath,
      });

      expect(result.isErr()).toBe(true);
    }
  });
});
