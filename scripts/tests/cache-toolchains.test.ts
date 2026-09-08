// bun test for scripts/cache-toolchains.ts — the bun port of mise task `cache:toolchains`.
//
// Two layers, same shape as cache-clean.test.ts:
//  1. Unit tests against the exported pure/injectable helpers — host-independent, no real
//     rustup toolchain or vscode-server directory is ever touched.
//  2. CLI-level tests that spawn the REAL script as a subprocess with a fully-replaced PATH
//     pointing at throwaway fixture stub binaries, and --home pointing at a throwaway fixture
//     directory — never the real $HOME, never real rustup/vscode-server state.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractChannel,
  isProcessRunning,
  parseRustupToolchainList,
  pinKeepsToolchain,
  resolveHome,
  rustupToolchainsToRemove,
  serverHash,
  serverVersionsToRemove,
  toolAvailable,
} from "../cache-toolchains";

const SCRIPT = new URL("../cache-toolchains.ts", import.meta.url).pathname;

// Same trick as cache-clean.test.ts: mise ships a `bun` shim ahead of the real bun on PATH, and
// Bun.spawnSync's `env` REPLACES rather than merges, so a restricted-PATH subprocess needs the
// real bun's absolute path.
function resolveRealBun(): string {
  for (const dir of (process.env.PATH ?? "").split(":").filter(Boolean)) {
    const candidate = join(dir, "bun");
    if (!existsSync(candidate)) continue;
    if (!realpathSync(candidate).includes("mise")) return candidate;
  }
  throw new Error("no non-mise-shim `bun` found on PATH for the test harness");
}
const REAL_BUN = resolveRealBun();

