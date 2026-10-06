import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  commandKey,
  judgedMs,
  medianMs,
  recordEnd,
  recordStart,
  stepKeys,
} from "../bash-durations.ts";
import { backgroundReason } from "../enforce-background-waits.ts";
import {
  AGENT_ROUTER_WORKER_ENV,
  AGENT_ROUTER_WORKER_VALUE,
} from "../../../hooks/worker-env.ts";

// bash-durations: a command kind's measured duration decides whether it may run in front.
const HOOK = join(import.meta.dir, "..", "enforce-background-waits.ts");
const POST = join(import.meta.dir, "..", "record-bash-duration.ts");
const scratch = (): string => mkdtempSync(join(tmpdir(), "bash-durations-"));

describe("commandKey", () => {
  test.each([
    ["mise run commit -- -m x --push -- a.ts", "mise run commit"],
    ["cd /Users/fuyu/dotfiles && mise run commit -- -m x", "mise run commit"],
    ["FOO=1 bun test scripts/tests/x.test.ts", "bun test"],
    [
      "agent-router run --prompt-file b.md --cd x",
      "agent-router run --prompt-file --cd",
    ],
    [
      "polysearch leaderboard --all --format json",
      "polysearch leaderboard --all --format",
    ],
    ["polysearch leaderboard", "polysearch leaderboard"],
    ["bunx --bun oxlint --type-aware x.ts", "bunx --bun --type-aware"],
    ["ls", "ls"],
    ["/bin/cp -f a b", undefined],
    ["cd x", undefined],
    // a compound call is keyed by all its steps; an assignment-only step is no step (the 2026-10-06
    // miss: `cd … && f=… && sed … && bun test $f` had no key and ran 20 s in front)
    [
      "cd x && f=a.ts && sed -i '' s/a/b/ $f && bun test $f",
      "sed -i && bun test",
    ],
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
    ).toContain("`mise run commit` has taken 45 s here");
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
    expect(out).toContain("has taken 40 s here");
  });
});

test("one slow latest run is enough: judged by the larger of median and latest", () => {
  const dir = scratch();
  for (const [i, ms] of [500, 600, 700, 120_000].entries()) {
    recordStart(dir, `j${i}`, "polysearch leaderboard --all", 0);
    recordEnd(dir, `j${i}`, ms);
  }
  expect(medianMs(dir, "polysearch leaderboard --all")).toBe(650);
  expect(judgedMs(dir, "polysearch leaderboard --all")).toBe(120_000);
});

test("a compound call first seen as a whole is still sent back when one of its steps is known slow", () => {
  expect(
    stepKeys("cd x && f=a.ts && sed -i '' s/a/b/ $f && bun test $f"),
  ).toEqual(["sed -i", "bun test"]);
  const dir = scratch();
  recordStart(dir, "s1", "bun test", 0);
  recordEnd(dir, "s1", 23_000);
  const out = Bun.spawnSync(["bun", HOOK], {
    stdin: new Blob([
      JSON.stringify({
        tool_name: "Bash",
        tool_use_id: "s2",
        tool_input: { command: "f=a.ts && sed -i '' s/a/b/ $f && bun test $f" },
      }),
    ]),
    env: { ...process.env, CLAUDE_BASH_DURATIONS_DIR: dir },
    timeout: 30_000,
  }).stdout.toString();
  expect(out).toContain('"permissionDecision":"deny"');
  expect(out).toContain("`bun test` has taken 23 s here");
});

test("the foreground bound is the owner's 5 s", () => {
  expect(backgroundReason({ command: "x" }, { key: "x", ms: 5100 })).toContain(
    "has taken 5 s",
  );
  expect(
    backgroundReason({ command: "x" }, { key: "x", ms: 4900 }),
  ).toBeUndefined();
});

test("a dispatched worker may keep measured-slow and long-timeout Bash calls in front", () => {
  const dir = scratch();
  recordStart(dir, "worker-slow", "bun test", 0);
  recordEnd(dir, "worker-slow", 23_000);
  const payload = {
    tool_name: "Bash",
    tool_use_id: "worker-next",
    tool_input: { command: "bun test", timeout: 900_000 },
  };
  const worker = Bun.spawnSync(["bun", HOOK], {
    stdin: new Blob([JSON.stringify(payload)]),
    env: {
      ...process.env,
      CLAUDE_BASH_DURATIONS_DIR: dir,
      [AGENT_ROUTER_WORKER_ENV]: AGENT_ROUTER_WORKER_VALUE,
    },
    timeout: 30_000,
  }).stdout.toString();
  expect(worker).toBe("");

  const timeoutOnly = {
    tool_name: "Bash",
    tool_use_id: "worker-timeout",
    tool_input: { command: "sleep 1", timeout: 900_000 },
  };
  const workerTimeout = Bun.spawnSync(["bun", HOOK], {
    stdin: new Blob([JSON.stringify(timeoutOnly)]),
    env: {
      ...process.env,
      CLAUDE_BASH_DURATIONS_DIR: dir,
      [AGENT_ROUTER_WORKER_ENV]: AGENT_ROUTER_WORKER_VALUE,
    },
    timeout: 30_000,
  }).stdout.toString();
  expect(workerTimeout).toBe("");

  const interactive = Bun.spawnSync(["bun", HOOK], {
    stdin: new Blob([JSON.stringify(payload)]),
    env: { ...process.env, CLAUDE_BASH_DURATIONS_DIR: dir },
    timeout: 30_000,
  }).stdout.toString();
  expect(interactive).toContain('"permissionDecision":"deny"');
  expect(interactive).toContain("`bun test` has taken 23 s here");

  const interactiveTimeout = Bun.spawnSync(["bun", HOOK], {
    stdin: new Blob([JSON.stringify(timeoutOnly)]),
    env: { ...process.env, CLAUDE_BASH_DURATIONS_DIR: dir },
    timeout: 30_000,
  }).stdout.toString();
  expect(interactiveTimeout).toContain('"permissionDecision":"deny"');
  expect(interactiveTimeout).toContain("asks for a 900 s timeout");
});
