import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decisionOf, runHook } from "./helpers.ts";

const HOOK = "enforce-storage-headroom.ts";

const bash = (command: string) => ({
  tool_name: "Bash",
  tool_input: { command },
  cwd: "/home/fuyu/dotfiles",
});

// A threshold no real drive can satisfy makes the gate go red deterministically; a zero
// threshold makes it green. The hook reads real statfs numbers either way.
const FULL = {
  STORAGE_HOST_DENY_GIB: "1000000",
  STORAGE_GUEST_DENY_GIB: "1000000",
};
const EMPTY = {
  STORAGE_HOST_DENY_GIB: "0",
  STORAGE_GUEST_DENY_GIB: "0",
  STORAGE_HOST_WARN_GIB: "0",
};
const WARN_ONLY = {
  STORAGE_HOST_DENY_GIB: "0",
  STORAGE_GUEST_DENY_GIB: "0",
  STORAGE_HOST_WARN_GIB: "1000000",
};

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
    ]) {
      const r = runHook(HOOK, bash(command), FULL);
      expect(r.code).toBe(0);
      const d = decisionOf(r.stdout);
      expect(d?.permissionDecision).toBe("deny");
      expect(d.permissionDecisionReason).toContain("storage-headroom");
      expect(d.permissionDecisionReason).toMatch(/free \d+\.\d GiB|unmeasured/);
    }
  });

  test("host AND guest short come back in ONE deny naming both", () => {
    const d = decisionOf(runHook(HOOK, bash("cargo build"), FULL).stdout);
    expect(d?.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain("host C:");
    expect(d.permissionDecisionReason).toContain("guest /");
  });

  test("never blocks cleanup, reads, or git — even when full", () => {
    for (const command of [
      "df -h / /mnt/c",
      "du -sh ~/.julia/compiled",
      "rm -rf target",
      "cargo clean",
      "git status --short",
      "mise run reclaim",
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
    const TINY = { ...EMPTY, STORAGE_CARGO_TARGET_WARN_GIB: "0.001" };
    const HUGE = { ...EMPTY, STORAGE_CARGO_TARGET_WARN_GIB: "1000" };

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
        { ...WARN_ONLY, STORAGE_CARGO_TARGET_WARN_GIB: "0.001", HOME: home },
      );
      const ctx = decisionOf(r.stdout)?.additionalContext ?? "";
      expect(ctx).toContain("storage-headroom: WARNING host C:");
      expect(ctx).toContain("cargo target");
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
