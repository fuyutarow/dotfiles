import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  commandKey,
  medianMs,
  recordEnd,
  recordStart,
} from "../bash-durations.ts";
import { backgroundReason } from "../enforce-background-waits.ts";

// bash-durations: a command kind's measured duration decides whether it may run in front.
const HOOK = join(import.meta.dir, "..", "enforce-background-waits.ts");
const POST = join(import.meta.dir, "..", "record-bash-duration.ts");
const scratch = (): string => mkdtempSync(join(tmpdir(), "bash-durations-"));

describe("commandKey", () => {
  test.each([
    ["mise run commit -- -m x --push -- a.ts", "mise run commit"],
    ["cd /Users/fuyu/dotfiles && mise run commit -- -m x", "mise run commit"],
    ["FOO=1 bun test scripts/tests/x.test.ts", "bun test"],
    ["agent-router run --prompt-file b.md", "agent-router run"],
    ["ls", "ls"],
    ["/bin/cp -f a b", undefined],
    ["cd x", undefined],
  ])("%s → %s", (command, key) => {
    expect(commandKey(command)).toBe(key);
  });
});

describe("recordStart / recordEnd / medianMs", () => {
  test("a closed record becomes a duration; the median is over the last ten", () => {
    const dir = scratch();
    for (const [i, ms] of [1000, 30_000, 20_000].entries()) {
      recordStart(dir, `id${i}`, "mise run commit", 0);
      expect(recordEnd(dir, `id${i}`, ms)).toBe(ms);
    }
    expect(medianMs(dir, "mise run commit")).toBe(20_000);
    expect(medianMs(dir, "never ran")).toBeUndefined();
  });

  test("an end with no start (a background call) records nothing", () => {
    const dir = scratch();
    expect(recordEnd(dir, "unknown", 5000)).toBeUndefined();
    expect(medianMs(dir, "ls")).toBeUndefined();
  });
});

describe("the measured rule", () => {
  test("a kind measured above the foreground maximum must go to the background", () => {
    expect(
      backgroundReason(
        { command: "mise run commit" },
        { key: "mise run commit", ms: 45_000 },
      ),
    ).toContain("`mise run commit` has taken a median 45 s here");
    expect(
      backgroundReason({ command: "ls" }, { key: "ls", ms: 200 }),
    ).toBeUndefined();
    expect(
      backgroundReason(
        { command: "mise run commit", run_in_background: true },
        { key: "mise run commit", ms: 45_000 },
      ),
    ).toBeUndefined();
  });

  test("end to end: a measured slow command is denied, a fast one is allowed and measured", () => {
    const dir = scratch();
    const env = { ...process.env, CLAUDE_BASH_DURATIONS_DIR: dir };
    const hook = (path: string, payload: unknown): string =>
      Bun.spawnSync(["bun", path], {
        stdin: new Blob([JSON.stringify(payload)]),
        env,
        timeout: 30_000,
      }).stdout.toString();
    // first commit: unmeasured, allowed in front, its start recorded
    const first = {
      tool_name: "Bash",
      tool_use_id: "t1",
      tool_input: { command: "mise run commit -- -m x" },
    };
    expect(hook(HOOK, first)).toBe("");
    // pretend it took 40 s: rewrite the start, then close it through the PostToolUse hook
    recordStart(
      dir,
      "t1",
      "mise run commit",
      Temporal.Now.instant().epochMilliseconds - 40_000,
    );
    hook(POST, first);
    expect(medianMs(dir, "mise run commit")).toBeGreaterThan(39_000);
    // the next commit in front is denied with the measured reason
    const second = {
      tool_name: "Bash",
      tool_use_id: "t2",
      tool_input: { command: "mise run commit -- -m y" },
    };
    const out = hook(HOOK, second);
    expect(out).toContain('"permissionDecision":"deny"');
    expect(out).toContain("has taken a median 40 s here");
  });
});
