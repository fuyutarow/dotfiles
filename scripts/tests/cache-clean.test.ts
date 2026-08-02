// bun test for scripts/cache-clean.ts — the bun port of mise task `cache:clean`.
//
// Two layers:
//  1. Unit tests against the exported pure/injectable helpers (freeSpace, isUvBusy,
//     cleanupTempDir, resolveHome, toolAvailable, runSimpleStep) — host-independent, no real
//     package-manager cache is ever touched.
//  2. CLI-level tests that spawn the REAL script as a subprocess with a fully-replaced PATH
//     pointing at throwaway fixture stub binaries (never the real brew/npm/uv/...), so the
//     tool-detection + ordering + error-swallowing contract is exercised end to end without
//     any risk to the real $HOME or real caches. Safety: every non-dry-run invocation below
//     runs only against these fixture stubs, never against real tools, and --home always
//     points at a throwaway fixture directory, never the real $HOME.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cleanupTempDir,
  freeSpace,
  isUvBusy,
  resolveHome,
  runSimpleStep,
  toolAvailable,
} from "../cache-clean";

const SCRIPT = new URL("../cache-clean.ts", import.meta.url).pathname;

// mise ships a `bun` SHIM (a symlink to the mise binary itself, dispatched by argv[0]) ahead of
// the real bun on PATH. Bun.spawnSync's `env` option REPLACES rather than merges the child's
// environment, so a restricted-PATH subprocess needs an absolute path to the REAL bun binary —
// resolving "bun" via the shim would just re-invoke mise. Same trick as
// agents/skills/wiring-mise-tasks/tests/mise-contract.test.ts.
function resolveRealBun(): string {
  for (const dir of (process.env.PATH ?? "").split(":").filter(Boolean)) {
    const candidate = join(dir, "bun");
    if (!existsSync(candidate)) continue;
    if (!realpathSync(candidate).includes("mise")) return candidate;
  }
  throw new Error("no non-mise-shim `bun` found on PATH for the test harness");
}
const REAL_BUN = resolveRealBun();

