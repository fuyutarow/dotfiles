// bun test for scripts/doctor.ts — spawned end-to-end against throwaway HOME / DOTFILES trees
// (DOCTOR_ONLY narrows to the checks a fixture can drive); the real $HOME is never touched.
// Each FAIL case is paired with its PASS twin so a check that always passes, or always fails,
// is caught (writing-bun-scripts BG4: prove the check fires).
import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..");
const SCRIPT = join(REPO, "scripts", "doctor.ts");

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function doctor(
  only: string,
  env: { HOME: string; DOTFILES: string },
): { code: number; out: string } {
  const proc = Bun.spawnSync(["bun", SCRIPT], {
    env: { ...process.env, ...env, DOCTOR_ONLY: only },
  });
  return {
    code: proc.exitCode ?? -1,
    out: proc.stdout.toString() + proc.stderr.toString(),
  };
}

/** A dotfiles fixture with a package.json declaring one bin and one pinned dependency. */
function fixtureDotfiles(): string {
  const dir = tmp("doctor-dotfiles-");
  mkdirSync(join(dir, "tools"));
  writeFileSync(join(dir, "tools", "hello.ts"), "#!/usr/bin/env bun\n");
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      bin: { hello: "tools/hello.ts" },
      dependencies: { leftpad: "1.2.3" },
    }),
  );
  return dir;
}

describe("doctor", () => {
  test("links: an empty HOME is all drift, reported without writing anything", () => {
    const home = tmp("doctor-home-");
    const r = doctor("links", { HOME: home, DOTFILES: REPO });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(
      /^FAIL {2}links {2}\d+ declared link\(s\) not realized/m,
    );
    expect(r.out).toContain(".zshrc (want -> ");
    expect(r.out).toContain("fix: mise run link:dots");
    expect(readdirSync(home)).toEqual([]);
  });

  test("links: a dangling link into the repo is reported, not pruned", () => {
    const home = tmp("doctor-home-");
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    symlinkSync(
      join(REPO, "no-such-file.ts"),
      join(home, ".local", "bin", "gone"),
    );
    const r = doctor("links", { HOME: home, DOTFILES: REPO });
    expect(r.out).toContain("gone (dangling link into the repo)");
    expect(readdirSync(join(home, ".local", "bin"))).toEqual(["gone"]);
  });

  test("bins: missing and dangling-renamed bins FAIL; a resolving bin PASSes", () => {
    const dotfiles = fixtureDotfiles();
    const home = tmp("doctor-home-");
    const binDir = join(home, ".bun", "bin");
    mkdirSync(binDir, { recursive: true });

    const missing = doctor("bins", { HOME: home, DOTFILES: dotfiles });
    expect(missing.code).toBe(1);
    expect(missing.out).toContain("hello is missing or dangling");

    symlinkSync(join(dotfiles, "tools", "hello.ts"), join(binDir, "hello"));
    expect(doctor("bins", { HOME: home, DOTFILES: dotfiles }).out).toMatch(
      /^PASS {2}bins/m,
    );

    // The shape bun leaves after a bin rename: a link through its global node_modules/dotfiles.
    symlinkSync(
      "../install/global/node_modules/dotfiles/tools/old.ts",
      join(binDir, "old"),
    );
    const stale = doctor("bins", { HOME: home, DOTFILES: dotfiles });
    expect(stale.code).toBe(1);
    expect(stale.out).toContain(
      "old is a dangling link left by a renamed/removed bin",
    );
  });

  test("deps: a missing or off-pin dependency FAILs; the pinned version PASSes", () => {
    const dotfiles = fixtureDotfiles();
    const home = tmp("doctor-home-");
    expect(doctor("deps", { HOME: home, DOTFILES: dotfiles }).out).toContain(
      "leftpad: not installed (pinned 1.2.3)",
    );
    const pkgDir = join(dotfiles, "node_modules", "leftpad");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify({ version: "1.2.4" }),
    );
    expect(doctor("deps", { HOME: home, DOTFILES: dotfiles }).out).toContain(
      "leftpad: 1.2.4 ≠ pinned 1.2.3",
    );
    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify({ version: "1.2.3" }),
    );
    const ok = doctor("deps", { HOME: home, DOTFILES: dotfiles });
    expect(ok.code).toBe(0);
    expect(ok.out).toMatch(/^PASS {2}deps/m);
  });

  test("git-hooks: unset core.hooksPath FAILs with the exact repair; .githooks PASSes", () => {
    const repo = tmp("doctor-git-");
    Bun.spawnSync(["git", "init", "-q", repo]);
    const home = tmp("doctor-home-");
    const unset = doctor("git-hooks", { HOME: home, DOTFILES: repo });
    expect(unset.code).toBe(1);
    expect(unset.out).toContain(
      `fix: git -C ${repo} config core.hooksPath .githooks`,
    );
    Bun.spawnSync(["git", "-C", repo, "config", "core.hooksPath", ".githooks"]);
    expect(doctor("git-hooks", { HOME: home, DOTFILES: repo }).code).toBe(0);
  });

  test("two independent FAILs come back in one run, with a summary line", () => {
    const dotfiles = fixtureDotfiles();
    const home = tmp("doctor-home-");
    const r = doctor("deps,bins", { HOME: home, DOTFILES: dotfiles });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^FAIL {2}deps/m);
    expect(r.out).toMatch(/^FAIL {2}bins/m);
    expect(r.out).toContain("RESULT: FAIL · FAIL 2 · WARN 0 · PASS 0 · SKIP 0");
  });

  test("an unknown DOCTOR_ONLY name is FATAL (exit 2), never a silent empty PASS", () => {
    const r = doctor("links,nope", {
      HOME: tmp("doctor-home-"),
      DOTFILES: REPO,
    });
    expect(r.code).toBe(2);
    expect(r.out).toContain("FATAL: DOCTOR_ONLY names unknown check(s): nope");
  });
});
