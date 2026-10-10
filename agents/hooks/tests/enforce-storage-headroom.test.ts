import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  existsSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attempt } from "../attempt.ts";
import {
  cachedCheckoutSizeBytes,
  checkoutCachePath,
  fullCheckoutReason,
  type CheckoutPolicyDeps,
  writeCheckoutCache,
} from "../enforce-storage-headroom.ts";
import { z } from "../zod.ts";
import { decisionOf, runHook } from "./helpers.ts";
import { decoded } from "./decode.ts";

// The host-drive cases measure the WSL host drive itself (/mnt/c): declared, so elsewhere SKIPs.
const NO_WSL_HOST_DRIVE = !existsSync("/mnt/c");

const HOOK = "enforce-storage-headroom.ts";

// A fixture workspace with a sparse-free, real 2 MiB target/ file, so `du` measures it.
function workspace(): { root: string; home: string } {
  const root = mkdtempSync(join(tmpdir(), "cargo-ws-"));
  writeFileSync(
    join(root, "Cargo.toml"),
    '[workspace]\nmembers = ["crates/a"]\n',
  );
  mkdirSync(join(root, "crates", "a"), { recursive: true });
  writeFileSync(
    join(root, "crates", "a", "Cargo.toml"),
    '[package]\nname = "a"\n',
  );
  mkdirSync(join(root, "target", "debug", "incremental"), {
    recursive: true,
  });
  writeFileSync(
    join(root, "target", "debug", "incremental", "blob"),
    Buffer.alloc(2 * 1024 * 1024, 1),
  );
  return { root, home: mkdtempSync(join(tmpdir(), "cargo-home-")) };
}

const bash = (command: string) => ({
  tool_name: "Bash",
  tool_input: { command },
  cwd: "/home/fuyu/dotfiles",
});

const GiB = 1024 ** 3;
function cachedSpace(
  home: string,
  path: string,
  free: number,
  total: number,
): void {
  const dir = join(home, ".cache", "claude-hooks", "storage-headroom");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${createHash("sha1").update(path).digest("hex")}.statfs.json`),
    JSON.stringify({
      free,
      total,
      at: Temporal.Now.instant().epochMilliseconds,
    }),
  );
}

function cachedReclaimPlan(home: string): void {
  const dir = join(home, ".cache", "claude-hooks", "storage-headroom");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "reclaim-plan.json"),
    JSON.stringify({
      generated_at: Temporal.Now.instant().epochMilliseconds,
      candidates: [
        { name: "finished-cache", bytes: 2 * GiB },
        { name: "stale-target", bytes: GiB },
      ],
    }),
  );
}

function cachedConfig(edit: (c: Doc) => void, free: number, total: number) {
  const home = mkdtempSync(join(tmpdir(), "storage-cache-home-"));
  cachedSpace(home, "/mnt/c", free, total);
  cachedSpace(home, "/", free, total);
  return { env: { ...config(edit), HOME: home }, home };
}

// Fixtures are CONFIG files, not env overrides: each preset is the real storage-headroom.toml
// with a few numbers changed, written to a temp file the hook reads via STORAGE_HEADROOM_CONFIG.
// A threshold no real drive can satisfy makes the gate go red deterministically; a zero
// threshold makes it green. The hook reads real statfs numbers either way.
const REAL = join(import.meta.dir, "..", "storage-headroom.toml");

// The shape of storage-headroom.toml as the fixtures edit it. Declared here and parsed with zod, so
// the real file is checked on read; a Row is loose on purpose, because the invalid-config tests
// write a wrong type ("thirty") and an unknown key ("comand") into it.
const Scalar = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);
type Scalar = z.infer<typeof Scalar>;
const Row = z.record(z.string(), Scalar);
type Row = z.infer<typeof Row>;
const Doc = z.object({
  schema: z.number(),
  sparse_required_above_mb: z.number(),
  drive: z.record(z.string(), Row),
  deny: Row,
  launcher: z.array(Row),
  budget: z.array(Row),
  measure: Row,
});
type Doc = z.infer<typeof Doc>;

function scalar(v: Scalar): string {
  if (Array.isArray(v))
    return `[${v.map((s) => JSON.stringify(s)).join(", ")}]`;
  if (typeof v === "string") return JSON.stringify(v);
  return String(v);
}

const body = (row: Row): string[] =>
  Object.entries(row).map(([k, v]) => `${k} = ${scalar(v)}`);

// A minimal TOML writer for this schema (Bun parses TOML but does not emit it).
function toToml(doc: Doc): string {
  const out = [
    `schema = ${doc.schema}`,
    `sparse_required_above_mb = ${doc.sparse_required_above_mb}`,
  ];
  for (const [sub, t] of Object.entries(doc.drive))
    out.push(`[drive.${sub}]`, ...body(t));
  out.push("[deny]", ...body(doc.deny));
  for (const item of doc.launcher) out.push("[[launcher]]", ...body(item));
  for (const item of doc.budget) out.push("[[budget]]", ...body(item));
  out.push("[measure]", ...body(doc.measure));
  return `${out.join("\n")}\n`;
}

const driveRow = (c: Doc, name: string): Row =>
  c.drive[name] ?? (expect(c.drive[name]).toBeDefined(), {});
const firstBudget = (c: Doc): Row =>
  c.budget[0] ?? (expect(c.budget[0]).toBeDefined(), {});

function config(edit: (c: Doc) => void): Record<string, string> {
  const c = decoded(Doc, Bun.TOML.parse(readFileSync(REAL, "utf8")));
  edit(c);
  const path = join(
    mkdtempSync(join(tmpdir(), "storage-cfg-")),
    "storage-headroom.toml",
  );
  writeFileSync(path, toToml(c));
  return { STORAGE_HEADROOM_CONFIG: path };
}

function fakeCheckoutProbe(output: string): {
  root: string;
  env: Record<string, string>;
} {
  const root = mkdtempSync(join(tmpdir(), "jj-checkout-"));
  mkdirSync(join(root, ".jj"));
  const home = mkdtempSync(join(tmpdir(), "jj-checkout-home-"));
  const bin = join(home, "bin");
  mkdirSync(bin);
  const calls = join(home, "du-calls");
  const du = join(bin, "du");
  writeFileSync(du, `#!/bin/sh\nprintf x >> '${calls}'\n${output}\n`);
  chmodSync(du, 0o755);
  return {
    root,
    env: {
      ...config((c) => {
        c.sparse_required_above_mb = 500;
      }),
      HOME: home,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      DU_CALLS: calls,
    },
  };
}

