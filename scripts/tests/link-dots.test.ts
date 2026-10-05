// bun test for scripts/link-dots.ts. Every fixture is a throwaway tmp tree; the real $HOME is never
// touched. The CLI is driven only in --check (read-only) and usage-error paths: --force would also
// render settings and, on macOS, talk to launchd, so the mutating paths are tested through the
// exported functions with a tmp ctx instead.
import { describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applies,
  assertRoots,
  type Ctx,
  link,
  linkSshAttach,
  prune,
  sshSupportsAttachMatch,
} from "../link-dots.ts";

const SCRIPT = join(import.meta.dir, "..", "link-dots.ts");
const REPO = join(import.meta.dir, "..", "..");

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function fixture(mode: Ctx["mode"]): Ctx {
  const dotfiles = tmp("link-dots-repo-");
  mkdirSync(join(dotfiles, "ssh"));
  writeFileSync(join(dotfiles, "a.conf"), "a\n");
  writeFileSync(join(dotfiles, "ssh", "smart-open-attach.conf"), "m\n");
  return {
    home: tmp("link-dots-home-"),
    dotfiles,
    os: "linux",
    mode,
    drift: [],
  };
}

const isLink = (p: string): boolean =>
  lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink() === true;

describe("sshSupportsAttachMatch", () => {
  test.each([
    ["OpenSSH_9.6p1 Ubuntu-3ubuntu13.14, OpenSSL 3.0.13", false],
    ["OpenSSH_9.8p1", false],
    ["OpenSSH_9.9p1", true],
    ["OpenSSH_10.0p2", true],
    ["OpenSSH_10.3p1, LibreSSL 3.3.6", true],
    ["no ssh client", false],
    ["", false],
  ] as const)("%s -> %p", (v, want) => {
    expect(sshSupportsAttachMatch(v)).toBe(want);
  });
});

test("applies: every When names its OSes explicitly", () => {
  expect(applies("all", "linux")).toBe(true);
  expect(applies("not-mac", "linux")).toBe(true);
  expect(applies("not-mac", "wsl")).toBe(true);
  expect(applies("not-mac", "mac")).toBe(false);
  expect(applies("wsl", "linux")).toBe(false);
  expect(applies("mac", "mac")).toBe(true);
});

describe("link", () => {
  test("creates the parent and links; a second run is a silent no-op", () => {
    const ctx = fixture("safe");
    const dst = join(ctx.home, "deep/dir/a.conf");
    link(ctx, "a.conf", dst);
    expect(readlinkSync(dst)).toBe(join(ctx.dotfiles, "a.conf"));
    link(ctx, "a.conf", dst);
    expect(ctx.drift).toEqual([]);
  });

  test("safe mode never touches a real file; force MOVES it aside, never deletes it", () => {
    const safe = fixture("safe");
    const dst = join(safe.home, "a.conf");
    writeFileSync(dst, "mine\n");
    link(safe, "a.conf", dst);
    expect(readFileSync(dst, "utf8")).toBe("mine\n");
    link({ ...safe, mode: "force" }, "a.conf", dst);
    expect(isLink(dst)).toBe(true);
    expect(readFileSync(`${dst}.pre-dotfiles`, "utf8")).toBe("mine\n");
  });

  test("force onto a real directory moves the whole directory aside (never rm -rf, never a link inside it)", () => {
    const ctx = fixture("force");
    const dst = join(ctx.home, "dir");
    mkdirSync(dst);
    writeFileSync(join(dst, "kept"), "k\n");
    link(ctx, "a.conf", dst);
    expect(isLink(dst)).toBe(true);
    expect(readFileSync(join(`${dst}.pre-dotfiles`, "kept"), "utf8")).toBe(
      "k\n",
    );
  });

  test("force never overwrites an existing backup: it skips and leaves both", () => {
    const ctx = fixture("force");
    const dst = join(ctx.home, "a.conf");
    writeFileSync(dst, "second\n");
    writeFileSync(`${dst}.pre-dotfiles`, "first\n");
    link(ctx, "a.conf", dst);
    expect(readFileSync(dst, "utf8")).toBe("second\n");
    expect(readFileSync(`${dst}.pre-dotfiles`, "utf8")).toBe("first\n");
  });

  test("check mode reports drift and writes nothing", () => {
    const ctx = fixture("check");
    const dst = join(ctx.home, "x/a.conf");
    link(ctx, "a.conf", dst);
    expect(ctx.drift).toHaveLength(1);
    expect(ctx.drift[0]).toContain("have nothing");
    expect(existsSync(join(ctx.home, "x"))).toBe(false);
  });

  test("a missing source is skipped, never linked dangling", () => {
    const ctx = fixture("force");
    const dst = join(ctx.home, "gone");
    link(ctx, "no-such-file", dst);
    expect(isLink(dst)).toBe(false);
  });
});

