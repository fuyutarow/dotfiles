// scripts/reclaim-purge.ts against FIXTURE graveyards only (GRAVEYARD, XDG_DATA_HOME and HOME point
// into a temp dir — the real ones are never touched). The case that matters: after the answer the
// process EXITS. Until 2026-10-06 it read the answer with process.stdin.once("data"), which kept
// stdin open, so a finished purge printed "✅ purge 完了" and then hung.
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "reclaim-purge.ts");

function fixture(): { root: string; env: Record<string, string> } {
  const root = mkdtempSync(join(tmpdir(), "purge-"));
  mkdirSync(join(root, "g"));
  mkdirSync(join(root, "xdg", "Trash", "files"), { recursive: true });
  mkdirSync(join(root, "xdg", "Trash", "info"), { recursive: true });
  mkdirSync(join(root, "home"));
  writeFileSync(join(root, "g", "a"), "junk\n");
  return {
    root,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: join(root, "home"),
      GRAVEYARD: join(root, "g"),
      XDG_DATA_HOME: join(root, "xdg"),
      USER: "purge-test",
    },
  };
}

function purge(
  answer: string,
  env: Record<string, string>,
): { code: number; out: string } {
  const r = Bun.spawnSync(["bun", SCRIPT], {
    stdin: new Blob([answer]),
    env,
    timeout: 20_000, // a hang is the bug under test: it must not pass by waiting forever
  });
  return { code: r.exitCode ?? -1, out: r.stdout.toString() };
}

test("yes: the fixture graveyard is emptied and the process exits 0 (does not hang)", () => {
  const { root, env } = fixture();
  const r = purge("yes\n", env);
  expect(r.code).toBe(0);
  expect(r.out).toContain("✅ purge 完了");
  expect(existsSync(join(root, "g", "a"))).toBe(false);
  expect(existsSync(join(root, "g"))).toBe(true); // the directory itself survives
});

test("anything but yes, and EOF, abort with exit 1 and remove nothing", () => {
  for (const answer of ["no\n", "\n", ""]) {
    const { root, env } = fixture();
    const r = purge(answer, env);
    expect([answer, r.code]).toEqual([answer, 1]);
    expect(r.out).toContain("中止しました");
    expect(existsSync(join(root, "g", "a"))).toBe(true);
  }
});