function workspaceAdd(root: string, command = "jj workspace add ../worker") {
  return { ...bash(command), cwd: root };
}
// A line is min(GiB, pct% of the drive): to force a line at a size, the share must not undercut it,
// so a non-zero size gets 100% and a zero size 0%.
const pct = (gibLine: number): number => (gibLine > 0 ? 100 : 0);
const drives = (host: number, guest: number, hostWarn: number) => (c: Doc) => {
  driveRow(c, "host").deny_gib = host;
  driveRow(c, "host").deny_pct = pct(host);
  driveRow(c, "host").stop_gib = host > 0 ? host / 2 : 0;
  driveRow(c, "guest").deny_gib = guest;
  driveRow(c, "guest").deny_pct = pct(guest);
  driveRow(c, "host").warn_gib = hostWarn;
  driveRow(c, "host").warn_pct = pct(hostWarn);
};
const FULL = config(drives(1_000_000, 1_000_000, 60));
const EMPTY = config(drives(0, 0, 0));
const WARN_ONLY = config(drives(0, 0, 1_000_000));

// The 2026-10-05 rented box: an absolute size meant for a 1 TB disk, a small share of this one.
const SMALL_SHARE = config((c) => {
  driveRow(c, "host").deny_gib = 1_000_000;
  driveRow(c, "host").deny_pct = 0;
  driveRow(c, "guest").deny_gib = 1_000_000;
  driveRow(c, "guest").deny_pct = 0;
});

