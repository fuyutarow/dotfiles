import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inScopeChanges } from "../ccc-scope.ts";

// Uses the INSTALLED ccc on purpose: the whole point of ccc-scope is that ccc's own matcher
// answers. Skipped where ccc is absent.
const ccc = Bun.which("ccc");
const dirs: string[] = [];
const originalRustLog = process.env.RUST_LOG;
const bunSpawn = Bun.spawn;

function spawnWithQuietTelemetry<
  const In extends Bun.Spawn.Writable = "ignore",
  const Out extends Bun.Spawn.Readable = "pipe",
  const Err extends Bun.Spawn.Readable = "inherit",
>(
  options: Bun.Spawn.SpawnOptions<In, Out, Err> & { cmd: string[] },
): Bun.Subprocess<In, Out, Err>;
function spawnWithQuietTelemetry<
  const In extends Bun.Spawn.Writable = "ignore",
  const Out extends Bun.Spawn.Readable = "pipe",
  const Err extends Bun.Spawn.Readable = "inherit",
>(
  cmds: string[],
  options?: Bun.Spawn.SpawnOptions<In, Out, Err>,
): Bun.Subprocess<In, Out, Err>;
function spawnWithQuietTelemetry<
  const In extends Bun.Spawn.Writable = "ignore",
  const Out extends Bun.Spawn.Readable = "pipe",
  const Err extends Bun.Spawn.Readable = "inherit",
>(
  input: string[] | (Bun.Spawn.SpawnOptions<In, Out, Err> & { cmd: string[] }),
  options?: Bun.Spawn.SpawnOptions<In, Out, Err>,
): Bun.Subprocess<In, Out, Err> {
  if (Array.isArray(input)) {
    if (options === undefined) return bunSpawn(input);
    return bunSpawn(input, {
      ...options,
      env: { ...(options.env ?? process.env), RUST_LOG: "error" },
    });
  }
  return bunSpawn({
    ...input,
    env: { ...(input.env ?? process.env), RUST_LOG: "error" },
  });
}

beforeAll(() => {
  // cocoindex_core's telemetry init diagnostic goes to stdout at INFO, ahead of the JSON result.
  // Keep the installed matcher's protocol output machine-readable during this test.
  Bun.spawn = spawnWithQuietTelemetry;
});
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  Bun.spawn = bunSpawn;
  if (originalRustLog === undefined) delete process.env.RUST_LOG;
  else process.env.RUST_LOG = originalRustLog;
});

function git(dir: string, ...args: string[]): string {
  const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  expect(r.status).toBe(0);
  return r.stdout.trim();
}

function commit(dir: string, files: Record<string, string>): string {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  git(dir, "add", "--", ...Object.keys(files));
  git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "c");
  return git(dir, "rev-parse", "HEAD");
}

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "ccc-scope-"));
  dirs.push(dir);
  git(dir, "init", "-q");
  mkdirSync(join(dir, ".cocoindex_code"));
  writeFileSync(
    join(dir, ".cocoindex_code", "settings.yml"),
    "include_patterns:\n- '**/*.md'\nexclude_patterns:\n- 'archive/**'\n- '**/runs'\n",
  );
  return dir;
}

describe.skipIf(ccc === null)(
  "inScopeChanges (installed ccc's matcher)",
  () => {
    test("commits touching only excluded or non-included paths are out of scope", async () => {
      const dir = project();
      const a = commit(dir, { "README.md": "a" });
      const b = commit(dir, {
        "archive/old.md": "x",
        "rec/runs/r1.md": "x",
        "data.json": "{}",
      });
      expect(await inScopeChanges(dir, ccc!, a, b)).toEqual({
        changed: 3,
        inScope: [],
      });
    });

    test("an indexed path makes the drift in scope", async () => {
      const dir = project();
      const a = commit(dir, { "README.md": "a" });
      const b = commit(dir, { "notes.md": "n", "archive/x.md": "x" });
      expect(await inScopeChanges(dir, ccc!, a, b)).toEqual({
        changed: 2,
        inScope: ["notes.md"],
      });
    });

    test("a changed .gitignore or settings.yml changes the scope itself, so it counts", async () => {
      const dir = project();
      const a = commit(dir, { "README.md": "a" });
      const b = commit(dir, { ".gitignore": "x\n" });
      expect((await inScopeChanges(dir, ccc!, a, b))?.inScope).toEqual([
        ".gitignore",
      ]);
    });

    test("an unknown commit cannot be decided: null (the caller keeps NO_INDEX)", async () => {
      const dir = project();
      const a = commit(dir, { "README.md": "a" });
      expect(await inScopeChanges(dir, ccc!, a, "0".repeat(40))).toBeNull();
    });
  },
);

test("a ccc that is not ccc's Python script cannot answer: null", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ccc-scope-fake-"));
  dirs.push(dir);
  git(dir, "init", "-q");
  const a = commit(dir, { "a.md": "a" });
  const b = commit(dir, { "b.md": "b" });
  const fake = join(dir, "fake-ccc");
  writeFileSync(fake, "#!/bin/sh\nexit 0\n");
  chmodSync(fake, 0o755);
  expect(await inScopeChanges(dir, fake, a, b)).toBeNull();
});