function makeStub(dir: string, name: string, exitCode = 0): void {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\nexit ${exitCode}\n`);
  chmodSync(path, 0o755);
}

function runScript(
  args: string[],
  opts: {
    pathDirs?: string[];
    home?: string;
    env?: Record<string, string>;
  } = {},
): { out: string; err: string; code: number } {
  const pathDirs = [...(opts.pathDirs ?? []), "/usr/bin", "/bin"];
  const env: Record<string, string> = {
    PATH: pathDirs.join(":"),
    ...opts.env,
  };
  if (opts.home !== undefined) env.HOME = opts.home;
  // bounded: each fixture run is a handful of no-op fake binaries; nothing here can hang
  const proc = Bun.spawnSync([REAL_BUN, SCRIPT, ...args], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    out: proc.stdout.toString(),
    err: proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

// ---- unit: freeSpace ------------------------------------------------------------------------

describe("freeSpace", () => {
  test("reads the 4th whitespace-separated field of the second line, appends ' free'", () => {
    const fakeSpawn = (() => ({
      stdout: Buffer.from(
        "Filesystem      Size  Used Avail Use% Mounted on\n" +
          "/dev/sda1       200G  100G   60G  63% /\n",
      ),
    })) as unknown as typeof Bun.spawnSync;
    expect(freeSpace("/whatever", fakeSpawn)).toBe("60G free");
  });

  test("returns empty string when df has no second line (awk's NR==2 never fires)", () => {
    const fakeSpawn = (() => ({
      stdout: Buffer.from("Filesystem      Size  Used Avail Use% Mounted on\n"),
    })) as unknown as typeof Bun.spawnSync;
    expect(freeSpace("/whatever", fakeSpawn)).toBe("");
  });

  test("returns empty string when the df spawn itself throws (df missing)", () => {
    const fakeSpawn = (() => {
      throw new Error("ENOENT");
    }) as unknown as typeof Bun.spawnSync;
    expect(freeSpace("/whatever", fakeSpawn)).toBe("");
  });

  test('df\'s own stderr is inherited, not suppressed (original `df -h "$HOME" | awk ...` never redirects it)', () => {
    let seenOpts: Record<string, unknown> | undefined;
    const fakeSpawn = ((_cmd: string[], opts: Record<string, unknown>) => {
      seenOpts = opts;
      return { stdout: Buffer.from("") };
    }) as unknown as typeof Bun.spawnSync;
    freeSpace("/whatever", fakeSpawn);
    expect(seenOpts?.stderr).toBe("inherit");
  });
});

// ---- unit: isUvBusy ---------------------------------------------------------------------------

describe("isUvBusy", () => {
  test("pgrep exit 0 => busy", () => {
    const fakeSpawn = (() => ({
      exitCode: 0,
    })) as unknown as typeof Bun.spawnSync;
    expect(isUvBusy(fakeSpawn)).toBe(true);
  });

  test("pgrep nonzero exit => not busy", () => {
    const fakeSpawn = (() => ({
      exitCode: 1,
    })) as unknown as typeof Bun.spawnSync;
    expect(isUvBusy(fakeSpawn)).toBe(false);
  });

  test("pgrep missing (spawn throws) => not busy, mirrors the shell's `if pgrep ...` false branch", () => {
    const fakeSpawn = (() => {
      throw new Error("ENOENT");
    }) as unknown as typeof Bun.spawnSync;
    expect(isUvBusy(fakeSpawn)).toBe(false);
  });
});

// ---- unit: cleanupTempDir (rip-then-rm fallback) -----------------------------------------------

describe("cleanupTempDir", () => {
  function makeTempDir(): string {
    return mkdtempSync(join(tmpdir(), "cache-clean-cleanup-"));
  }

  test("rip available and succeeds -> rmSync fallback is NOT taken (dir left for rip to have handled)", () => {
    const dir = makeTempDir();
    const fakeSpawn = (() => ({
      exitCode: 0,
    })) as unknown as typeof Bun.spawnSync;
    cleanupTempDir(dir, { ripAvailable: true, spawn: fakeSpawn });
    // the fake spawn never really deletes anything; the dir surviving proves our code did NOT
    // also call rmSync as a fallback when rip reported success
    expect(existsSync(dir)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("rip available but reports failure -> falls back to rmSync", () => {
    const dir = makeTempDir();
    const fakeSpawn = (() => ({
      exitCode: 1,
    })) as unknown as typeof Bun.spawnSync;
    cleanupTempDir(dir, { ripAvailable: true, spawn: fakeSpawn });
    expect(existsSync(dir)).toBe(false);
  });

  test("rip unavailable -> spawn is never invoked, falls straight to rmSync", () => {
    const dir = makeTempDir();
    let called = false;
    const fakeSpawn = (() => {
      called = true;
      return { exitCode: 0 };
    }) as unknown as typeof Bun.spawnSync;
    cleanupTempDir(dir, { ripAvailable: false, spawn: fakeSpawn });
    expect(called).toBe(false);
    expect(existsSync(dir)).toBe(false);
  });

  test('rip\'s stdout is inherited, only its stderr is suppressed (original `rip "$_bt" 2>/dev/null`)', () => {
    const dir = makeTempDir();
    let seenOpts: Record<string, unknown> | undefined;
    const fakeSpawn = ((_cmd: string[], opts: Record<string, unknown>) => {
      seenOpts = opts;
      return { exitCode: 0 };
    }) as unknown as typeof Bun.spawnSync;
    cleanupTempDir(dir, { ripAvailable: true, spawn: fakeSpawn });
    expect(seenOpts?.stdout).toBe("inherit");
    expect(seenOpts?.stderr).toBe("ignore");
    rmSync(dir, { recursive: true, force: true });
  });
});

// ---- unit: resolveHome ------------------------------------------------------------------------

describe("resolveHome", () => {
  test("an explicit arg wins", () => {
    expect(resolveHome("/explicit/home")).toBe("/explicit/home");
  });

  test("falls back to process.env.HOME, matching the shell's bare $HOME default", () => {
    const prev = process.env.HOME;
    process.env.HOME = "/env/home";
    try {
      expect(resolveHome(undefined)).toBe("/env/home");
    } finally {
      if (prev === undefined) delete process.env.HOME;
      else process.env.HOME = prev;
    }
  });
});

// ---- unit: toolAvailable ----------------------------------------------------------------------

describe("toolAvailable", () => {
  test("true for a binary certainly on PATH (sh)", () => {
    expect(toolAvailable("sh")).toBe(true);
  });

  test("false for a name that is not a real binary", () => {
    expect(toolAvailable("definitely-not-a-real-tool-xyz123")).toBe(false);
  });
});

// ---- unit: runSimpleStep (skip / dry-run / label-vs-command divergence / error swallow) -------

describe("runSimpleStep", () => {
  function captureLog(fn: () => void): string[] {
    const logs: string[] = [];
    const orig = console.log;
    console.log = ((...a: unknown[]) =>
      logs.push(a.join(" "))) as typeof console.log;
    try {
      fn();
    } finally {
      console.log = orig;
    }
    return logs;
  }

  test("absent tool -> completely silent, nothing runs", () => {
    const logs = captureLog(() =>
      runSimpleStep(
        { tool: "definitely-not-a-real-tool-xyz123", label: "x", cmd: ["x"] },
        false,
      ),
    );
    expect(logs).toEqual([]);
  });

  test("dry-run prints the full real command line (not the shorter echo label)", () => {
    const logs = captureLog(() =>
      runSimpleStep(
        { tool: "sh", label: "shell noop", cmd: ["sh", "-c", "exit 0"] },
        true,
      ),
    );
    expect(logs).toEqual(["[dry-run] would run: sh -c exit 0"]);
  });

  test("real run prints the short '• label' line, then executes, swallowing a nonzero exit", () => {
    const logs = captureLog(() =>
      runSimpleStep(
        { tool: "sh", label: "shell noop", cmd: ["sh", "-c", "exit 1"] },
        false,
      ),
    );
    expect(logs).toEqual(["• shell noop"]);
  });
});

// ---- CLI integration: the whole script as a subprocess, fixture PATH + fixture --home ---------

describe("cache-clean.ts CLI", () => {
  let stubAll: string;
  let stubNone: string;
  let fixtureHome: string;

  beforeAll(() => {
    stubAll = mkdtempSync(join(tmpdir(), "cache-clean-stubs-all-"));
    for (const name of [
      "brew",
      "bun",
      "npm",
      "pnpm",
      "yarn",
      "pip",
      "go",
      "docker",
      "cargo",
      "rip",
      // deliberately no "uv" stub: leaves uv-detection deterministic (absent) regardless of
      // whatever uv/uvx activity happens to be running on the host machine during the test
    ]) {
      makeStub(stubAll, name, 0);
    }
    stubNone = mkdtempSync(join(tmpdir(), "cache-clean-stubs-none-"));
    fixtureHome = mkdtempSync(join(tmpdir(), "cache-clean-home-"));
  });

  afterAll(() => {
    rmSync(stubAll, { recursive: true, force: true });
    rmSync(stubNone, { recursive: true, force: true });
    rmSync(fixtureHome, { recursive: true, force: true });
  });

  test("--dry-run with every tool present: one would-run line per tool, in the original order", () => {
    const { out, code } = runScript(["--dry-run", "--home", fixtureHome], {
      pathDirs: [stubAll],
    });
    expect(code).toBe(0);
    const lines = out.trimEnd().split("\n");

    expect(lines[0]).toMatch(/^before: /);
    expect(lines[lines.length - 2]).toMatch(/^after: {2}/);
    expect(lines[lines.length - 1]).toBe(
      "✅ cache:clean done. Project build artifacts (node_modules/target/…) → mise run cache:projects",
    );

    const idx = (needle: string) => lines.findIndex((l) => l.includes(needle));
    const order = [
      idx("brew cleanup --prune=all"),
      idx("bun pm cache rm"),
      idx("npm cache clean --force"),
      idx("pnpm store prune"),
      idx("yarn cache clean"),
      idx("pip cache purge"),
      idx("go clean -cache"),
      idx("docker builder prune"),
      idx(`rip ${join(fixtureHome, ".cargo", "registry", "src")}`),
    ];
    for (const i of order) expect(i).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < order.length; i++) {
      const current = order[i];
      const previous = order[i - 1];
      if (current === undefined || previous === undefined) {
        throw new Error("fixture order unexpectedly has a missing index");
      }
      expect(current).toBeGreaterThan(previous);
    }

    // uv has no stub on this fixture PATH -> silently absent, exactly like every other missing tool
    expect(lines.some((l) => l.includes("uv cache"))).toBe(false);
  });

  test("--dry-run with no tools on PATH: only before/after/banner, nothing else", () => {
    const { out, code } = runScript(["--dry-run", "--home", fixtureHome], {
      pathDirs: [stubNone],
    });
    expect(code).toBe(0);
    const lines = out.trimEnd().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^before: /);
    expect(lines[1]).toMatch(/^after: {2}/);
    expect(lines[2]).toBe(
      "✅ cache:clean done. Project build artifacts (node_modules/target/…) → mise run cache:projects",
    );
  });

  // Parity, not a new feature: the original shell body never validates $HOME either — a bare
  // "$HOME" that resolves empty is passed straight through to `df -h "$HOME"` and still reaches
  // the final echo with exit 0. A hard-fail here would be an unauthorized new behavior with no
  // shell analogue (see cache-clean.ts's resolveHome doc comment).
  test("no --home and no HOME env resolvable -> degrades gracefully, still completes with exit 0", () => {
    const { out, err, code } = runScript([], { pathDirs: [stubNone] });
    expect(code).toBe(0);
    expect(err).not.toContain("FATAL");
    const lines = out.trimEnd().split("\n");
    expect(lines[0]).toMatch(/^before: /);
    expect(lines[1]).toMatch(/^after: {2}/);
    expect(lines[2]).toBe(
      "✅ cache:clean done. Project build artifacts (node_modules/target/…) → mise run cache:projects",
    );
  });

  test("real run (no --dry-run) against fixture stubs: prints '• label' lines and swallows a failing tool", () => {
    const stubDir = mkdtempSync(join(tmpdir(), "cache-clean-stubs-real-"));
    try {
      makeStub(stubDir, "brew", 0);
      makeStub(stubDir, "npm", 1); // fake npm FAILS -- must not abort the rest of the pass
      const { out, code } = runScript(["--home", fixtureHome], {
        pathDirs: [stubDir],
      });
      expect(code).toBe(0); // `|| true` semantics preserved: one tool's failure != script failure
      expect(out).toContain("• brew cleanup --prune=all");
      expect(out).toContain("• npm cache clean");
      expect(out).toContain(
        "✅ cache:clean done. Project build artifacts (node_modules/target/…) → mise run cache:projects",
      );
    } finally {
      rmSync(stubDir, { recursive: true, force: true });
    }
  });

  // MAJOR regression guard: runBunStep's mkdtempSync/writeFileSync setup must never escape
  // uncaught — a full disk (ENOSPC) is exactly the condition cache:clean exists for, and the
  // original shell's `mktemp -d ... || true` tolerates it and keeps going. We can't fill a real
  // disk in a test, so TMPDIR is pointed at a path that does not exist: mkdtempSync throws
  // ENOENT at the same call site, which is a faithful stand-in for "tempdir creation fails".
  test("bun tempdir setup failure (simulated via an unresolvable TMPDIR) does not abort the rest of the pass", () => {
    const stubDir = mkdtempSync(join(tmpdir(), "cache-clean-stubs-bunfail-"));
    const badTmpdir = join(
      tmpdir(),
      `cache-clean-does-not-exist-${Date.now()}`,
    );
    try {
      makeStub(stubDir, "bun", 0);
      makeStub(stubDir, "npm", 0); // proves steps AFTER the failing bun step still run
      const { out, err, code } = runScript(["--home", fixtureHome], {
        pathDirs: [stubDir],
        env: { TMPDIR: badTmpdir },
      });
      expect(code).toBe(0); // never escapes to the outer FATAL/exit-1 handler
      expect(err).not.toContain("FATAL");
      expect(out).toContain("• bun pm cache rm"); // header line still prints (mirrors the shell's unconditional echo)
      expect(out).toContain("• npm cache clean"); // the rest of the pass still ran
      expect(out).toContain(
        "✅ cache:clean done. Project build artifacts (node_modules/target/…) → mise run cache:projects",
      );
    } finally {
      rmSync(stubDir, { recursive: true, force: true });
      // badTmpdir was never created — nothing to clean up
    }
  });

  test("cargo present without rip: guard requires BOTH, no cargo line at all", () => {
    const stubDir = mkdtempSync(
      join(tmpdir(), "cache-clean-stubs-cargo-only-"),
    );
    try {
      makeStub(stubDir, "cargo", 0);
      const { out, code } = runScript(["--dry-run", "--home", fixtureHome], {
        pathDirs: [stubDir],
      });
      expect(code).toBe(0);
      expect(out).not.toContain("rip");
    } finally {
      rmSync(stubDir, { recursive: true, force: true });
    }
  });

  test("rejects --__proto__ before running any cleanup step", () => {
    const { out, err, code } = runScript(["--__proto__"], {
      pathDirs: [stubAll],
    });
    expect(code).toBe(2);
    expect(err).toContain("Unknown option '--__proto__'");
    expect(out).not.toContain("before:");
  });

  test("lets Cleye strictFlags reject an ordinary unknown before cleanup", () => {
    const { out, err, code } = runScript(["--wat"], {
      pathDirs: [stubAll],
    });
    expect(code).toBe(1);
    expect(err).toContain("Error: Unknown flag: --wat.");
    expect(out).not.toContain("before:");
  });

  test("rejects an empty String flag before running any cleanup step", () => {
    for (const args of [["--home"], ["--home", ""]]) {
      const { out, err, code } = runScript(args, { pathDirs: [stubAll] });
      expect(code).toBe(2);
      expect(err).toContain("--home requires a value");
      expect(out).not.toContain("before:");
    }
  });
});
