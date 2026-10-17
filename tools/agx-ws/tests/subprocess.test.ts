import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStep, StepFailure } from "../src/subprocess.ts";

test("WS-ADD-HANG: finished child returns its status while a descendant retains both pipes", async () => {
  const started = performance.now();
  const result = await runStep(
    ["sh", "-c", "sleep 30 & echo $!; echo diagnostic >&2; exit 7"],
    tmpdir(),
    { timeoutMs: 2_000 },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  process.kill(Number(result.value.out.toString().trim()), "SIGKILL");
  expect(result.value.code).toBe(7);
  expect(result.value.err).toContain("diagnostic");
  expect(performance.now() - started).toBeLessThan(1_000);
});

test("WS-ADD-HANG: a live child deadline names the step and unresolved await", async () => {
  const result = await runStep(["sh", "-c", "exec sleep 30"], tmpdir(), {
    timeoutMs: 50,
  });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toBeInstanceOf(StepFailure);
  expect(String(result.error)).toContain("sh -c exec sleep 30");
  expect(String(result.error)).toContain("waiting for child.exited");
});

test.each(["capture", "inherit", "json"])(
  "WS-ADD-HANG: the calling process exits with retained pipes (%s)",
  async (output) => {
    const root = await mkdtemp(join(tmpdir(), "ws-add-handle-"));
    const driver = join(root, "driver.ts");
    await Bun.write(
      driver,
      `import {runStep} from ${JSON.stringify(join(import.meta.dir, "../src/subprocess.ts"))};
const result = await runStep(["sh", "-c", "sleep 30 & echo $!; exit 9"], ${JSON.stringify(root)}, {timeoutMs: 2000, output: ${JSON.stringify(output)}});
if (!result.ok) throw result.error;
process.stdout.write(result.value.out);
process.exitCode = result.value.code;
`,
    );
    const child = Bun.spawn([process.execPath, driver], {
      stdout: "pipe",
      stderr: "pipe",
      signal: AbortSignal.timeout(3_000),
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    process.kill(Number((out + err).trim()), "SIGKILL");
    expect(code, err).toBe(9);
    await rm(root, { recursive: true, force: true });
  },
);

test("WS-ADD-HANG: concurrently drains complete output larger than pipe capacity", async () => {
  const result = await runStep(
    [
      process.execPath,
      "-e",
      `process.stdout.write("a".repeat(262144)); process.stderr.write("b".repeat(262144));`,
    ],
    tmpdir(),
    { timeoutMs: 5000 },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.code).toBe(0);
  expect(result.value.out.length).toBe(262144);
  expect(result.value.err.length).toBe(262144);
});
