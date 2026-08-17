// bun test for scripts/render-claude-settings.ts — the generator that replaced the
// ~/.claude/settings.json symlink so `autoMode` (user-scope-only, machine-specific) can stay
// effective without publishing a private project's structure through this public repo.
// Every fixture is a throwaway tmp tree passed via env; the real $HOME is never touched.
// The cases that matter are the failure modes: this file carries every security hook, so a
// truncated render or a silently-dropped private rule is the damage to prevent.
import { describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "render-claude-settings.ts");

function run(env: Record<string, string>): { out: string; code: number } {
  const proc = Bun.spawnSync(["bun", SCRIPT], {
    env: { ...process.env, ...env },
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    out: proc.stdout.toString() + proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

/** A dotfiles fixture holding just the committed base settings. */
function makeDotfiles(base: object): string {
  const dir = mkdtempSync(join(tmpdir(), "render-settings-dotfiles-"));
  mkdirSync(join(dir, "agents", "claude"), { recursive: true });
  writeFileSync(
    join(dir, "agents", "claude", "settings.json"),
    `${JSON.stringify(base, null, 2)}\n`,
  );
  return dir;
}

function makeHome(): string {
  return mkdtempSync(join(tmpdir(), "render-settings-home-"));
}

function dest(home: string): string {
  return join(home, ".claude", "settings.json");
}

function readDest(home: string): Record<string, unknown> {
  return JSON.parse(readFileSync(dest(home), "utf8"));
}

function cleanup(...dirs: string[]): void {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

describe("render-claude-settings: base only", () => {
  test("renders the committed base verbatim when no overlay exists", () => {
    const dotfiles = makeDotfiles({ model: "opus", hooks: { PreToolUse: [] } });
    const home = makeHome();
    const { out, code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(0);
    expect(out).toContain("(no private overlay)");
    expect(readDest(home)).toEqual({
      model: "opus",
      hooks: { PreToolUse: [] },
    });
    // A real file, never a symlink — the whole point of the change.
    expect(lstatSync(dest(home)).isSymbolicLink()).toBe(false);
    cleanup(dotfiles, home);
  });

  test("second run reports current and rewrites nothing", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    const home = makeHome();
    run({ HOME: home, DOTFILES: dotfiles });
    const firstMtime = lstatSync(dest(home)).mtimeMs;
    const { out, code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(0);
    expect(out).toContain("settings current");
    expect(lstatSync(dest(home)).mtimeMs).toBe(firstMtime);
    cleanup(dotfiles, home);
  });
});

describe("render-claude-settings: private overlay", () => {
  test("an overlay key is merged in and reported by name", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    const home = makeHome();
    const overlay = join(home, "private.json");
    writeFileSync(
      overlay,
      JSON.stringify({ autoMode: { allow: ["$defaults"] } }),
    );

    const { out, code } = run({
      HOME: home,
      DOTFILES: dotfiles,
      CLAUDE_SETTINGS_PRIVATE: overlay,
    });
    expect(code).toBe(0);
    expect(out).toContain("[autoMode]");
    expect(readDest(home)).toEqual({
      model: "opus",
      autoMode: { allow: ["$defaults"] },
    });
    cleanup(dotfiles, home);
  });

  test("an overlay key REPLACES the base key outright — no deep merge", () => {
    // Deep-merging `hooks` has no defensible semantics, so the contract is replacement. Pinned
    // here because a future "helpful" deep merge would silently reorder security hooks.
    const dotfiles = makeDotfiles({
      permissions: { defaultMode: "auto", allow: ["a", "b"] },
    });
    const home = makeHome();
    const overlay = join(home, "private.json");
    writeFileSync(overlay, JSON.stringify({ permissions: { allow: ["z"] } }));

    const { code } = run({
      HOME: home,
      DOTFILES: dotfiles,
      CLAUDE_SETTINGS_PRIVATE: overlay,
    });
    expect(code).toBe(0);
    expect(readDest(home)).toEqual({ permissions: { allow: ["z"] } });
    cleanup(dotfiles, home);
  });
});

describe("render-claude-settings: the legacy symlink", () => {
  test("replaces a symlink into the repo with a real file, and says so", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    const home = makeHome();
    mkdirSync(join(home, ".claude"), { recursive: true });
    symlinkSync(
      join(dotfiles, "agents", "claude", "settings.json"),
      dest(home),
    );

    const { out, code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(0);
    expect(out).toContain("replaced the old symlink into the repo");
    expect(lstatSync(dest(home)).isSymbolicLink()).toBe(false);
    // The repo-side base must be untouched — writing THROUGH the old link would have edited it.
    expect(
      JSON.parse(
        readFileSync(
          join(dotfiles, "agents", "claude", "settings.json"),
          "utf8",
        ),
      ),
    ).toEqual({ model: "opus" });
    cleanup(dotfiles, home);
  });
});

describe("render-claude-settings: failure modes", () => {
  test("a malformed overlay aborts and leaves the existing settings untouched", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    const home = makeHome();
    run({ HOME: home, DOTFILES: dotfiles }); // establish a good render first
    const before = readFileSync(dest(home), "utf8");

    const overlay = join(home, "private.json");
    writeFileSync(overlay, "{ not json");
    const { out, code } = run({
      HOME: home,
      DOTFILES: dotfiles,
      CLAUDE_SETTINGS_PRIVATE: overlay,
    });
    expect(code).toBe(1);
    expect(out).toContain("not readable JSON");
    expect(out).toContain("silently drop the private rules");
    expect(readFileSync(dest(home), "utf8")).toBe(before);
    cleanup(dotfiles, home);
  });

  test("a missing base aborts rather than writing an empty settings file", () => {
    const dotfiles = mkdtempSync(join(tmpdir(), "render-settings-nobase-"));
    const home = makeHome();
    const { out, code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(1);
    expect(out).toContain("cannot read base settings");
    expect(existsSync(dest(home))).toBe(false);
    cleanup(dotfiles, home);
  });

  test("a base that is not a JSON object aborts", () => {
    const dotfiles = mkdtempSync(join(tmpdir(), "render-settings-arr-"));
    mkdirSync(join(dotfiles, "agents", "claude"), { recursive: true });
    writeFileSync(
      join(dotfiles, "agents", "claude", "settings.json"),
      "[1,2,3]\n",
    );
    const home = makeHome();
    const { out, code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(1);
    expect(out).toContain("not a JSON object");
    cleanup(dotfiles, home);
  });

  test("leaves no .rendering temp file behind on success", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    const home = makeHome();
    run({ HOME: home, DOTFILES: dotfiles });
    expect(existsSync(`${dest(home)}.rendering`)).toBe(false);
    cleanup(dotfiles, home);
  });
});
