import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admit } from "../../src/core/admit.ts";
import { read } from "../../src/core/log.ts";
import type { CoreEvent } from "../../src/core/events.ts";

const dead = (): "dead" => "dead";
const alive = (): "alive" => "alive";
const policy = {
  on_conflict: "refuse",
  scope: "repository",
  ignored: (_path: string) => false,
} satisfies Parameters<typeof admit>[3];
const tempRoot = mkdtempSync(join(tmpdir(), "agx-core-admit-"));
afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

test("admission refuses overlapping live leases and ignores excluded paths", () => {
  const events: CoreEvent[] = [
    {
      seq: 1,
      run_id: "holder",
      type: "admitted",
      writes: ["src/**"],
      cwd: "/repo",
      workspace_root: "/repo",
      ticket: "one",
      lineage: "one",
    },
    { seq: 2, run_id: "holder", type: "running", pid: 42 },
  ];
  expect(
    admit(
      {
        writes: ["src/file.ts"],
        cwd: "/repo",
        workspace_root: "/repo",
        ticket: "two",
        lineage: "two",
      },
      events,
      alive,
      policy,
    ).ok,
  ).toBe(false);
  expect(
    admit(
      {
        writes: ["vendor/file.ts"],
        cwd: "/repo",
        workspace_root: "/repo",
        ticket: "two",
        lineage: "two",
      },
      events,
      alive,
      { ...policy, ignored: (path) => path.startsWith("vendor/") },
    ).ok,
  ).toBe(true);
});

test("admission over a 100,000-event log uses its snapshot offset under 10 ms", () => {
  const dir = join(tempRoot, "state");
  mkdirSync(dir);
  const lines = Array.from({ length: 100_000 }, (_, index) =>
    JSON.stringify({
      seq: index + 1,
      run_id: `old-${index}`,
      type: "judged",
      decision: "reject",
    }),
  );
  writeFileSync(join(dir, "core.jsonl"), `${lines.join("\n")}\n`);
  const offset = Buffer.byteLength(`${lines.slice(0, -1).join("\n")}\n`);
  const suffix = read(dir, offset);
  const started = performance.now();
  const result = admit(
    {
      writes: ["src/**"],
      cwd: "/repo",
      workspace_root: "/repo",
      ticket: "new",
      lineage: "new",
    },
    suffix.events,
    dead,
    policy,
  );
  expect(result.ok).toBe(true);
  expect(performance.now() - started).toBeLessThan(10);
  expect(suffix.events).toHaveLength(1);
});
