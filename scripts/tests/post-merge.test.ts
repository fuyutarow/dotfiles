import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSteps, STEPS } from "../post-merge.ts";

test("a recursive PATH Bun fixture is bypassed by every script step", async () => {
  const root = mkdtempSync(join(tmpdir(), "post-merge-"));
  const previous = process.env.PATH;
  writeFileSync(join(root, "bun"), '#!/bin/sh\nexec bun "$@"\n');
  chmodSync(join(root, "bun"), 0o755);
  writeFileSync(
    join(root, "probe.ts"),
    `
    const p = Bun.spawn(["bun", "--version"], { timeout: 1000 });
    process.exitCode = await p.exited;
  `,
  );
  process.env.PATH = `${root}:${previous ?? ""}`;
  const lines: string[] = [];
  const code = await runSteps(
    [{ name: "codex:config", args: ["probe.ts"], boundMs: 2000 }],
    root,
    (line) => {
      lines.push(line);
    },
  ).finally(() => {
    process.env.PATH = previous;
    rmSync(root, { recursive: true, force: true });
  });
  expect(code).toBe(0);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(/^\[post-merge\] codex:config \d+\.\d{3}s$/u);
});

test("a hung step is killed, named, timed and prevents subsequent work", async () => {
  const lines: string[] = [];
  const started = performance.now();
  const code = await runSteps(
    [
      { name: "hung", args: ["-e", "await Bun.sleep(60000)"], boundMs: 100 },
      { name: "never", args: ["-e", "process.exit(0)"], boundMs: 1000 },
    ],
    tmpdir(),
    (line) => {
      lines.push(line);
    },
  );
  expect(code).toBe(124);
  expect(performance.now() - started).toBeLessThan(2000);
  expect(lines[0]).toMatch(/^\[post-merge\] hung .*s$/u);
  expect(lines[1]).toBe("[post-merge] hung timed out (bound 0.1s)");
  expect(lines.join("\n")).not.toContain("never");
});

test("a failed step stays failed and prevents subsequent work", async () => {
  const lines: string[] = [];
  expect(
    await runSteps(
      [
        { name: "bad", args: ["-e", "process.exit(7)"], boundMs: 1000 },
        { name: "never", args: ["-e", "process.exit(0)"], boundMs: 1000 },
      ],
      tmpdir(),
      (line) => {
        lines.push(line);
      },
    ),
  ).toBe(7);
  expect(lines[1]).toBe("[post-merge] bad failed (exit 7)");
  expect(lines.join("\n")).not.toContain("never");
  expect(STEPS.reduce((sum, step) => sum + step.boundMs, 0)).toBeLessThan(
    60_000,
  );
});
