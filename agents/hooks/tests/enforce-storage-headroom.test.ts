import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodedJson } from "./decode.ts";
import { z } from "../zod.ts";
import { runHook } from "./helpers.ts";

const HOOK = "enforce-storage-headroom.ts";
const payload = (command = "touch output") => ({
  tool_name: "Bash",
  tool_input: { command },
  cwd: "/tmp",
});

function fixture(deny: number, warn: number) {
  const home = mkdtempSync(join(tmpdir(), "storage-adapter-"));
  const policy = join(home, "policy.toml");
  writeFileSync(
    policy,
    `schema = 1
sparse_required_above_mb = 500
budget = []
[drive.host]
label = "fixture drive"
path = "/"
deny_gib = ${deny}
deny_pct = 100
warn_gib = ${warn}
warn_pct = 100
[deny]
advice = "reclaim"
[[launcher]]
command = "cargo"
subcommands = ["build"]
[measure]
du_timeout_seconds = 1
cache_minutes = 1
`,
  );
  const cache = join(home, ".cache/claude-hooks/storage-headroom");
  mkdirSync(cache, { recursive: true });
  const now = Temporal.Now.instant().epochMilliseconds;
  writeFileSync(
    join(cache, `${createHash("sha1").update("/").digest("hex")}.statfs.json`),
    JSON.stringify({ free: 5 * 1024 ** 3, total: 100 * 1024 ** 3, at: now }),
  );
  return {
    HOME: home,
    STORAGE_HEADROOM_CONFIG: policy,
    STORAGE_HEADROOM_NOW_MS: String(now),
  };
}

const envelope = z
  .object({
    hookSpecificOutput: z
      .object({
        hookEventName: z.literal("PreToolUse"),
        permissionDecision: z.enum(["allow", "deny"]).optional(),
        permissionDecisionReason: z.string().optional(),
        additionalContext: z.string().optional(),
      })
      .strict(),
  })
  .strict();

test("invalid hook stdin fails closed with the same stderr and exit", () => {
  const result = runHook(HOOK, "{");
  expect(result.code).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe(
    "[dotfiles:storage-headroom] invalid JSON payload\n",
  );
});

test("silent allow emits no envelope", () => {
  const result = runHook(HOOK, payload(), fixture(0, 0));
  expect(result).toEqual({ code: 0, stdout: "", stderr: "" });
});

test("warning maps to additionalContext without a permission decision", () => {
  const result = runHook(HOOK, payload(), fixture(0, 10));
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  const out = decodedJson(envelope, result.stdout).hookSpecificOutput;
  expect(out.permissionDecision).toBeUndefined();
  expect(out.permissionDecisionReason).toBeUndefined();
  expect(out.additionalContext).toBe(
    "[dotfiles:storage-headroom] WARNING fixture drive free 5.0 GiB (< 10.0 GiB); run disk-reclaim plan.",
  );
});

test("deny emits one namespaced permission envelope and exits zero", () => {
  const result = runHook(HOOK, payload(), fixture(10, 20));
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  const out = decodedJson(envelope, result.stdout).hookSpecificOutput;
  expect(out.permissionDecision).toBe("deny");
  expect(out.permissionDecisionReason?.split("\n")[0]).toBe(
    "[dotfiles:storage-headroom] free space: disk-reclaim run --tier blind --yes",
  );
  expect(out.permissionDecisionReason).toContain(
    "fixture drive free 5368709120 bytes (5.0 GiB)",
  );
});

test("launcher denial keeps warning context in the same envelope", () => {
  const result = runHook(HOOK, payload("cargo build"), fixture(0, 10));
  expect(result.code).toBe(0);
  const out = decodedJson(envelope, result.stdout).hookSpecificOutput;
  expect(out.permissionDecision).toBe("deny");
  expect(out.permissionDecisionReason).toContain(
    "cargo build denied at its warn line.",
  );
  expect(out.additionalContext).toContain(
    "[dotfiles:storage-headroom] WARNING fixture drive",
  );
});

test("explicit scratchpad allow maps its reason to the permission envelope", () => {
  const result = runHook(
    HOOK,
    {
      tool_name: "Write",
      tool_input: {
        file_path: `/tmp/claude-${process.getuid?.() ?? ""}/adapter.txt`,
        content: "x",
      },
    },
    fixture(10, 20),
  );
  expect(result.code).toBe(0);
  const out = decodedJson(envelope, result.stdout).hookSpecificOutput;
  expect(out.permissionDecision).toBe("allow");
  expect(out.permissionDecisionReason).toContain(
    "[dotfiles:storage-headroom] allowing Write to write 1 bytes",
  );
});
