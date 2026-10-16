import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
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

test.each([
  "jj workspace add ../unsafe",
  "timeout 2 jj -R . workspace add ../unsafe",
  "jj workspace add --sparse-patterns empty ../unsafe",
])(
  "raw workspace preparation is refused before storage probes: %s",
  (command) => {
    // Invalid config proves the refusal precedes policy loading and measurements.
    const result = runHook(HOOK, payload(command), {
      STORAGE_HEADROOM_CONFIG: "/nonexistent/jjsafe4-policy.toml",
    });
    const out = decodedJson(envelope, result.stdout).hookSpecificOutput;
    expect(result.code).toBe(0);
    expect(out.permissionDecision).toBe("deny");
    expect(out.permissionDecisionReason).toContain("ws add <ticket-name>");
  },
);

test.each(["jj workspace add --help", "jj workspace add -h"])(
  "raw workspace help remains available: %s",
  (command) => {
    expect(runHook(HOOK, payload(command), fixture(0, 0))).toEqual({
      code: 0,
      stdout: "",
      stderr: "",
    });
  },
);

test("warning maps to additionalContext without a permission decision", () => {
  const result = runHook(HOOK, payload(), fixture(0, 10));
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  const out = decodedJson(envelope, result.stdout).hookSpecificOutput;
  expect(out.permissionDecision).toBeUndefined();
  expect(out.permissionDecisionReason).toBeUndefined();
  // With TMPDIR set (sandboxed runs) the gate appends a "tmp /tmp free ..." clause.
  expect(out.additionalContext).toStartWith(
    "[dotfiles:storage-headroom] WARNING fixture drive free 5.0 GiB (< 10.0 GiB);",
  );
  expect(out.additionalContext).toEndWith("run disk-reclaim plan.");
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

// GUEST-SELF-HEAL: pressure queues guest-capacity-recover.service through `systemctl --user
// --no-block start`, once per episode, with no permission prompt in the path.
function guestFixture(recoverGib: number, tmpPct?: number) {
  const env = fixture(0, 0);
  const policy = env.STORAGE_HEADROOM_CONFIG;
  const home = env.HOME;
  const bin = join(home, "bin");
  mkdirSync(bin, { recursive: true });
  const calls = join(home, "systemctl.calls");
  writeFileSync(
    join(bin, "systemctl"),
    `#!/bin/sh\necho "$@" >> '${calls}'\n`,
    { mode: 0o755 },
  );
  writeFileSync(
    policy,
    readFileSync(policy, "utf8").replace(
      "[deny]",
      `[drive.guest]
label = "guest /"
path = "/"
deny_gib = 1
deny_pct = 100
recover_gib = ${recoverGib}
recover_pct = 100
${tmpPct === undefined ? "" : `tmp_recover_pct = ${tmpPct}`}

[deny]`,
    ),
  );
  return {
    ...env,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    GUEST_RECOVERY_STATE_DIR: join(home, "state"),
    calls,
  };
}

function queuedCalls(file: string): string[] {
  return existsSync(file)
    ? readFileSync(file, "utf8").split("\n").filter(Boolean)
    : [];
}

test("guest / below its recover line queues the recovery unit exactly once per episode", () => {
  const { calls, ...env } = guestFixture(10);
  for (let i = 0; i < 3; i++) runHook(HOOK, payload(), env);
  expect(queuedCalls(calls)).toEqual([
    "--user --no-block start guest-capacity-recover.service",
  ]);
});

test("guest / above its recover line queues nothing", () => {
  const { calls, ...env } = guestFixture(2);
  const result = runHook(HOOK, payload(), env);
  expect(result.code).toBe(0);
  expect(queuedCalls(calls)).toEqual([]);
});

test("a /tmp pressure line crossing queues the unit without any drive pressure", () => {
  const { calls, ...env } = guestFixture(2, 0);
  runHook(HOOK, payload(), env);
  expect(queuedCalls(calls)).toHaveLength(1);
});

test("the queue never changes the verdict: a failing systemctl still allows", () => {
  const { calls, PATH: _PATH, ...env } = guestFixture(10);
  const result = runHook(HOOK, payload(), { ...env, PATH: "/nonexistent" });
  expect(result.code).toBe(0);
  expect(queuedCalls(calls)).toEqual([]);
});
