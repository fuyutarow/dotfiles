import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { decisionOf, runHook } from "./helpers.ts";

const HOOK = "enforce-storage-headroom.ts";

const bash = (command: string) => ({
  tool_name: "Bash",
  tool_input: { command },
  cwd: "/home/fuyu/dotfiles",
});

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
  const out = [`schema = ${doc.schema}`];
  for (const [sub, t] of Object.entries(doc.drive))
    out.push(`[drive.${sub}]`, ...body(t));
  out.push("[deny]", ...body(doc.deny));
  for (const item of doc.launcher) out.push("[[launcher]]", ...body(item));
  for (const item of doc.budget) out.push("[[budget]]", ...body(item));
  out.push("[measure]", ...body(doc.measure));
  return `${out.join("\n")}\n`;
}

function present<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`fixture config has no ${what}`);
  return v;
}
const driveRow = (c: Doc, name: string): Row =>
  present(c.drive[name], `drive.${name}`);
const firstBudget = (c: Doc): Row => present(c.budget[0], "budget[0]");

function config(edit: (c: Doc) => void): Record<string, string> {
  const c = Doc.parse(Bun.TOML.parse(readFileSync(REAL, "utf8")));
  edit(c);
  const path = join(
    mkdtempSync(join(tmpdir(), "storage-cfg-")),
    "storage-headroom.toml",
  );
  writeFileSync(path, toToml(c));
  return { STORAGE_HEADROOM_CONFIG: path };
}
const drives = (host: number, guest: number, hostWarn: number) => (c: Doc) => {
  driveRow(c, "host").deny_gib = host;
  driveRow(c, "guest").deny_gib = guest;
  driveRow(c, "host").warn_gib = hostWarn;
};
const FULL = config(drives(1_000_000, 1_000_000, 60));
const EMPTY = config(drives(0, 0, 0));
const WARN_ONLY = config(drives(0, 0, 1_000_000));

describe("enforce-storage-headroom", () => {
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
      expect(d?.permissionDecisionReason).toContain("storage-headroom");
      expect(d?.permissionDecisionReason).toMatch(
        /free \d+\.\d GiB|unmeasured/,
      );
    }
  });

  test("host AND guest short come back in ONE deny naming both", () => {
    const d = decisionOf(runHook(HOOK, bash("cargo build"), FULL).stdout);
    expect(d?.permissionDecision).toBe("deny");
    expect(d?.permissionDecisionReason).toContain("host C:");
    expect(d?.permissionDecisionReason).toContain("guest /");
  });

  test("an unreadable Windows drive denies compute on WSL", () => {
    const cfg = config((c) => {
      drives(0, 0, 0)(c);
      driveRow(c, "host").path = "/missing-wsl-host-drive";
    });
    const d = decisionOf(runHook(HOOK, bash("cargo build"), cfg).stdout);
    expect(d?.permissionDecision).toBe("deny");
    expect(d?.permissionDecisionReason).toContain("could not be measured");
  });

  test("never blocks cleanup, reads, or git — even when full", () => {
    for (const command of [
      "df -h / /mnt/c",
      "du -sh ~/.julia/compiled",
      "rm -rf target",
      "cargo clean",
      "git status --short",
      "mise run reclaim",
      "mise run reclaim:builds",
      "mise run doctor",
      "ls -la",
    ]) {
      const r = runHook(HOOK, bash(command), FULL);
      expect(r.code).toBe(0);
      expect(decisionOf(r.stdout)).toBeNull();
    }
  });

  test("STORAGE_ASSERT_OVERRIDE=1 in the command text bypasses, visibly", () => {
    const r = runHook(
      HOOK,
      bash("STORAGE_ASSERT_OVERRIDE=1 cargo build"),
      FULL,
    );
    expect(decisionOf(r.stdout)).toBeNull();
  });

  test("passes silently with headroom", () => {
    const r = runHook(HOOK, bash("cargo build"), EMPTY);
    expect(r.code).toBe(0);
    expect(decisionOf(r.stdout)).toBeNull();
    expect(r.stderr).not.toContain("storage-headroom");
  });

  test("warns through additionalContext in the band below the warn line, without denying", () => {
    // stderr with exit 0 never reaches the model on PreToolUse; the warning must ride the JSON.
    const r = runHook(HOOK, bash("julia probe.jl"), WARN_ONLY);
    const d = decisionOf(r.stdout);
    expect(d?.permissionDecision).toBeUndefined();
    expect(d?.additionalContext).toContain("storage-headroom: WARNING");
  });

  describe("cargo target budget", () => {
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

    test("the drive warning and the target warning arrive in ONE decision", () => {
      const { root, home } = workspace();
      const r = runHook(
        HOOK,
        { ...bash("cargo build"), cwd: root },
        { ...budget(0.001, 1_000_000), HOME: home },
      );
      const ctx = decisionOf(r.stdout)?.additionalContext ?? "";
      expect(ctx).toContain("storage-headroom: WARNING host C:");
      expect(ctx).toContain("cargo target");
    });
  });

  describe("config", () => {
    test("the committed storage-headroom.toml is valid (an invalid one denies every Bash call)", () => {
      const r = runHook(HOOK, bash("ls -la"), {});
      expect(r.code).toBe(0);
      expect(r.stdout).toBe("");
    });

    test("an invalid config denies with EVERY error in one decision, and names the escape", () => {
      const bad = config((c) => {
        driveRow(c, "host").deny_gib = "thirty"; // wrong type
        present(c.launcher[0], "launcher[0]").comand = "typo"; // unknown key
      });
      const d = decisionOf(runHook(HOOK, bash("ls"), bad).stdout);
      expect(d?.permissionDecision).toBe("deny");
      expect(d?.permissionDecisionReason).toContain(
        "drive.host.deny_gib: expected a non-negative number",
      );
      expect(d?.permissionDecisionReason).toContain(
        "launcher[0]: unknown key 'comand'",
      );
      expect(d?.permissionDecisionReason).toContain(
        "STORAGE_ASSERT_OVERRIDE=1",
      );
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

    test("the emergency floor must remain below the launch-denial line", () => {
      const bad = config((c) => {
        driveRow(c, "host").deny_gib = 20;
        driveRow(c, "host").stop_gib = 30;
      });
      const d = decisionOf(runHook(HOOK, bash("ls"), bad).stdout);
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
        runHook(HOOK, bash("ls"), { STORAGE_HEADROOM_CONFIG: path }).stdout,
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

  test("ignores non-Bash tools and empty commands", () => {
    expect(
      decisionOf(
        runHook(HOOK, { tool_name: "Edit", tool_input: {} }, FULL).stdout,
      ),
    ).toBeNull();
    expect(decisionOf(runHook(HOOK, bash(""), FULL).stdout)).toBeNull();
  });
});
