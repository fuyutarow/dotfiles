import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../../../tools/shared/src/zod.ts";
import { createTempTracker } from "../temp.ts";

const tempDirs = createTempTracker();
const registerTempDir = tempDirs.register;

const CLI = join(import.meta.dir, "..", "..", "src", "next", "cli.ts");
const scratch = registerTempDir(
  mkdtempSync(join(tmpdir(), `agx-test-${process.pid}-stdout-drain-`)),
);
const state = join(scratch, "state");
const expectedRuns = 3_000;
mkdirSync(state);
const records = Array.from({ length: expectedRuns }, (_, index) =>
  JSON.stringify({
    kind: "started",
    id: `run-${index}`,
    at: "2026-10-14T00:00:00Z",
    ticket: `ticket-${index}`,
    writes: [],
    cwd: "/tmp",
    workspace: "/tmp",
    row: "codex",
    dispatcher_session: null,
    vendor_session: null,
    pid: 2_147_483_647,
  }),
).join("\n");
writeFileSync(join(state, "records.jsonl"), `${records}\n`);

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
  tempDirs.assertRemoved();
});

test("ls JSON drains completely when the pipe reader starts slowly", async () => {
  const child = Bun.spawn([process.execPath, CLI, "ls", "--json"], {
    env: { ...process.env, AGX_STATE_DIR: state },
    stdout: "pipe",
    stderr: "pipe",
  });
  await Bun.sleep(200);
  const output = await new Response(child.stdout).text();
  const code = await child.exited;

  expect(code).toBe(0);
  const decoded = jsonOf(z.array(z.looseObject({}))).safeParse(output);
  expect(decoded.success).toBe(true);
  if (decoded.success) expect(decoded.data).toHaveLength(expectedRuns);
});

test("unknown command still exits non-zero", () => {
  const child = Bun.spawnSync([process.execPath, CLI, "unknown-command"], {
    env: { ...process.env, AGX_STATE_DIR: state },
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(child.exitCode).not.toBe(0);
});
