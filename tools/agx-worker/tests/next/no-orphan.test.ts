import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, readdir, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { lossEvidence, leaseFor } from "../../src/next/lease.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function scratch() {
  const root = await mkdtemp(join(tmpdir(), "agx-no-orphan-"));
  roots.push(root);
  return root;
}

test("lease distinguishes a live owner from a reused PID or a different boot", async () => {
  const lease = await leaseFor(process.pid, null);
  expect(lease.start).not.toBeNull();
  expect(await lossEvidence(lease)).toBeUndefined();
  expect(
    await lossEvidence({ ...lease, start: "different-boot:0" }),
  ).toMatchObject({ reason: "owner-replaced", pid: process.pid });
});

test("legacy ownerless record folds to ended lost; ls and ls --wait write nothing", async () => {
  const root = await scratch();
  const path = join(root, "records.jsonl");
  const text = `${JSON.stringify({ kind: "started", id: "legacy", at: "2026-10-16T00:00:00Z", ticket: "legacy", writes: [], cwd: root, workspace: root, row: "terra-high", dispatcher_session: null, vendor_session: null, pid: 2147483647, state: "orphaned" })}\n`;
  await Bun.write(path, text);
  // Old persisted fold snapshots must not override event/lease evidence or be rewritten.
  await Bun.write(join(root, "records.fold.json"), '{"state":"orphaned"}');
  for (const args of [[], ["--wait", "legacy"]]) {
    const child = Bun.spawn(
      [
        process.execPath,
        "tools/agx-worker/src/next/cli.ts",
        "ls",
        "--json",
        ...args,
      ],
      {
        env: { ...process.env, AGX_STATE_DIR: root },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 5000,
      },
    );
    const [exit, stdout] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
    ]);
    expect(exit).toBe(0);
    const parsed = jsonOf(
      z.array(z.looseObject({ state: z.string(), outcome: z.string() })),
    ).safeParse(stdout);
    expect(parsed.success && parsed.data).toMatchObject([
      { state: "ended", outcome: "lost", evidence: { reason: "owner-gone" } },
    ]);
    expect(stdout).not.toContain('"orphaned"');
    expect(await Bun.file(path).text()).toBe(text);
    expect(await Bun.file(join(root, "records.fold.json")).text()).toBe(
      '{"state":"orphaned"}',
    );
    expect((await readdir(root)).toSorted()).toEqual([
      "records.fold.json",
      "records.jsonl",
    ]);
  }
});

test("tsc accepts the closed state and rejects constructing orphaned", async () => {
  const root = await scratch();
  const fixture = join(root, "run-state.ts");
  const compiler = [
    "bunx",
    "--bun",
    "--package",
    "typescript@5.9.3",
    "tsc",
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--target",
    "esnext",
    "--module",
    "preserve",
    "--moduleResolution",
    "bundler",
    "--allowImportingTsExtensions",
    "--types",
    "bun",
    "--typeRoots",
    resolve("node_modules/@types"),
    fixture,
  ];
  const compile = async () => {
    const child = Bun.spawn(compiler, {
      env: {
        ...process.env,
        BUN_TMPDIR: root,
        BUN_INSTALL: root,
        BUN_INSTALL_CACHE_DIR: root + "/cache",
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60000,
    });
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exit, output: stdout + stderr };
  };
  const header = `import type { ListedRun } from ${JSON.stringify(resolve("tools/agx-worker/src/next/run-state.ts"))};\ndeclare const base: ListedRun;\n`;
  await Bun.write(
    fixture,
    `${header}const run: ListedRun = { ...base, state: "ended", outcome: "lost" };\n`,
  );
  const good = await compile();
  expect(good.output).not.toContain("error TS");
  expect(good.exit).toBe(0);
  await Bun.write(
    fixture,
    `${header}const run: ListedRun = { ...base, state: "orphaned" };\n`,
  );
  const bad = await compile();
  expect(bad.exit).toBe(2);
  expect(bad.output).toContain("Type '\"orphaned\"' is not assignable");
}, 120000);

test("derived loss includes the recorded systemd unit Result", async () => {
  const root = await scratch();
  const binary = join(root, "systemctl");
  await Bun.write(
    binary,
    '#!/usr/bin/env bun\nprocess.stdout.write("oom-kill\\n");\n',
  );
  await chmod(binary, 0o755);
  const previous = process.env.PATH;
  process.env.PATH = `${root}:${previous ?? ""}`;
  const result = await lossEvidence({
    pid: 2147483647,
    start: "old-boot:1",
    unit: "agt_fixture.service",
  });
  if (previous === undefined) delete process.env.PATH;
  else process.env.PATH = previous;
  expect(result).toMatchObject({
    reason: "owner-gone",
    unit: "agt_fixture.service",
    unit_result: "oom-kill",
  });
});
