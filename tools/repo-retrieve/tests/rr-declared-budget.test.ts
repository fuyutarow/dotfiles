import { afterAll, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// P1: a root exceeds a shared index ceiling only by stating why in `[index] over_ceiling_reason`
// of its rr.toml; the same values without a reason (or with an empty one) are refused; and the
// shard mechanism is gone, so soks is one ordinary root planned through this workspace's entry.

const router = join(import.meta.dir, "../src/repo-retrieve.ts");
const soks = "/home/fuyu/Workspace/soks";
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function fixture(rrToml: string) {
  const root = mkdtempSync(join(tmpdir(), "rr-declared-budget-"));
  roots.push(root);
  mkdirSync(join(root, ".cocoindex_code"));
  writeFileSync(
    join(root, "source.ts"),
    "const value = calculateResult(input);\n".repeat(400),
  );
  writeFileSync(
    join(root, ".cocoindex_code", "settings.yml"),
    "include_patterns:\n- '**/*.ts'\nexclude_patterns:\n- '**/.*'\n",
  );
  writeFileSync(join(root, ".cocoindex_code", "rr.toml"), rrToml);
  return root;
}

async function plan(root: string, timeout = 60_000) {
  const child = Bun.spawn({
    cmd: [process.execPath, router, "index", "--plan"],
    cwd: root,
    env: { ...process.env, REPO_RETRIEVE_AUTO_INDEX: "0" },
    stdout: "pipe",
    stderr: "pipe",
    timeout,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

const raised = [
  ["max_est_chunks", "63000"],
  ["max_data_share", "0.3"],
  ["max_seconds", "1500"],
  ["max_total_bytes", "56000000"],
  ["est_chunks_per_second", "60"],
] as const;

test("a raised ceiling with a stated reason is admitted; without one it is refused", async () => {
  for (const [key, value] of raised) {
    const refused = await plan(fixture(`[index]\n${key} = ${value}\n`));
    expect(refused.code).not.toBe(0);
    expect(refused.stderr).toContain(`${key} root value`);
    expect(refused.stderr).toContain("over_ceiling_reason");

    const admitted = await plan(
      fixture(
        `[index]\n${key} = ${value}\nover_ceiling_reason = "this root's notes need it"\n`,
      ),
    );
    expect(admitted.stderr).toContain("PLAN: within budget");
    expect(admitted.stderr).toContain("this root's notes need it");
    expect(admitted.code).toBe(0);
  }
}, 120_000);

test("an empty or blank reason does not count as a reason", async () => {
  for (const reason of ["", "   "]) {
    const result = await plan(
      fixture(
        `[index]\nmax_est_chunks = 63000\nover_ceiling_reason = ${JSON.stringify(reason)}\n`,
      ),
    );
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("over_ceiling_reason");
  }
}, 60_000);

test("a reason alone raises nothing, and lowering needs no reason", async () => {
  const idle = await plan(fixture('[index]\nover_ceiling_reason = "unused"\n'));
  expect(idle.code).toBe(0);
  expect(idle.stderr).toContain('max_est_chunks":50000');
  const lowered = await plan(fixture("[index]\nmax_est_chunks = 100\n"));
  expect(lowered.code).toBe(0);
}, 60_000);

test("the shard mechanism is gone: a [shards] table is an invalid rr.toml and no source remains", async () => {
  const result = await plan(
    fixture(
      '[shards]\nmanifest = "/tmp/MANIFEST.json"\nsha256 = "' +
        "0".repeat(64) +
        '"\n',
    ),
  );
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain("invalid rr.toml");
  expect(existsSync(join(import.meta.dir, "../src/shards.ts"))).toBe(false);
  expect(existsSync(join(import.meta.dir, "shards.test.ts"))).toBe(false);
});

test("soks is one ordinary root: its declared budget plans through this workspace's entry", async () => {
  if (!existsSync(join(soks, ".cocoindex_code", "rr.toml"))) return;
  const result = await plan(soks, 240_000);
  expect(result.stderr).toContain("PLAN: within budget");
  expect(result.stderr).toContain("over_ceiling_reason");
  expect(result.code).toBe(0);
}, 300_000);