function makeStub(
  dir: string,
  name: string,
  script = "#!/bin/sh\nexit 0\n",
): void {
  const path = join(dir, name);
  writeFileSync(path, script);
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
  const env: Record<string, string> = { PATH: pathDirs.join(":"), ...opts.env };
  if (opts.home !== undefined) env.HOME = opts.home;
  // bounded: fixture runs only touch throwaway dirs with no-op fake binaries; nothing here hangs
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

// ---- unit: parseRustupToolchainList ----------------------------------------------------------

describe("parseRustupToolchainList", () => {
  test("marks the default/active toolchain, leaves the rest non-default", () => {
    const out = parseRustupToolchainList(
      "stable-x86_64-unknown-linux-gnu (active, default)\n" +
        "nightly-x86_64-unknown-linux-gnu\n" +
        "1.84.1-sbpf-solana-v1.51\n",
    );
    expect(out).toEqual([
      { name: "stable-x86_64-unknown-linux-gnu", isDefault: true },
      { name: "nightly-x86_64-unknown-linux-gnu", isDefault: false },
      { name: "1.84.1-sbpf-solana-v1.51", isDefault: false },
    ]);
  });

  test("bare '(default)' with no 'active' also counts", () => {
    const out = parseRustupToolchainList("stable-x86_64 (default)\n");
    expect(out).toEqual([{ name: "stable-x86_64", isDefault: true }]);
  });

  test("blank lines are dropped", () => {
    expect(parseRustupToolchainList("\n\n")).toEqual([]);
  });
});

// ---- unit: pinKeepsToolchain ------------------------------------------------------------------

describe("pinKeepsToolchain", () => {
  test("exact match", () => {
    expect(
      pinKeepsToolchain("1.84.1-sbpf-solana-v1.51", "1.84.1-sbpf-solana-v1.51"),
    ).toBe(true);
  });

  test("generic channel pin ('nightly') matches a platform-suffixed install", () => {
    expect(
      pinKeepsToolchain("nightly-x86_64-unknown-linux-gnu", "nightly"),
    ).toBe(true);
  });

  test("unrelated names do not match", () => {
    expect(
      pinKeepsToolchain("stable-x86_64-unknown-linux-gnu", "nightly"),
    ).toBe(false);
  });
});

// ---- unit: extractChannel ---------------------------------------------------------------------

describe("extractChannel", () => {
  test('TOML form: channel = "1.84.1"', () => {
    expect(extractChannel('[toolchain]\nchannel = "1.84.1"\n')).toBe("1.84.1");
  });

  test("TOML form without quotes", () => {
    expect(extractChannel("channel = nightly\n")).toBe("nightly");
  });

  test("legacy bare single-line form (no 'channel' key at all)", () => {
    expect(extractChannel("1.84.1\n")).toBe("1.84.1");
  });

  test("empty file -> undefined", () => {
    expect(extractChannel("")).toBeUndefined();
  });
});

// ---- unit: rustupToolchainsToRemove -------------------------------------------------------------

describe("rustupToolchainsToRemove", () => {
  const toolchains = [
    { name: "stable-x86_64-unknown-linux-gnu", isDefault: true },
    { name: "nightly-x86_64-unknown-linux-gnu", isDefault: false },
    { name: "1.84.1-sbpf-solana-v1.51", isDefault: false },
    { name: "1.97.1-x86_64-unknown-linux-gnu", isDefault: false },
  ];

  test("never removes the default, even with zero pins", () => {
    expect(rustupToolchainsToRemove(toolchains, [])).not.toContain(
      "stable-x86_64-unknown-linux-gnu",
    );
  });

  test("a pin keeps its matching toolchain out of the removal list", () => {
    const removed = rustupToolchainsToRemove(toolchains, [
      "1.84.1-sbpf-solana-v1.51",
    ]);
    expect(removed).not.toContain("1.84.1-sbpf-solana-v1.51");
    expect(removed).toContain("nightly-x86_64-unknown-linux-gnu");
    expect(removed).toContain("1.97.1-x86_64-unknown-linux-gnu");
  });

  test("zero pins -> every non-default toolchain is a removal candidate", () => {
    expect(rustupToolchainsToRemove(toolchains, [])).toEqual([
      "nightly-x86_64-unknown-linux-gnu",
      "1.84.1-sbpf-solana-v1.51",
      "1.97.1-x86_64-unknown-linux-gnu",
    ]);
  });
});

// ---- unit: serverHash -------------------------------------------------------------------------

describe("serverHash", () => {
  test("strips the Stable- prefix", () => {
    expect(serverHash("Stable-abc123")).toBe("abc123");
  });

  test("strips a trailing .staging suffix too", () => {
    expect(serverHash("Stable-abc123.staging")).toBe("abc123");
  });
});

// ---- unit: serverVersionsToRemove ---------------------------------------------------------------

describe("serverVersionsToRemove", () => {
  const now = 1_000_000;
  const day = 86400;

  test("never removes the single most-recently-modified version", () => {
    const versions = [{ name: "only", hash: "h1", mtimeSec: now - 100 * day }];
    const removed = serverVersionsToRemove(versions, {
      isBusy: () => false,
      nowSec: now,
      keepDays: 2,
    });
    expect(removed).toEqual([]);
  });

  test("removes an old, idle, non-newest version", () => {
    const versions = [
      { name: "newest", hash: "h1", mtimeSec: now - 1 * day },
      { name: "old", hash: "h2", mtimeSec: now - 100 * day },
    ];
    const removed = serverVersionsToRemove(versions, {
      isBusy: () => false,
      nowSec: now,
      keepDays: 2,
    });
    expect(removed).toEqual(["old"]);
  });

  test("keeps an old version if it's still within KEEP_DAYS", () => {
    const versions = [
      { name: "newest", hash: "h1", mtimeSec: now },
      { name: "recent", hash: "h2", mtimeSec: now - 1 * day },
    ];
    const removed = serverVersionsToRemove(versions, {
      isBusy: () => false,
      nowSec: now,
      keepDays: 2,
    });
    expect(removed).toEqual([]);
  });

  test("keeps an old, non-newest version if a process is using its hash", () => {
    const versions = [
      { name: "newest", hash: "h1", mtimeSec: now },
      { name: "old-but-busy", hash: "h2", mtimeSec: now - 100 * day },
    ];
    const removed = serverVersionsToRemove(versions, {
      isBusy: (hash) => hash === "h2",
      nowSec: now,
      keepDays: 2,
    });
    expect(removed).toEqual([]);
  });

  test("empty input -> empty output", () => {
    expect(
      serverVersionsToRemove([], {
        isBusy: () => false,
        nowSec: now,
        keepDays: 2,
      }),
    ).toEqual([]);
  });
});

// ---- unit: isProcessRunning ---------------------------------------------------------------------

describe("isProcessRunning", () => {
  test("pgrep exit 0 => running", () => {
    const fakeSpawn = (() => ({
      exitCode: 0,
    })) as unknown as typeof Bun.spawnSync;
    expect(isProcessRunning("abc123", fakeSpawn)).toBe(true);
  });

  test("pgrep nonzero exit => not running", () => {
    const fakeSpawn = (() => ({
      exitCode: 1,
    })) as unknown as typeof Bun.spawnSync;
    expect(isProcessRunning("abc123", fakeSpawn)).toBe(false);
  });

  test("pgrep missing => treated as RUNNING (conservative: keep on missing evidence)", () => {
    const fakeSpawn = (() => {
      throw new Error("ENOENT");
    }) as unknown as typeof Bun.spawnSync;
    expect(isProcessRunning("abc123", fakeSpawn)).toBe(true);
  });
});

// ---- unit: resolveHome / toolAvailable -----------------------------------------------------------

describe("resolveHome", () => {
  test("an explicit arg wins", () => {
    expect(resolveHome("/explicit/home")).toBe("/explicit/home");
  });

  test("falls back to process.env.HOME", () => {
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

describe("toolAvailable", () => {
  test("true for a binary certainly on PATH (sh)", () => {
    expect(toolAvailable("sh")).toBe(true);
  });

  test("false for a name that is not a real binary", () => {
    expect(toolAvailable("definitely-not-a-real-tool-xyz123")).toBe(false);
  });
});

// ---- CLI integration: the whole script as a subprocess -------------------------------------------

describe("cache-toolchains.ts CLI", () => {
  let fixtureHome: string;

  beforeAll(() => {
    fixtureHome = mkdtempSync(join(tmpdir(), "cache-toolchains-home-"));
  });

  afterAll(() => {
    rmSync(fixtureHome, { recursive: true, force: true });
  });

  test("neither rustup nor a .vscode-server dir present -> both sections report skip, exit 0", () => {
    const emptyStubs = mkdtempSync(
      join(tmpdir(), "cache-toolchains-stubs-none-"),
    );
    try {
      const { out, code } = runScript(["--dry-run", "--home", fixtureHome], {
        pathDirs: [emptyStubs],
      });
      expect(code).toBe(0);
      expect(out).toContain("== rustup toolchains ==");
      expect(out).toContain("rustup 不在");
      expect(out).toContain("== vscode-server versions ==");
      expect(out).toContain("無し — skip");
      expect(out).toContain("✅ cache:toolchains done.");
    } finally {
      rmSync(emptyStubs, { recursive: true, force: true });
    }
  });

  test("rustup present but fd absent -> rustup section refuses to guess, does nothing", () => {
    const stubs = mkdtempSync(
      join(tmpdir(), "cache-toolchains-stubs-rustup-only-"),
    );
    try {
      makeStub(
        stubs,
        "rustup",
        '#!/bin/sh\necho "stable-x86_64-unknown-linux-gnu (active, default)"\necho "nightly-x86_64-unknown-linux-gnu"\n',
      );
      const { out, code } = runScript(["--dry-run", "--home", fixtureHome], {
        pathDirs: [stubs],
      });
      expect(code).toBe(0);
      expect(out).toContain("fd 不在");
      expect(out).not.toContain("uninstall");
    } finally {
      rmSync(stubs, { recursive: true, force: true });
    }
  });

  test("vscode-server: dry-run removes the old idle version, keeps the newest", () => {
    const home = mkdtempSync(join(tmpdir(), "cache-toolchains-home-vsc-"));
    const serversDir = join(home, ".vscode-server", "cli", "servers");
    mkdirSync(serversDir, { recursive: true });
    const oldDir = join(serversDir, "Stable-oldhash");
    const newDir = join(serversDir, "Stable-newhash");
    mkdirSync(oldDir);
    mkdirSync(newDir);
    const longAgo = new Date(Date.now() - 100 * 86400 * 1000);
    utimesSync(oldDir, longAgo, longAgo);
    try {
      const emptyStubs = mkdtempSync(
        join(tmpdir(), "cache-toolchains-stubs-vsc-"),
      );
      try {
        const { out, code } = runScript(["--dry-run", "--home", home], {
          pathDirs: [emptyStubs],
        });
        expect(code).toBe(0);
        expect(out).toContain(`[dry-run] would run: rip ${oldDir}`);
        expect(out).not.toContain(newDir);
      } finally {
        rmSync(emptyStubs, { recursive: true, force: true });
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("rejects --__proto__ before running any section", () => {
    const { out, err, code } = runScript(["--__proto__"], {
      home: fixtureHome,
    });
    expect(code).toBe(2);
    expect(err).toContain("Unknown option '--__proto__'");
    expect(out).not.toContain("==");
  });

  test("lets Cleye strictFlags reject an ordinary unknown flag", () => {
    const { out, err, code } = runScript(["--wat"], { home: fixtureHome });
    expect(code).toBe(1);
    expect(err).toContain("Error: Unknown flag: --wat.");
    expect(out).not.toContain("==");
  });

  test("rejects an empty --home value", () => {
    const { err, code } = runScript(["--home", ""]);
    expect(code).toBe(2);
    expect(err).toContain("--home requires a value");
  });
});
