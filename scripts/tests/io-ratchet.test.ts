import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkOverrides, staleExemptions } from "../lint-ts-ratchet.ts";
import {
  generatedOverrides,
  loadPolicy,
  loadRepoPolicy,
} from "../render-oxlintrc.ts";
import { addedRuleExemptions } from "../bun-api-allowlist.ts";

const loaded = await loadPolicy();
if (!loaded.ok) expect.unreachable(loaded.error);
const policy = loaded.value;

test("the ratchet rejects growth in rules on an existing path as well as new paths", () => {
  const baseline = { "a.ts": { rules: ["no-sync"], reason: "fixture" } };
  expect(addedRuleExemptions({}, baseline)).toEqual([]);
  expect(
    addedRuleExemptions(
      { "a.ts": { rules: ["no-sync", "prefer-bun-api"], reason: "fixture" } },
      baseline,
    ),
  ).toEqual(["a.ts (prefer-bun-api)"]);
  expect(
    addedRuleExemptions(
      { "b.ts": { rules: ["no-sync"], reason: "fixture" } },
      baseline,
    ),
  ).toEqual(["b.ts (no-sync)"]);
});

test("only exactly generated overrides are accepted", () => {
  const overrides = generatedOverrides(policy);
  expect(checkOverrides(overrides, overrides)).toEqual([]);
  expect(
    checkOverrides(
      [...overrides, { files: ["new.ts"], rules: { "node/no-sync": "off" } }],
      overrides,
    ),
  ).toHaveLength(1);
  expect(checkOverrides([], overrides)).toHaveLength(1);
});

test("staleness is checked per rule, even when the other rule still fires", () => {
  const allowlist = {
    "src/io.ts": { rules: ["no-sync", "prefer-bun-api"], reason: "fixture" },
  } satisfies Parameters<typeof staleExemptions>[0];
  expect(
    staleExemptions(allowlist, [
      { filename: "src/io.ts", code: "node(no-sync)" },
    ]),
  ).toEqual([
    "lint:ts-ratchet: stale exemption src/io.ts (prefer-bun-api); remove this rule from the allowlist",
  ]);
  expect(
    staleExemptions(allowlist, [
      { filename: "src/io.ts", code: "node(no-sync)" },
      { filename: "src/io.ts", code: "dotfiles(prefer-bun-api)" },
    ]),
  ).toEqual([]);
  expect(staleExemptions(allowlist, [])).toHaveLength(2);
});

test("test-pattern override disables only the two I/O rules", () => {
  expect(generatedOverrides(policy)[0]).toEqual({
    files: ["**/tests/**", "**/*.test.ts"],
    rules: { "node/no-sync": "off", "dotfiles/prefer-bun-api": "off" },
  });
});

test("consumer policies never inherit production exemptions", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "io-consumer-"));
  await Bun.write(
    join(scratch, "oxlint-policy.local.toml"),
    "schema = 1\nignore = []\n",
  );
  const consumer = await loadRepoPolicy(scratch, policy);
  await rm(scratch, { recursive: true, force: true });
  if (!consumer.ok) expect.unreachable(consumer.error);
  expect(generatedOverrides(consumer.value)).toHaveLength(1);
});
