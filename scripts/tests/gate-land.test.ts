import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { attempt } from "../../tools/shared/src/attempt.ts";
import { z } from "../../tools/shared/src/zod.ts";

const ROOT = resolve(import.meta.dir, "../..");

test("pre-commit runs exactly the gate:land checks plus staged formatting", async () => {
  const toml = await attempt(async () =>
    Bun.TOML.parse(await readFile(resolve(ROOT, "mise.toml"), "utf8")),
  );
  expect(toml.ok).toBe(true);
  if (!toml.ok) return;

  const parsed = z
    .looseObject({
      tasks: z.record(
        z.string(),
        z.looseObject({
          depends: z.array(z.string()).optional(),
          run: z.unknown().optional(),
        }),
      ),
    })
    .safeParse(toml.value);
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  const mise = parsed.data;
  const land = mise.tasks["gate:land"];
  const lint = mise.tasks["lint"];
  const hook = mise.tasks["hook:pre-commit"];

  expect(land).toBeDefined();
  expect(land?.run).toBeUndefined();
  expect(land?.depends).toEqual([
    "fmt:check",
    "lint",
    "lint:changesets",
    "lint:no-project-names",
  ]);
  expect(lint?.depends).toContain("lint:tool-changesets");
  expect(mise.tasks["lint:tool-changesets"]?.run).toBe(
    "bun scripts/lint-tool-changesets.ts",
  );
  expect(hook?.run).toBeUndefined();
  expect(hook?.depends).toEqual(["fmt:staged", "gate:land"]);
  expect(mise.tasks["check"]?.depends).toEqual(["fmt:check", "lint", "test"]);
});
