import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { z } from "../../shared/src/zod.ts";
import { headroom } from "../src/headroom.ts";

const drive = {
  label: "test",
  path: "/",
  deny_gib: 1,
  deny_pct: 10,
  warn_gib: 2,
  warn_pct: 20,
};
const script = resolve(import.meta.dir, "../src/storage-headroom.ts");

test("injected measurements produce the agreed exit codes and headroom JSON shape", () => {
  for (const [free, exit] of [
    [0, 11],
    [2 ** 30, 10],
    [2 * 2 ** 30, 0],
  ] as const) {
    const result = headroom({
      drives: [drive],
      measure: () => ({ free, total: 10 * 2 ** 30 }),
    });
    expect(result.exit).toBe(exit);
    expect(
      z
        .object({
          drives: z.array(
            z.object({
              label: z.string(),
              path: z.string(),
              free: z.number(),
              total: z.number().nullable(),
              deny_line: z.number(),
              warn_line: z.number().nullable(),
              stop_line: z.number().nullable(),
              state: z.enum(["ok", "warn", "deny"]),
            }),
          ),
        })
        .safeParse(result.headroom).success,
    ).toBe(true);
  }
  expect(
    headroom({ drives: [drive], path: "/tmp", measure: () => null }).exit,
  ).toBe(2);
});

test("CLI usage errors exit 2", () => {
  const result = Bun.spawnSync([process.execPath, script, "--unknown"], {
    timeout: 5000,
  });
  expect(result.exitCode).toBe(2);
});
