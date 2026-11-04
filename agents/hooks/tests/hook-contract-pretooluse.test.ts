import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  runHook as runClaudeHook,
  tempHome,
} from "../../claude/hooks/tests/helpers.ts";
import { decisionOf, runHook, tempDir } from "./helpers.ts";

const home = tempHome();
const root = tempDir("pretool-contract-");
mkdirSync(join(root, "launcher"), { recursive: true });
mkdirSync(join(root, "packages"), { recursive: true });
writeFileSync(join(root, "launcher/launch.ts"), "");
writeFileSync(join(root, "packages/ModelRegistry.jl"), "");
const policy = join(home, "storage.toml");
writeFileSync(
  policy,
  `schema = 1
sparse_required_above_mb = 500
budget = []
[drive.host]
label = "fixture drive"
path = "/"
deny_gib = 10
deny_pct = 100
warn_gib = 20
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
const now = Temporal.Now.instant().epochMilliseconds;
const cache = join(home, ".cache/claude-hooks/storage-headroom");
mkdirSync(cache, { recursive: true });
writeFileSync(
  join(cache, `${createHash("sha1").update("/").digest("hex")}.statfs.json`),
  JSON.stringify({ free: 5 * 1024 ** 3, total: 100 * 1024 ** 3, at: now }),
);
const env = {
  HOME: home,
  STORAGE_HEADROOM_CONFIG: policy,
  STORAGE_HEADROOM_NOW_MS: String(now),
  CLAUDE_BASH_DURATIONS_DIR: join(home, "durations"),
};
const payload = (command: string, background = false) => ({
  tool_name: "Bash",
  cwd: root,
  tool_input: { command, run_in_background: background },
});

const cases = [
  {
    name: "supervised-execution",
    claude: true,
    command: "nohup ./job.sh &",
    reason: "run_in_background",
  },
  {
    name: "official-execution",
    claude: true,
    command: "julia -e '1'",
    reason: "scratch execution is banned",
  },
  {
    name: "background-waits",
    claude: true,
    command: "sleep 30 &",
    background: true,
    reason: "drop the `&`",
  },
  {
    name: "no-new-bash",
    claude: true,
    command: "printf '%s\\n' {1..13} > x.sh",
    reason: "one .ts file run by bun",
  },
  {
    name: "model-floor",
    claude: false,
    command: "codex exec -m gpt-5.6-sol x",
    reason: "sol floor >= 6.1",
  },
  {
    name: "search-route",
    claude: false,
    command: "ccc index",
    reason: "rr index",
  },
  {
    name: "storage-headroom",
    claude: false,
    command: "touch output",
    reason: "fixture drive free",
  },
];

function check(
  name: string,
  claude: boolean,
  command: string,
  reason: string,
  background = false,
) {
  const run = claude ? runClaudeHook : runHook;
  const result = run(
    `enforce-${name}.ts`,
    payload(command, background),
    { ...env, HOOK_SLUG: `dotfiles:${name}` },
    root,
  );
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  const decision = decisionOf(result.stdout);
  expect(decision?.permissionDecision).toBe("deny");
  expect(decision?.permissionDecisionReason).toContain(`[dotfiles:${name}]`);
  expect(decision?.permissionDecisionReason).toContain(reason);
}

test.each(cases)(
  "$name Bash adapter contract",
  ({ name, claude, command, reason, background }) => {
    check(name, claude, command, reason, background);
  },
);

test("one payload produces independent supervised and background-waits denials", () => {
  const command = "nohup ./job.sh &";
  check("supervised-execution", true, command, "run_in_background", true);
  check("background-waits", true, command, "drop the `&`", true);
});
