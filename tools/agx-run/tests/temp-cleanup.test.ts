import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTempTracker } from "./temp.ts";

const temps = createTempTracker();
const root = temps.register(
  mkdtempSync(join(tmpdir(), "agx-test-cleanup-proof-")),
);
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  temps.assertRemoved();
});

function probe(name: string, cleanup: boolean) {
  const leaked = join(root, `${name}-fixture`);
  const file = join(root, `${name}.test.ts`);
  writeFileSync(
    file,
    `
    import { afterAll, afterEach, expect, test } from "bun:test";
    import { mkdirSync, rmSync } from "node:fs";
    import { createTempTracker } from ${JSON.stringify(join(import.meta.dir, "temp.ts"))};
    const temps = createTempTracker();
    const path = ${JSON.stringify(leaked)};
    afterAll(temps.assertRemoved);
    ${cleanup ? "afterEach(() => { rmSync(path, { recursive: true, force: true }); });" : ""}
    test("fixture body", () => {
      mkdirSync(path);
      temps.register(path);
      ${cleanup ? "expect(false).toBe(true);" : ""}
    });
  `,
  );
  const child = Bun.spawnSync([process.execPath, "test", file], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 4000,
  });
  return { code: child.exitCode, error: child.stderr.toString(), leaked };
}

test("suite assertion rejects a tracked directory left by a passing test", () => {
  const result = probe("residue", false);
  expect(result.code).toBe(1);
  expect(result.error).toContain("temp.ts");
  expect(existsSync(result.leaked)).toBe(true);
});

test("afterEach removes a tracked directory when the test body fails", () => {
  const result = probe("failure", true);
  expect(result.code).toBe(1);
  expect(existsSync(result.leaked)).toBe(false);
  expect(result.error).not.toContain("temp.ts:");
});
