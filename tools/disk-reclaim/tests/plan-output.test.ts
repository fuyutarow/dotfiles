import { expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { jsonOf } from "@dotfiles/shared/src/zod.ts";
import { Plan } from "../src/model.ts";
import { cliEnv } from "./fixtures/cli-env.ts";
import { tempRoot } from "./fixtures/temp.ts";

// Include fixture setup and cleanup around the child's existing 10-second deadline.
test("native plan CLI drains a large JSON document before exiting", async () => {
  const root = tempRoot("reclaim-large-plan-");
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const env = cliEnv(root);
  for (let n = 0; n < 5000; n++)
    mkdirSync(join(env.HOME, ".cache", `item-${n}-${"fixture".repeat(20)}`), {
      recursive: true,
    });
  const child = Bun.spawn(
    [
      process.execPath,
      resolve(import.meta.dir, "../src/reclaim.ts"),
      "plan",
      "audit",
      "--json",
    ],
    {
      env: { ...env, RECLAIM_TEST_PROC_ROOT: env.RECLAIM_UNIT_PROC_ROOT },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    },
  );
  const [output, error, exit] = await Promise.all([
    (async () => {
      await Bun.sleep(500);
      return new Response(child.stdout).text();
    })(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exit, error).toBe(0);
  expect(output.length).toBeGreaterThan(65536);
  const parsed = jsonOf(Plan).safeParse(output);
  expect(parsed.success).toBe(true);
  if (parsed.success)
    expect(
      parsed.data.targets[0]?.candidates.filter((candidate) =>
        candidate.id.startsWith("cache:item-"),
      ),
    ).toHaveLength(5000);
}, 30_000);