const dstOf = (ctx: Ctx): string =>
  join(ctx.home, ".ssh/config.d/smart-open-attach.conf");

describe("linkSshAttach", () => {
  test("a >= 9.9 client gets the attach file", () => {
    const ctx = fixture("safe");
    linkSshAttach(ctx, "OpenSSH_10.3p1");
    expect(isLink(dstOf(ctx))).toBe(true);
  });

  test("an older client has a leftover repo link removed (force/safe) or reported (check)", () => {
    const ctx = fixture("safe");
    linkSshAttach(ctx, "OpenSSH_10.3p1");
    const check: Ctx = { ...ctx, mode: "check", drift: [] };
    linkSshAttach(check, "OpenSSH_9.6p1");
    expect(check.drift[0]).toContain("needs OpenSSH >= 9.9");
    expect(isLink(dstOf(ctx))).toBe(true);
    linkSshAttach(ctx, "OpenSSH_9.6p1");
    expect(isLink(dstOf(ctx))).toBe(false);
  });

  test("an older client leaves a foreign file at that path alone", () => {
    const ctx = fixture("force");
    mkdirSync(join(ctx.home, ".ssh/config.d"), { recursive: true });
    writeFileSync(dstOf(ctx), "theirs\n");
    linkSshAttach(ctx, "OpenSSH_9.6p1");
    expect(readFileSync(dstOf(ctx), "utf8")).toBe("theirs\n");
  });
});

test("prune: removes only dangling links INTO the repo, and retired links even if alive", () => {
  const ctx = fixture("safe");
  const bin = join(ctx.home, ".local/bin");
  mkdirSync(bin, { recursive: true });
  symlinkSync(join(ctx.dotfiles, "renamed.ts"), join(bin, "ours-dangling"));
  symlinkSync("/nonexistent/elsewhere", join(bin, "foreign-dangling"));
  symlinkSync(join(ctx.dotfiles, "a.conf"), join(bin, "ours-healthy"));
  symlinkSync(join(ctx.dotfiles, "a.conf"), join(bin, "serena-foreground"));
  prune(ctx);
  expect(readdirSync(bin).toSorted()).toEqual([
    "foreign-dangling",
    "ours-healthy",
  ]);
});

test("assertRoots: relative or foreign roots are refused before any mutation", () => {
  const foreign = tmp("not-a-repo-");
  expect(() => {
    assertRoots("/h", "dotfiles");
  }).toThrow("DOTFILES is not absolute");
  expect(() => {
    assertRoots("h", REPO);
  }).toThrow("HOME is not absolute");
  expect(() => {
    assertRoots("/h", foreign);
  }).toThrow("not a dotfiles checkout");
  expect(() => {
    assertRoots("/h", REPO);
  }).not.toThrow();
});

describe("CLI", () => {
  function cli(args: string[], home: string): { code: number; out: string } {
    const r = Bun.spawnSync(["bun", SCRIPT, ...args], {
      env: { ...process.env, HOME: home, DOTFILES: REPO },
    });
    return {
      code: r.exitCode,
      out: r.stdout.toString() + r.stderr.toString(),
    };
  }

  test("--check on an empty home: drift lines, exit 1, nothing written", () => {
    const home = tmp("link-dots-cli-");
    const r = cli(["--check"], home);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^drift: .*\.zshenv \(want -> /mu);
    expect(r.out).toMatch(/^check: \d+ drift\(s\)$/mu);
    // bun itself may create its cache dir under HOME; link-dots writes nothing else.
    expect(
      readdirSync(home).filter((n) => n !== "Library" && n !== ".cache"),
    ).toEqual([]);
  });

  test("usage errors exit 2 before any work", () => {
    const home = tmp("link-dots-cli-");
    expect(cli(["--force", "--check"], home).code).toBe(2);
    expect(cli(["extra"], home).code).toBe(2);
    expect(cli(["--__proto__"], home).code).toBe(2);
    expect(
      readdirSync(home).filter((n) => n !== "Library" && n !== ".cache"),
    ).toEqual([]);
  });

  test("a foreign DOTFILES is FATAL before anything is linked", () => {
    const home = tmp("link-dots-cli-");
    const r = Bun.spawnSync(["bun", SCRIPT, "--force"], {
      env: { ...process.env, HOME: home, DOTFILES: tmp("not-a-repo-") },
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr.toString()).toContain("not a dotfiles checkout");
    expect(
      readdirSync(home).filter((n) => n !== "Library" && n !== ".cache"),
    ).toEqual([]);
  });
});