describe("enforce-storage-headroom", () => {
  test("positive rate durations are accepted without changing gate decisions", () => {
    for (const freeGib of [5, 15, 30]) {
      const fixture = (durations: boolean) =>
        cachedConfig(
          (c) => {
            drives(10, 10, 20)(c);
            for (const row of Object.values(c.drive)) {
              delete row.rate_red_minutes;
              delete row.rate_yellow_minutes;
              if (durations) {
                row.rate_red_minutes = 0.001;
                row.rate_yellow_minutes = 100_000;
              }
            }
          },
          freeGib * GiB,
          100 * GiB,
        ).env;
      const baseline = runHook(HOOK, bash("cp x y"), fixture(false));
      const withRate = runHook(HOOK, bash("cp x y"), fixture(true));
      expect(withRate.code).toBe(baseline.code);
      expect(withRate.stdout).toBe(baseline.stdout);
      expect(withRate.stderr).toBe(baseline.stderr);
    }
  });

  test.each([0, -1, "thirty"])(
    "rate durations reject non-positive or non-numeric value %s",
    (value) => {
      const r = runHook(
        HOOK,
        bash("cp x y"),
        config((c) => {
          driveRow(c, "host").rate_red_minutes = value;
          driveRow(c, "guest").rate_yellow_minutes = value;
        }),
      );
      const reason = decisionOf(r.stdout)?.permissionDecisionReason ?? "";
      expect(reason).toContain(
        "drive.host.rate_red_minutes: expected a positive duration",
      );
      expect(reason).toContain(
        "drive.guest.rate_yellow_minutes: expected a positive duration",
      );
    },
  );

  test("a line is the smaller of its size and its share: a huge size with a 0% share does not deny", () => {
    const r = runHook(HOOK, bash("cargo build"), SMALL_SHARE);
    expect(r.code).toBe(0);
    expect(decisionOf(r.stdout)?.permissionDecision).not.toBe("deny");
  });

  test("the deny reason names the measured value and deny line", () => {
    const r = runHook(HOOK, bash("cargo build"), FULL);
    expect(decisionOf(r.stdout)?.permissionDecisionReason).toContain(
      "deny line",
    );
  });

  test("warn_pct without warn_gib, and a share over 100, are config errors", () => {
    const r = runHook(
      HOOK,
      bash("cp x y"),
      config((c) => {
        delete driveRow(c, "host").warn_gib;
        driveRow(c, "guest").deny_pct = 150;
      }),
    );
    const reason = decisionOf(r.stdout)?.permissionDecisionReason ?? "";
    expect(reason).toContain("drive.host: warn_gib and warn_pct go together");
    expect(reason).toContain(
      "drive.guest.deny_pct: a percentage of the drive must be within 0..100",
    );
  });

  test("denies launchers when headroom is gone, with measured numbers", () => {
    for (const command of [
      "systemd-run --user --unit=probe julia probe.jl",
      "agent-resource-run --manifest m.json",
      "cd ~/Workspace/polysearch-rs && cargo build --release",
      "cargo test -p core",
      "julia --project=. scripts/run.jl",
      "polysearch run --config x.toml",
      "time nice julia probe.jl",
      "FOO=1 env BAR=2 cargo bench",
      "mise run test",
      "mise run lint",
      "mise run check",
      "m t",
      "m l",
    ]) {
      const r = runHook(HOOK, bash(command), FULL);
      expect(r.code).toBe(0);
      const d = decisionOf(r.stdout);
      expect(d?.permissionDecision).toBe("deny");
      expect(d?.permissionDecisionReason).toContain(
        "free space: disk-reclaim run --tier blind --yes",
      );
      expect(d?.permissionDecisionReason).toMatch(
        /free (?:\d+ bytes \(\d+\.\d GiB\)|unmeasured)/u,
      );
    }
  });

  test("host AND guest short come back in ONE deny naming both", () => {
    const d = decisionOf(runHook(HOOK, bash("cargo build"), FULL).stdout);
    expect(d?.permissionDecision).toBe("deny");
    expect(d?.permissionDecisionReason).toContain("host C:");
    expect(d?.permissionDecisionReason).toContain("guest /");
  });

  test.skipIf(NO_WSL_HOST_DRIVE)(
    "an unreadable Windows drive denies compute on WSL",
    () => {
      const cfg = config((c) => {
        drives(0, 0, 0)(c);
        driveRow(c, "host").path = "/missing-wsl-host-drive";
      });
      const d = decisionOf(runHook(HOOK, bash("cargo build"), cfg).stdout);
      expect(d?.permissionDecision).toBe("deny");
      expect(d?.permissionDecisionReason).toContain("could not be measured");
    },
  );

  test("allows only the cleanup and read-only allowlist when full", () => {
    for (const command of [
      "df -h / /mnt/c",
      "du -sh ~/.julia/compiled",
      "dust -d 2 /",
      "mise run reclaim",
      "m reclaim:builds",
      "disk-reclaim",
      "disk-reclaim plan --tier owner",
      "disk-reclaim run --tier blind --yes",
      "disk-reclaim delete /tmp/approved --yes",
      "storage-headroom",
      "storage-headroom --json",
      "ls -la",
      "jj workspace forget x",
      "jj abandon x",
      "jj st",
      "jj log",
      "jj workspace list",
      "rr text 'storage-headroom'",
    ]) {
      const r = runHook(HOOK, bash(command), FULL);
      expect(r.code).toBe(0);
      expect(decisionOf(r.stdout)).toBeNull();
    }
  });

  test("allows cargo clean only when cwd or manifest directory has Cargo.toml", () => {
    const { root } = workspace();
    const outside = mkdtempSync(join(tmpdir(), "not-cargo-"));
    const { env } = cachedConfig(
      (c) => {
        drives(10, 10, 20)(c);
      },
      5 * GiB,
      100 * GiB,
    );
    for (const command of [
      "cargo clean",
      "cargo clean -p a",
      "cargo clean --package a",
      `cargo clean --manifest-path ${join(root, "crates", "a", "Cargo.toml")}`,
    ]) {
      const cwd = command.includes("--manifest-path") ? outside : root;
      expect(
        decisionOf(runHook(HOOK, { ...bash(command), cwd }, env).stdout),
      ).toBeNull();
    }
    for (const command of [
      "cargo clean",
      "cargo clean -p a",
      "cargo clean --manifest-path missing/Cargo.toml",
      "cargo clean --target-dir /tmp/target",
    ]) {
      const d = decisionOf(
        runHook(HOOK, { ...bash(command), cwd: outside }, env).stdout,
      );
      expect(d?.permissionDecision).toBe("deny");
    }
  });

  test("allows named agx commands below the deny line", () => {
    const { env } = cachedConfig(
      (c) => {
        drives(10, 10, 20)(c);
      },
      5 * GiB,
      100 * GiB,
    );
    for (const subcommand of ["run", "resume", "grade", "ack", "stats"]) {
      expect(
        decisionOf(runHook(HOOK, bash(`agx ${subcommand}`), env).stdout),
      ).toBeNull();
    }
    expect(
      decisionOf(runHook(HOOK, bash("agx pick ask"), env).stdout)
        ?.permissionDecision,
    ).toBe("deny");
    expect(
      decisionOf(runHook(HOOK, bash("agx ledger stats && cp x y"), env).stdout)
        ?.permissionDecision,
    ).toBe("deny");
  });

  test("jj workspace add help is allowed", () => {
    const { root, env } = fakeCheckoutProbe("printf '600000\\t.\\n'");
    const { env: lowDisk } = cachedConfig(
      (c) => {
        drives(10, 10, 20)(c);
      },
      5 * GiB,
      100 * GiB,
    );
    const merged = { ...env, ...lowDisk };
    for (const flag of ["--help", "-h"]) {
      expect(
        decisionOf(
          runHook(HOOK, workspaceAdd(root, `jj workspace add ${flag}`), merged)
            .stdout,
        ),
      ).toBeNull();
    }
  });

  test("writer and reader use the same per-repo cache key", async () => {
    const { root } = fakeCheckoutProbe("");
    const home = mkdtempSync(join(tmpdir(), "checkout-cache-home-"));
    const at = 1_800_000_000_000;
    writeCheckoutCache(root, { trackedFileCount: 37, at }, home);
    expect(existsSync(checkoutCachePath(root, home))).toBe(true);
    expect(await cachedCheckoutSizeBytes(root, () => at + 1, home)).toEqual({
      trackedFileCount: 37,
      at,
    });
  });

  test("small full checkout add is allowed on its first call and the second call hits cache", async () => {
    const { root } = fakeCheckoutProbe("");
    const home = mkdtempSync(join(tmpdir(), "checkout-cache-home-"));
    const now = 1_800_000_000_000;
    let countProbes = 0;
    let sizeProbes = 0;
    const deps: CheckoutPolicyDeps = {
      now: () => now,
      cachedSize: (repo, clock) => cachedCheckoutSizeBytes(repo, clock, home),
      saveCache: (repo, entry) => {
        writeCheckoutCache(repo, entry, home);
      },
      probeSize: () => {
        sizeProbes++;
        return { bytes: null, elapsedMs: 5_001 };
      },
      trackedFileCount: (_root, budgetMs) => {
        expect(budgetMs).toBe(2_000);
        countProbes++;
        return { count: 7, elapsedMs: 170 };
      },
    };
    expect(
      await fullCheckoutReason("jj workspace add ../worker", root, 500, deps),
    ).toBeNull();
    expect(
      await fullCheckoutReason("jj workspace add ../worker", root, 500, deps),
    ).toBeNull();
    expect(countProbes).toBe(1);
    expect(sizeProbes).toBe(0);
  });

  test("large full checkout add measures bytes and applies the configured threshold", async () => {
    const { root } = fakeCheckoutProbe("");
    const cached: { trackedFileCount?: number; bytes?: number; at: number }[] =
      [];
    const reason = await fullCheckoutReason(
      "jj workspace add ../worker",
      root,
      500,
      {
        now: () => 1_800_000_000_000,
        cachedSize: () => Promise.resolve(cached.at(-1) ?? null),
        saveCache: (_root, entry) => {
          cached.push(entry);
        },
        probeSize: (_root, budgetMs) => {
          expect(budgetMs).toBe(5_000);
          return { bytes: 600_000 * 1024, elapsedMs: 300 };
        },
        trackedFileCount: (_root, budgetMs) => {
          expect(budgetMs).toBe(2_000);
          return { count: 10_001, elapsedMs: 200 };
        },
      },
    );
    expect(reason).toContain("this repo is 614.4 MB (> 500 MB threshold)");
    expect(reason).toContain("jj workspace add --sparse-patterns empty <dir>");
    expect(cached.at(-1)).toEqual({
      trackedFileCount: 10_001,
      bytes: 600_000 * 1024,
      at: 1_800_000_000_000,
    });
  });

  test("when both bounded probes time out, denial names both probes", async () => {
    const { root } = fakeCheckoutProbe("");
    const reason = await fullCheckoutReason(
      "jj workspace add ../worker",
      root,
      500,
      {
        now: () => 1_800_000_000_000,
        cachedSize: () => Promise.resolve(null),
        saveCache: () => {},
        probeSize: (_root, budgetMs) => {
          expect(budgetMs).toBe(5_000);
          return { bytes: null, elapsedMs: 5_001 };
        },
        trackedFileCount: (_root, budgetMs) => {
          expect(budgetMs).toBe(2_000);
          return { count: null, elapsedMs: 2_001 };
        },
      },
    );
    expect(reason).toContain("refusing a full-checkout jj workspace");
    expect(reason).toContain("tracked-file count (2 s)");
    expect(reason).toContain("checkout byte size (5 s)");
  });

  test("sparse jj workspace add follows the storage gate", () => {
    const { env } = cachedConfig(
      (c) => {
        drives(10, 10, 20)(c);
      },
      5 * GiB,
      100 * GiB,
    );
    const sparse = runHook(
      HOOK,
      bash("jj workspace add --sparse-patterns empty ../worker"),
      EMPTY,
    );
    expect(decisionOf(sparse.stdout)).toBeNull();

    const lowSparse = decisionOf(
      runHook(
        HOOK,
        bash("jj workspace add --sparse-patterns empty ../worker"),
        env,
      ).stdout,
    );
    expect(lowSparse?.permissionDecision).toBe("deny");
  });

  test("denies every non-allowlisted tool call under the deny line", () => {
    const { env } = cachedConfig(
      (c) => {
        drives(10, 10, 20)(c);
      },
      5 * GiB,
      100 * GiB,
    );
    for (const payload of [
      bash("cp -r source destination"),
      {
        tool_name: "Write",
        tool_input: { file_path: "/tmp/file", content: "x" },
      },
      bash("ls && cp x y"),
    ]) {
      const d = decisionOf(runHook(HOOK, payload, env).stdout);
      expect(d?.permissionDecision).toBe("deny");
      expect(d?.permissionDecisionReason?.split("\n")[0]).toBe(
        "[dotfiles:storage-headroom] free space: disk-reclaim run --tier blind --yes",
      );
      expect(d?.permissionDecisionReason).toContain(
        `deny line ${10 * GiB} bytes (10.0 GiB)`,
      );
      expect(d?.permissionDecisionReason).toContain("Allowlist:");
    }
    for (const command of [
      "disk-reclaim delete /tmp/approved --yes",
      "df -h",
      "jj workspace forget x",
    ]) {
      expect(decisionOf(runHook(HOOK, bash(command), env).stdout)).toBeNull();
    }
  });

  test("denial names the short disk, byte line, and cached reclaim sizes", () => {
    const { env, home } = cachedConfig(
      (c) => {
        drives(10, 10, 20)(c);
      },
      5 * GiB,
      100 * GiB,
    );
    cachedReclaimPlan(home);
    const d = decisionOf(runHook(HOOK, bash("cp x y"), env).stdout);
    expect(d?.permissionDecisionReason).toContain("host C: (WSL vhdx) free");
    expect(d?.permissionDecisionReason).toContain(`${5 * GiB} bytes (5.0 GiB)`);
    expect(d?.permissionDecisionReason).toContain(
      `${10 * GiB} bytes (10.0 GiB)`,
    );
    expect(d?.permissionDecisionReason).toContain(
      "finished-cache 2147483648 bytes (2.0 GiB)",
    );
    expect(d?.permissionDecisionReason).toContain(
      "disk-reclaim run --tier blind --yes",
    );
  });

  test("allows only small Write/Edit operations under the session scratchpad below deny", () => {
    const { env } = cachedConfig(
      (c) => {
        drives(10, 10, 20)(c);
      },
      5 * GiB,
      100 * GiB,
    );
    const scratchpad = `/tmp/claude-${process.getuid?.() ?? ""}/session/scratchpad`;
    for (const payload of [
      {
        tool_name: "Write",
        tool_input: { file_path: scratchpad, content: "small recovery brief" },
      },
      {
        tool_name: "Edit",
        tool_input: { file_path: scratchpad, new_string: "small replacement" },
      },
    ]) {
      const d = decisionOf(runHook(HOOK, payload, env).stdout);
      expect(d?.permissionDecision).toBe("allow");
      expect(d?.permissionDecisionReason).toContain("session scratchpad");
    }

    const large = decisionOf(
      runHook(
        HOOK,
        {
          tool_name: "Write",
          tool_input: {
            file_path: scratchpad,
            content: "x".repeat(64 * 1024 + 1),
          },
        },
        env,
      ).stdout,
    );
    expect(large?.permissionDecision).toBe("deny");

    const repoFile = decisionOf(
      runHook(
        HOOK,
        {
          tool_name: "Write",
          tool_input: {
            file_path: "/workspace/recovery.md",
            content: "small recovery brief",
          },
        },
        env,
      ).stdout,
    );
    expect(repoFile?.permissionDecision).toBe("deny");
  });

  test("calls above warn pass silently, and between the lines carry a reclaim warning", () => {
    const above = cachedConfig(
      (c) => {
        drives(10, 10, 20)(c);
      },
      30 * GiB,
      100 * GiB,
    );
    for (const payload of [
      bash("cp x y"),
      { tool_name: "Write", tool_input: {} },
      {
        tool_name: "Write",
        tool_input: {
          file_path: `/tmp/claude-${process.getuid?.() ?? ""}/session/scratchpad`,
          content: "small recovery brief",
        },
      },
    ]) {
      expect(decisionOf(runHook(HOOK, payload, above.env).stdout)).toBeNull();
    }
    const between = cachedConfig(
      (c) => {
        drives(10, 10, 20)(c);
      },
      15 * GiB,
      100 * GiB,
    );
    const d = decisionOf(runHook(HOOK, bash("cp x y"), between.env).stdout);
    expect(d?.permissionDecision).toBeUndefined();
    expect(d?.additionalContext).toContain("15.0 GiB");
    expect(d?.additionalContext).toContain("disk-reclaim plan");
    const launcher = decisionOf(
      runHook(HOOK, bash("cargo build"), between.env).stdout,
    );
    expect(launcher?.permissionDecision).toBe("deny");
  });

  test("uses a fresh statfs cache entry", () => {
    const { env } = cachedConfig(
      (c) => {
        drives(10, 10, 20)(c);
      },
      5 * GiB,
      100 * GiB,
    );
    const d = decisionOf(runHook(HOOK, bash("cp x y"), env).stdout);
    expect(d?.permissionDecision).toBe("deny");
    expect(d?.permissionDecisionReason).toContain("5.0 GiB");
  });

  test("the first deny advice line points to disk-reclaim", async () => {
    const parsed = await attempt(() =>
      Bun.TOML.parse(readFileSync(REAL, "utf8")),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const parsedConfig = decoded(
        z.object({ deny: z.object({ advice: z.string() }) }),
        parsed.value,
      );
      expect(parsedConfig.deny.advice.split("\n")[0]).toContain(
        "disk-reclaim run",
      );
    }
  });

  test("STORAGE_ASSERT_OVERRIDE does not bypass the universal deny line", () => {
    const r = runHook(
      HOOK,
      bash("STORAGE_ASSERT_OVERRIDE=1 cargo build"),
      FULL,
    );
    expect(decisionOf(r.stdout)?.permissionDecision).toBe("deny");
  });

  test("passes silently with headroom", () => {
    const r = runHook(HOOK, bash("cargo build"), EMPTY);
    expect(r.code).toBe(0);
    expect(decisionOf(r.stdout)).toBeNull();
    expect(r.stderr).not.toContain("storage-headroom");
  });

  test.skipIf(NO_WSL_HOST_DRIVE)(
    "warns non-launchers below the warn line and denies launchers",
    () => {
      const r = runHook(HOOK, bash("cp x y"), WARN_ONLY);
      const d = decisionOf(r.stdout);
      expect(d?.permissionDecision).toBeUndefined();
      expect(d?.additionalContext).toContain(
        "[dotfiles:storage-headroom] WARNING",
      );
      expect(
        decisionOf(runHook(HOOK, bash("julia probe.jl"), WARN_ONLY).stdout)
          ?.permissionDecision,
      ).toBe("deny");
    },
  );

  describe("cargo target budget", () => {
    const budget = (warn: number, hostWarn = 0) =>
      config((c) => {
        drives(0, 0, hostWarn)(c);
        firstBudget(c).warn_gib = warn;
        firstBudget(c).deny_gib = Math.max(warn + 1, 80);
      });
    const TINY = budget(0.001);
    const HUGE = budget(1000);

    test("over budget: warns with the workspace-root target and its incremental share", () => {
      const { root, home } = workspace();
      const r = runHook(
        HOOK,
        { ...bash("cargo build"), cwd: join(root, "crates", "a") },
        { ...TINY, HOME: home },
      );
      const d = decisionOf(r.stdout);
      expect(d?.permissionDecision).toBeUndefined();
      expect(d?.additionalContext).toContain(
        `cargo target ${join(root, "target")} is `,
      );
      expect(d?.additionalContext).toContain("incremental");
      expect(d?.additionalContext).toContain("CARGO_INCREMENTAL=0");
    });

    test("a full target denies direct Cargo and mise tasks, while cleanup stays available", () => {
      const { root, home } = workspace();
      const full = config((c) => {
        drives(0, 0, 0)(c);
        firstBudget(c).warn_gib = 0.0005;
        firstBudget(c).deny_gib = 0.001;
      });
      for (const command of ["cargo test", "mise run test", "m t"]) {
        const r = runHook(
          HOOK,
          { ...bash(command), cwd: root },
          { ...full, HOME: home },
        );
        const d = decisionOf(r.stdout);
        expect(d?.permissionDecision).toBe("deny");
        expect(d?.permissionDecisionReason).toContain(join(root, "target"));
        expect(d?.permissionDecisionReason).toContain("incremental");
      }
      for (const command of ["cargo clean", "mise run reclaim:builds"]) {
        const r = runHook(
          HOOK,
          { ...bash(command), cwd: root },
          { ...full, HOME: home },
        );
        expect(decisionOf(r.stdout)).toBeNull();
      }
    });

    test("an unsizeable target cannot bypass the build limit", () => {
      const { root, home } = workspace();
      const fakeBin = mkdtempSync(join(tmpdir(), "storage-fake-bin-"));
      writeFileSync(join(fakeBin, "du"), "#!/bin/sh\nexit 1\n", {
        mode: 0o755,
      });
      const r = runHook(
        HOOK,
        { ...bash("mise run test"), cwd: root },
        { ...EMPTY, HOME: home, PATH: fakeBin },
      );
      const d = decisionOf(r.stdout);
      expect(d?.permissionDecision).toBe("deny");
      expect(d?.permissionDecisionReason).toContain("could not be sized");
    });

    test("under budget: silent", () => {
      const { root, home } = workspace();
      const r = runHook(
        HOOK,
        { ...bash("cargo test"), cwd: root },
        { ...HUGE, HOME: home },
      );
      expect(r.stdout).toBe("");
    });

    test("follows a leading `cd` and CARGO_TARGET_DIR in the command text", () => {
      const { root, home } = workspace();
      const cd = runHook(
        HOOK,
        { ...bash(`cd ${root} && cargo build`), cwd: home },
        { ...TINY, HOME: home },
      );
      expect(decisionOf(cd.stdout)?.additionalContext).toContain(
        join(root, "target"),
      );
      const shared = join(root, "target");
      const env = runHook(
        HOOK,
        { ...bash(`CARGO_TARGET_DIR=${shared} cargo build`), cwd: home },
        { ...TINY, HOME: home },
      );
      expect(decisionOf(env.stdout)?.additionalContext).toContain(
        `cargo target ${shared} is `,
      );
    });

    test.skipIf(NO_WSL_HOST_DRIVE)(
      "the drive warning and the target warning arrive in ONE decision",
      () => {
        const { root, home } = workspace();
        const r = runHook(
          HOOK,
          { ...bash("cargo build"), cwd: root },
          { ...budget(0.001, 1_000_000), HOME: home },
        );
        const ctx = decisionOf(r.stdout)?.additionalContext ?? "";
        expect(ctx).toContain("[dotfiles:storage-headroom] WARNING host C:");
        expect(ctx).toContain("cargo target");
      },
    );
  });

  describe("config", () => {
    test("the committed storage-headroom.toml is valid", () => {
      const r = runHook(HOOK, bash("ls -la"), {});
      expect(r.code).toBe(0);
      expect(r.stdout).toBe("");
    });

    test("an invalid config denies non-allowlisted calls with EVERY error in one decision", () => {
      const bad = config((c) => {
        driveRow(c, "host").deny_gib = "thirty"; // wrong type
        (c.launcher[0] ?? (expect(c.launcher[0]).toBeDefined(), {})).comand =
          "typo"; // unknown key
      });
      const d = decisionOf(runHook(HOOK, bash("cp x y"), bad).stdout);
      expect(d?.permissionDecision).toBe("deny");
      expect(d?.permissionDecisionReason).toContain(
        "drive.host.deny_gib: expected a non-negative number",
      );
      expect(d?.permissionDecisionReason).toContain(
        "launcher[0]: unknown key 'comand'",
      );
      expect(d?.permissionDecisionReason).toContain("invalid");
    });

    test("omitting the Windows drive cannot silently disarm the gate", () => {
      const bad = config((c) => {
        c.drive = Object.fromEntries(
          Object.entries(c.drive).filter(([name]) => name !== "host"),
        );
      });
      const d = decisionOf(runHook(HOOK, bash("cargo build"), bad).stdout);
      expect(d?.permissionDecision).toBe("deny");
      expect(d?.permissionDecisionReason).toContain("drive.host: required");
    });

    test("omitting deny.advice cannot silently disarm the gate", () => {
      const bad = config((c) => {
        delete c.deny.advice;
      });
      const d = decisionOf(runHook(HOOK, bash("cp x y"), bad).stdout);
      expect(d?.permissionDecision).toBe("deny");
      expect(d?.permissionDecisionReason).toContain("deny.advice");
    });

    test("the emergency floor must remain below the launch-denial line", () => {
      const bad = config((c) => {
        driveRow(c, "host").deny_gib = 20;
        driveRow(c, "host").stop_gib = 30;
      });
      const d = decisionOf(runHook(HOOK, bash("cp x y"), bad).stdout);
      expect(d?.permissionDecision).toBe("deny");
      expect(d?.permissionDecisionReason).toContain(
        "drive.host.stop_gib: must be below deny_gib",
      );
    });

    test("unparseable TOML is reported as such", () => {
      const path = join(
        mkdtempSync(join(tmpdir(), "storage-cfg-")),
        "broken.toml",
      );
      writeFileSync(path, "schema = = 1\n");
      const d = decisionOf(
        runHook(HOOK, bash("cp x y"), { STORAGE_HEADROOM_CONFIG: path }).stdout,
      );
      expect(d?.permissionDecision).toBe("deny");
      expect(d?.permissionDecisionReason).toContain("is not valid TOML");
    });

    test('a new budget is config only: locate = "path" sizes a fixed directory', () => {
      const cache = mkdtempSync(join(tmpdir(), "julia-compiled-"));
      writeFileSync(join(cache, "blob"), Buffer.alloc(2 * 1024 * 1024, 1));
      const cfg = config((c) => {
        drives(0, 0, 0)(c);
        c.budget.push({
          name: "fixture cache",
          launchers: ["julia"],
          locate: "path",
          path: cache,
          warn_gib: 0.001,
          advice: "prune old versions.",
        });
      });
      const home = mkdtempSync(join(tmpdir(), "cargo-home-"));
      const d = decisionOf(
        runHook(HOOK, bash("julia probe.jl"), { ...cfg, HOME: home }).stdout,
      );
      expect(d?.additionalContext).toContain(`fixture cache ${cache} is `);
      expect(d?.additionalContext).toContain("prune old versions.");
    });
  });

  test("passes non-disk-writing tools below the deny line", () => {
    const { env } = cachedConfig(
      (c) => {
        drives(10, 10, 20)(c);
      },
      5 * GiB,
      100 * GiB,
    );
    for (const tool_name of [
      "Read",
      "Grep",
      "Glob",
      "SendMessage",
      "ListAgents",
      "AskUserQuestion",
      "TaskStop",
      "ToolSearch",
      "mcp__example__read_resource",
    ]) {
      expect(
        decisionOf(runHook(HOOK, { tool_name, tool_input: {} }, env).stdout),
      ).toBeNull();
    }
  });

  test("still gates disk-writing tools below the deny line", () => {
    const { env } = cachedConfig(
      (c) => {
        drives(10, 10, 20)(c);
      },
      5 * GiB,
      100 * GiB,
    );
    for (const tool_name of ["Write", "Edit", "MultiEdit", "NotebookEdit"]) {
      const d = decisionOf(
        runHook(HOOK, { tool_name, tool_input: {} }, env).stdout,
      );
      expect(d?.permissionDecision).toBe("deny");
    }
    expect(
      decisionOf(runHook(HOOK, bash("cp x y"), env).stdout)?.permissionDecision,
    ).toBe("deny");
  });
});
