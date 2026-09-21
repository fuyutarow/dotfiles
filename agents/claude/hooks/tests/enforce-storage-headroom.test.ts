import { describe, expect, test } from "bun:test";
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

  test("warns on stderr in the band below the warn line, without denying", () => {
    const r = runHook(HOOK, bash("julia probe.jl"), WARN_ONLY);
    expect(decisionOf(r.stdout)).toBeNull();
    expect(r.stderr).toContain("storage-headroom: WARNING");
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
