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
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { mkdir, symlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { LINKS, surfaces } from "../config-registry.ts";
import {
  applies,
  assertRoots,
  type Ctx,
  deployStatuslineOwners,
  ensureToolOwned,
  link,
  loadSmartOpenReceiver,
  googleDriveTargets,
  linkSshAttach,
  linkGoogleDrive,
  prune,
  sshSupportsAttachMatch,
} from "../link-dots.ts";

const SCRIPT = join(import.meta.dir, "..", "link-dots.ts");
// What bun itself creates under a fresh HOME (its caches): macOS Library/ and .cache/, Linux .bun/.
// link-dots writes none of these, so "nothing written" means nothing else.
const BUN_OWN = new Set(["Library", ".cache", ".bun"]);
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

async function ownerFixture(): Promise<Ctx> {
  const ctx = { ...fixture("safe"), dotfiles: REPO };
  const directory = join(ctx.home, ".config/systemd/user");
  await mkdir(directory, { recursive: true });
  for (const unit of [
    "statusline-sampler.service",
    "statusline-sampler.timer",
    "agx-doctor.service",
    "agx-doctor.timer",
  ])
    await symlink(join(REPO, "systemd", unit), join(directory, unit));
  return ctx;
}

test("mac sampler agent is linked, bootstrapped idempotently, and check is read-only", async () => {
  const ctx = { ...fixture("safe"), dotfiles: REPO, os: "mac" as const };
  const dir = join(ctx.home, "Library/LaunchAgents");
  mkdirSync(dir, { recursive: true });
  const plist = join(dir, "statusline-sampler.plist");
  symlinkSync(join(REPO, "launchd/statusline-sampler.plist"), plist);
  const calls: string[][] = [];
  const launch = (args: string[]) => {
    calls.push(args);
    return Promise.resolve({ code: 0, out: "" });
  };
  expect(
    await deployStatuslineOwners(ctx, undefined, undefined, launch),
  ).toBeUndefined();
  expect(calls.map((args) => args[0])).toEqual([
    "print",
    "bootout",
    "bootstrap",
  ]);
  expect(calls[2]?.[2]).toBe(plist);
  calls.length = 0;
  expect(
    await deployStatuslineOwners(
      { ...ctx, mode: "check" },
      undefined,
      undefined,
      launch,
    ),
  ).toBeUndefined();
  expect(calls).toEqual([]);
  const declaration = readFileSync(
    join(REPO, "launchd/statusline-sampler.plist"),
    "utf8",
  );
  expect(declaration).toContain("<integer>5</integer>");
  expect(declaration).toContain("STATUSLINE_SAMPLER_LOCK_DIR");
  expect(declaration).toContain("/opt/homebrew/bin");
  expect(declaration).toContain("tools/statusline/src/sampler.ts");
  expect(declaration).not.toContain("linuxbrew");
});

test("mac sampler reports bootstrap failure", async () => {
  const ctx = { ...fixture("safe"), dotfiles: REPO, os: "mac" as const };
  const dir = join(ctx.home, "Library/LaunchAgents");
  mkdirSync(dir, { recursive: true });
  symlinkSync(
    join(REPO, "launchd/statusline-sampler.plist"),
    join(dir, "statusline-sampler.plist"),
  );
  const error = await deployStatuslineOwners(
    ctx,
    undefined,
    undefined,
    (args) =>
      Promise.resolve({
        code: 1,
        out: args[0] === "bootstrap" ? "denied" : "not loaded",
      }),
  );
  expect(error?.message).toContain("denied");
});

test("doctor refresh deployment enables its timer without starting a collector", async () => {
  const calls: string[][] = [];
  const result = await deployStatuslineOwners(
    await ownerFixture(),
    (args) => {
      calls.push(args);
      // Collector activation belongs to the timer, not the linking operation.
      return Promise.resolve(
        args[0] === "start" && !args.includes("--no-block")
          ? { code: 137, out: "" }
          : { code: 0, out: "" },
      );
    },
    true,
  );
  expect(result).toBeUndefined();
  expect(calls).toContainEqual(["stop", "agx-doctor.path"]);
  expect(calls).toContainEqual(["enable", "agx-doctor.timer"]);
  expect(calls.some((args) => args[0] === "start")).toBe(false);
  const unit = await Bun.file(join(REPO, "systemd/agx-doctor.service")).text();
  expect(unit).toMatch(/^SuccessExitStatus=1$/mu);
  expect(unit).not.toContain("ExecStartPre=");
  expect(unit).toContain("agx doctor --json --refresh");
  expect(unit).not.toContain("SuccessExitStatus=1 2");
});

test.each([
  { code: 5, out: "bus connection refused" },
  { code: 137, out: "" },
])(
  "owner deployment reports systemctl exit $code and its output",
  async (failure) => {
    const result = await deployStatuslineOwners(
      await ownerFixture(),
      () => Promise.resolve(failure),
      true,
    );
    expect(result?.message).toContain(`exit ${failure.code}`);
    expect(result?.message).toContain(
      failure.out === "" ? "no output" : failure.out,
    );
  },
);

test("fresh deployment skips the absent retired path; failed retirement stops deployment", async () => {
  const ctx = await ownerFixture();
  const calls: string[][] = [];
  expect(
    await deployStatuslineOwners(
      ctx,
      (args) => {
        calls.push(args);
        return Promise.resolve({
          code: 0,
          out:
            args[0] === "show"
              ? "LoadState=not-found\nActiveState=inactive\n"
              : "",
        });
      },
      true,
    ),
  ).toBeUndefined();
  expect(calls.some((args) => args[0] === "stop")).toBe(false);
  expect(calls).toContainEqual(["enable", "agx-doctor.timer"]);

  calls.length = 0;
  const failure = await deployStatuslineOwners(
    ctx,
    (args) => {
      calls.push(args);
      return Promise.resolve(
        args[0] === "stop"
          ? { code: 1, out: "retirement failed" }
          : { code: 0, out: "LoadState=loaded\nActiveState=active\n" },
      );
    },
    true,
  );
  expect(failure?.message).toContain("retirement failed");
  expect(calls.some((args) => args[0] === "enable")).toBe(false);
});

test("retired path links are pruned without removing foreign links", async () => {
  const ctx = await ownerFixture();
  const directory = join(ctx.home, ".config/systemd/user");
  mkdirSync(join(directory, "default.target.wants"));
  for (const rel of ["agx-doctor.path", "default.target.wants/agx-doctor.path"])
    symlinkSync(join(REPO, "systemd/agx-doctor.path"), join(directory, rel));
  prune(ctx);
  expect(isLink(join(directory, "agx-doctor.path"))).toBe(false);
  expect(isLink(join(directory, "default.target.wants/agx-doctor.path"))).toBe(
    false,
  );
  symlinkSync("/foreign/agx-doctor.path", join(directory, "agx-doctor.path"));
  prune(ctx);
  expect(isLink(join(directory, "agx-doctor.path"))).toBe(true);
});

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

test.each(["mac", "wsl", "linux"] as const)(
  "the user policy is declared and deployed verbatim on %s without touching host state",
  (os) => {
    const ctx: Ctx = { ...fixture("safe"), dotfiles: REPO, os };
    const entry = LINKS.find(([, source]) => source === "agents/agx/agx.toml");
    expect(entry).toEqual([
      "all",
      "agents/agx/agx.toml",
      ".config/agx/agx.toml",
    ]);
    if (entry === undefined) return;
    expect(applies(entry[0], os)).toBe(true);
    const directory = join(ctx.home, ".config/agx");
    mkdirSync(join(directory, "repos"), { recursive: true });
    writeFileSync(join(directory, "host.toml"), "host fixture\n");
    writeFileSync(join(directory, "repos/kept.toml"), "repo fixture\n");
    const destination = join(ctx.home, entry[2]);
    link(ctx, entry[1], destination);
    expect(readlinkSync(destination)).toBe(join(REPO, entry[1]));
    expect(readFileSync(destination, "utf8")).toBe(
      readFileSync(join(REPO, entry[1]), "utf8"),
    );
    expect(readFileSync(join(directory, "host.toml"), "utf8")).toBe(
      "host fixture\n",
    );
    expect(readFileSync(join(directory, "repos/kept.toml"), "utf8")).toBe(
      "repo fixture\n",
    );
    expect(surfaces().filter((row) => row.sources.includes(entry[1]))).toEqual([
      {
        kind: "link",
        when: "all",
        sources: [entry[1]],
        deployed: "~/.config/agx/agx.toml",
        consumer: "agx-worker",
        writer: "human, in the repo",
        verify: "agx worker check",
      },
    ]);
  },
);

test("the WSL systemd environment drop-in is registered and linked into XDG config", () => {
  const home = tmp("wsl-env-home-");
  const ctx: Ctx = {
    home,
    dotfiles: REPO,
    os: "linux",
    mode: "safe",
    drift: [],
  };
  const entry = LINKS.find(
    ([when, source]) =>
      when === "wsl" && source === "wsl/environment.d/99-zz-wsl-gpu.conf",
  );
  expect(entry).toEqual([
    "wsl",
    "wsl/environment.d/99-zz-wsl-gpu.conf",
    ".config/environment.d/99-zz-wsl-gpu.conf",
  ]);
  if (entry === undefined) return;
  expect(basename(entry[1]) > "99-environment.conf").toBe(true);
  const destination = join(home, entry[2]);
  link(ctx, entry[1], destination);
  expect(readlinkSync(destination)).toBe(join(REPO, entry[1]));
});

test("the systemd user PATH drop-in is registered and linked into XDG config", () => {
  const home = tmp("systemd-path-home-");
  const ctx: Ctx = {
    home,
    dotfiles: REPO,
    os: "linux",
    mode: "safe",
    drift: [],
  };
  const entry = LINKS.find(
    ([when, source]) =>
      when === "not-mac" && source === "zsh/environment.d/99-zz-path.conf",
  );
  expect(entry).toEqual([
    "not-mac",
    "zsh/environment.d/99-zz-path.conf",
    ".config/environment.d/99-zz-path.conf",
  ]);
  if (entry === undefined) return;
  expect(basename(entry[1]) > "99-environment.conf").toBe(true);
  const destination = join(home, entry[2]);
  link(ctx, entry[1], destination);
  expect(readlinkSync(destination)).toBe(join(REPO, entry[1]));
});

test("Google Drive targets are discovered without storing the account folder name", () => {
  const home = tmp("drive-home-");
  const root = join(home, "Library/CloudStorage/GoogleDrive-user-id");
  const personal = join(
    root,
    "My Drive",
    "private account folder",
    "Personal-Drive",
  );
  mkdirSync(personal, { recursive: true });
  expect(googleDriveTargets(home, "mac")).toEqual({ root, personal });

  const ctx: Ctx = { home, dotfiles: REPO, os: "mac", mode: "safe", drift: [] };
  linkGoogleDrive(ctx);
  expect(readlinkSync(join(home, "Google Drive"))).toBe(root);
  expect(readlinkSync(join(home, "Personal-Drive"))).toBe(personal);
});

test("WSL Google Drive discovery is cached per host and reruns only when its target disappears", () => {
  const home = tmp("drive-wsl-home-");
  const root = join(home, "drive");
  const first = join(root, "My Drive", "account", "Personal-Drive");
  const second = join(root, "My Drive", "other", "Personal-Drive");
  const cachePath = join(home, ".local/state/dotfiles/google-drive-test.json");
  mkdirSync(first, { recursive: true });
  const options = { wslRoot: root, cachePath, maxDiscoveryMs: 1_000 };

  expect(googleDriveTargets(home, "wsl", options)).toEqual({
    root,
    personal: first,
  });
  expect(readFileSync(cachePath, "utf8")).toContain(first);

  mkdirSync(second, { recursive: true });
  expect(googleDriveTargets(home, "wsl", options)).toEqual({
    root,
    personal: first,
  });

  renameSync(first, join(root, "My Drive", "account", "saved-personal-drive"));
  expect(googleDriveTargets(home, "wsl", options)).toEqual({
    root,
    personal: second,
  });
});

test("Google Drive discovery refuses ambiguous roots and private collections", () => {
  const home = tmp("drive-home-");
  const cloud = join(home, "Library/CloudStorage");
  mkdirSync(join(cloud, "GoogleDrive-one"), { recursive: true });
  mkdirSync(join(cloud, "GoogleDrive-two"), { recursive: true });
  expect(googleDriveTargets(home, "mac")).toEqual({});

  const uniqueHome = tmp("drive-home-");
  const root = join(uniqueHome, "Library/CloudStorage/GoogleDrive-one");
  mkdirSync(join(root, "My Drive", "a", "Personal-Drive"), { recursive: true });
  mkdirSync(join(root, "My Drive", "b", "Personal-Drive"), { recursive: true });
  expect(googleDriveTargets(uniqueHome, "mac")).toEqual({ root });
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

describe("loadSmartOpenReceiver", () => {
  function receiverFixture(): Ctx {
    const ctx = fixture("safe");
    ctx.os = "mac";
    mkdirSync(join(ctx.home, "Library/LaunchAgents"), { recursive: true });
    writeFileSync(
      join(ctx.dotfiles, "receiver.plist"),
      `<?xml version="1.0"?><plist><dict><key>ProgramArguments</key><array><string>/bin/zsh</string><string>-lc</string><string>exec bun "$HOME/dotfiles/tools/smart-open/src/receive.ts"</string></array></dict></plist>`,
    );
    symlinkSync(
      join(ctx.dotfiles, "receiver.plist"),
      join(ctx.home, "Library/LaunchAgents/dotfiles.smart-open-receiver.plist"),
    );
    return ctx;
  }

  test("reboots a loaded agent when its arguments differ from the plist", () => {
    const ctx = receiverFixture();
    const calls: string[][] = [];
    loadSmartOpenReceiver(ctx, (args) => {
      calls.push(args);
      return args[0] === "print"
        ? {
            exitCode: 0,
            stdout: `arguments = {\n    /bin/zsh\n    -lc\n    exec bun "$HOME/dotfiles/smart-open/smart-open.ts"\n}\n`,
          }
        : { exitCode: 0, stdout: "" };
    });
    expect(calls.map(([verb]) => verb)).toEqual([
      "print",
      "bootout",
      "bootstrap",
    ]);
  });

  test("does not reload when the loaded arguments match the plist", () => {
    const ctx = receiverFixture();
    const calls: string[][] = [];
    loadSmartOpenReceiver(ctx, (args) => {
      calls.push(args);
      return {
        exitCode: 0,
        stdout: `arguments = {\n    /bin/zsh\n    -lc\n    exec bun "$HOME/dotfiles/tools/smart-open/src/receive.ts"\n}\n`,
      };
    });
    expect(calls.map(([verb]) => verb)).toEqual(["print"]);
  });

  test("reloads when the plist link target changed even if arguments match", () => {
    const ctx = receiverFixture();
    const plist = join(
      ctx.home,
      "Library/LaunchAgents/dotfiles.smart-open-receiver.plist",
    );
    ctx.changedLinks = new Set([plist]);
    const calls: string[][] = [];
    loadSmartOpenReceiver(ctx, (args) => {
      calls.push(args);
      return {
        exitCode: 0,
        stdout: `arguments = {\n    /bin/zsh\n    -lc\n    exec bun "$HOME/dotfiles/tools/smart-open/src/receive.ts"\n}\n`,
      };
    });
    expect(calls.map(([verb]) => verb)).toEqual([
      "print",
      "bootout",
      "bootstrap",
    ]);
  });
});

test.each(["ENODEV", "ENOTCONN", "EIO", "ESTALE"])(
  "stale Drive (%s) preserves its links and permits later links and units",
  async (code) => {
    const ctx = await ownerFixture();
    ctx.os = "wsl";
    symlinkSync("/mnt/g", join(ctx.home, "Google Drive"));
    const result = Bun.spawnSync(
      [
        process.execPath,
        "-e",
        `
      import { spyOn } from "bun:test";
      import * as fs from "node:fs";
      import assert from "node:assert/strict";
      import { linkGoogleDrive, link, deployStatuslineOwners } from ${JSON.stringify(SCRIPT)};
      const ctx = ${JSON.stringify(ctx)};
      const original = fs.statSync;
      spyOn(fs, "statSync").mockImplementation((...args) => {
        if (String(args[0]) === "/mnt/g")
          throw Object.assign(new Error("stale"), { code: ${JSON.stringify(code)}, path: "/mnt/g" });
        return original(...args);
      });
      linkGoogleDrive(ctx);
      linkGoogleDrive(ctx);
      link(ctx, "zsh/zshenv", ctx.home + "/.zshenv");
      const calls = [];
      const error = await deployStatuslineOwners(ctx, async (args) => {
        calls.push(args);
        return { code: 0, out: "" };
      }, true);
      assert.equal(error, undefined);
      assert(calls.some(args => args.includes("statusline-sampler.timer")));
      assert.deepEqual([...ctx.unreachable], ["/mnt/g"]);
    `,
      ],
      { timeout: 5000 },
    );
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(result.stderr.toString()).toBe(
      `skip (unreachable ${code}): /mnt/g; repair: mise run wsl:drive-mount && sudo mount /mnt/g\n`,
    );
    expect(readlinkSync(join(ctx.home, ".zshenv"))).toBe(
      join(REPO, "zsh/zshenv"),
    );
    expect(readlinkSync(join(ctx.home, "Google Drive"))).toBe("/mnt/g");
    expect(result.stdout.toString()).toContain(
      "enabled: statusline-sampler.timer",
    );
  },
);

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

test.each(["mac", "wsl", "linux"] as const)(
  "retired bun wrapper: check reports, deploy prunes on %s, foreign links and binaries survive",
  (os) => {
    const ctx = { ...fixture("safe"), os };
    const bin = join(ctx.home, ".local/bin");
    const dst = join(bin, "bun");
    const wrapper = join(ctx.dotfiles, "scripts/bun-exec.sh");
    mkdirSync(bin, { recursive: true });
    mkdirSync(join(ctx.dotfiles, "scripts"));
    writeFileSync(wrapper, "#!/bin/sh\nexit 0\n");
    symlinkSync(wrapper, dst);
    const check: Ctx = { ...ctx, mode: "check", drift: [] };
    prune(check);
    expect(check.drift).toHaveLength(1);
    expect(check.drift[0]).toContain("retired: no longer declared");
    expect(readlinkSync(dst)).toBe(wrapper);
    prune(ctx);
    expect(isLink(dst)).toBe(false);
    expect(existsSync(wrapper)).toBe(true);
    writeFileSync(dst, "standalone binary\n");
    prune(ctx);
    expect(readFileSync(dst, "utf8")).toBe("standalone binary\n");
    const foreign = { ...fixture("safe"), os };
    mkdirSync(join(foreign.home, ".local/bin"), { recursive: true });
    const foreignDst = join(foreign.home, ".local/bin/bun");
    symlinkSync(wrapper, foreignDst);
    prune(foreign);
    expect(readlinkSync(foreignDst)).toBe(wrapper);
  },
);

test("assertRoots: relative or foreign roots are refused before any mutation", () => {
  const foreign = tmp("not-a-repo-");
  expect(assertRoots("/h", "dotfiles")?.message).toContain(
    "DOTFILES is not absolute",
  );
  expect(assertRoots("h", REPO)?.message).toContain("HOME is not absolute");
  expect(assertRoots("/h", foreign)?.message).toContain(
    "not a dotfiles checkout",
  );
  expect(assertRoots("/h", REPO)).toBeUndefined();
});

describe("CLI", () => {
  test.each(["ENODEV", "ENOTCONN", "EIO", "ESTALE", "EACCES"])(
    "registry destination %s reports its outcome after other links",
    (code) => {
      const home = tmp("link-dots-stale-cli-");
      mkdirSync(join(home, ".bun/bin"), { recursive: true });
      writeFileSync(join(home, ".bun/bin/statusline"), "#!/bin/sh\n");
      const preload = join(tmp("link-dots-preload-"), "stale.ts");
      const failed = join(home, ".zshrc");
      writeFileSync(
        preload,
        `
      import { spyOn } from "bun:test";
      import * as fs from "node:fs";
      import * as fsp from "node:fs/promises";
      import * as os from "node:os";
      spyOn(os, "release").mockReturnValue("plain-linux");
      const lstat = fs.lstatSync;
      spyOn(fs, "lstatSync").mockImplementation((...args) => {
        if (String(args[0]) === ${JSON.stringify(failed)})
          throw Object.assign(new Error("stale"), { code: ${JSON.stringify(code)}, path: ${JSON.stringify(failed)} });
        return lstat(...args);
      });
      const exists = fs.existsSync;
      spyOn(fs, "existsSync").mockImplementation((path) =>
        String(path) === "/run/systemd/system" ? false : exists(path));
      const access = fsp.access;
      spyOn(fsp, "access").mockImplementation((...args) =>
        String(args[0]) === "/run/systemd/system" ? Promise.reject(new Error("fixture has no systemd")) : access(...args));
    `,
      );
      const r = Bun.spawnSync(
        [process.execPath, "--preload", preload, SCRIPT, "--from-working-copy"],
        {
          env: {
            ...process.env,
            HOME: home,
            DOTFILES: REPO,
            COMMAND_TARGET_HOME: home,
            AGX_CONFIG: join(home, ".config/agx/agx.toml"),
          },
          timeout: 60_000,
        },
      );
      if (code === "EACCES") {
        expect(r.exitCode).toBe(2);
        expect(r.stderr.toString()).toContain("FATAL: stale");
        return;
      }
      expect(r.exitCode, r.stderr.toString()).toBe(1);
      expect(r.stderr.toString().trim().split("\n")).toEqual([
        `skip (unreachable ${code}): ${failed}; repair: mise run wsl:drive-mount && sudo mount /mnt/g`,
      ]);
      for (const [when, src, dst] of LINKS) {
        if (
          !applies(when, "linux") ||
          src.startsWith("@") ||
          join(home, dst) === failed
        )
          continue;
        expect(readlinkSync(join(home, dst))).toBe(join(REPO, src));
      }
      expect(existsSync(join(home, ".claude/settings.json"))).toBe(true);
      expect(r.stdout.toString()).toContain("done with 1 unreachable path(s).");
    },
    65_000,
  );

  function cli(args: string[], home: string): { code: number; out: string } {
    const r = Bun.spawnSync([process.execPath, SCRIPT, ...args], {
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
    // Bun may create its own cache dir under HOME; check mode must not persist the WSL
    // Google Drive discovery cache under .local/state/dotfiles.
    expect(existsSync(join(home, ".local"))).toBe(false);
    expect(readdirSync(home).filter((n) => !BUN_OWN.has(n))).toEqual([]);
  });

  test("usage errors exit 2 before any work", () => {
    const home = tmp("link-dots-cli-");
    expect(cli(["--force", "--check"], home).code).toBe(2);
    expect(cli(["extra"], home).code).toBe(2);
    expect(cli(["--__proto__"], home).code).toBe(2);
    expect(readdirSync(home).filter((n) => !BUN_OWN.has(n))).toEqual([]);
  });

  test("a foreign DOTFILES is FATAL before anything is linked", () => {
    const home = tmp("link-dots-cli-");
    const r = Bun.spawnSync([process.execPath, SCRIPT, "--force"], {
      env: { ...process.env, HOME: home, DOTFILES: tmp("not-a-repo-") },
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr.toString()).toContain("not a dotfiles checkout");
    expect(readdirSync(home).filter((n) => !BUN_OWN.has(n))).toEqual([]);
  });
});

describe("ensureToolOwned (INV-8: a file a tool writes is never a link into the repo)", () => {
  test("the retired link into the repo is pruned, then an empty real file takes its place", () => {
    const ctx = fixture("safe");
    writeFileSync(join(ctx.dotfiles, "gitconfig"), "[user]\n");
    symlinkSync(join(ctx.dotfiles, "gitconfig"), join(ctx.home, ".gitconfig"));
    prune(ctx);
    ensureToolOwned(ctx, join(ctx.home, ".gitconfig"));
    expect(isLink(join(ctx.home, ".gitconfig"))).toBe(false);
    expect(readFileSync(join(ctx.home, ".gitconfig"), "utf8")).toBe("");
    // The repo file is untouched — the whole point.
    expect(readFileSync(join(ctx.dotfiles, "gitconfig"), "utf8")).toBe(
      "[user]\n",
    );
  });

  test("an existing real file is the tool's and is never rewritten", () => {
    const ctx = fixture("safe");
    writeFileSync(join(ctx.home, ".gitconfig"), "[credential]\n");
    ensureToolOwned(ctx, join(ctx.home, ".gitconfig"));
    expect(readFileSync(join(ctx.home, ".gitconfig"), "utf8")).toBe(
      "[credential]\n",
    );
  });

  test("--check reports a missing one as drift and writes nothing", () => {
    const ctx = fixture("check");
    ensureToolOwned(ctx, join(ctx.home, ".config", "jj", "config.toml"));
    expect(ctx.drift).toHaveLength(1);
    expect(existsSync(join(ctx.home, ".config"))).toBe(false);
  });

  test("a foreign symlink is reported, never replaced", () => {
    const ctx = fixture("safe");
    symlinkSync("/elsewhere", join(ctx.home, ".gitconfig"));
    ensureToolOwned(ctx, join(ctx.home, ".gitconfig"));
    expect(readlinkSync(join(ctx.home, ".gitconfig"))).toBe("/elsewhere");
  });
});
