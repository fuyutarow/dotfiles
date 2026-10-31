import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  commandKey,
  exactKey,
  judgedMs,
  medianMs,
  recordEnd,
  recordStart,
  stepKeys,
} from "../bash-durations.ts";
import { backgroundReason } from "../enforce-background-waits.ts";
import {
  AGX_WORKER_ENV,
  AGX_WORKER_VALUE,
} from "../../../../tools/shared/src/worker-env.ts";

// bash-durations: a command kind's measured duration decides whether it may run in front.
const HOOK = join(import.meta.dir, "..", "enforce-background-waits.ts");
const POST = join(import.meta.dir, "..", "record-bash-duration.ts");
const scratch = (): string => mkdtempSync(join(tmpdir(), "bash-durations-"));
const ordinarySessionEnv = (
  extra: Record<string, string>,
): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  delete env[AGX_WORKER_ENV];
  return env;
};

describe("duration attribution", () => {
  test.each([
    ['echo "$PATH" | slowcmd', 'echo "$PATH"'],
    ['echo "$(slowcmd)"', 'echo "$PATH"'],
    ['echo "$(/tmp/slowcmd)"', 'echo "$PATH"'],
    ['echo "$PATH" | /tmp/slowcmd', 'echo "$PATH"'],
    ["echo `slowcmd`", 'echo "$PATH"'],
    ["cut -c1-300 /tmp/input | slowcmd", "cut -c1-300 /tmp/input"],
    ["sed -i s/a/b/ /tmp/input | slowcmd", "sed -i s/a/b/ /tmp/input"],
    ["slowcmd; echo done", "echo done"],
    ["slowcmd; head /tmp/input", "head /tmp/input"],
    ["slowcmd; cat /tmp/input | cut -c1-300", "cat /tmp/input | cut -c1-300"],
  ])("%s does not lend its total to %s", async (compound, cheap) => {
    const dir = scratch();
    const key = commandKey(compound);
    expect(key).toBeDefined();
    if (key === undefined) return;
    recordStart(dir, "compound", key, 0, exactKey(compound));
    await recordEnd(dir, "compound", 15_000);
    const cheapKey = commandKey(cheap);
    expect(cheapKey).toBeDefined();
    if (cheapKey === undefined) return;
    const result = Bun.spawnSync(["bun", HOOK], {
      stdin: new Blob([
        JSON.stringify({ tool_name: "Bash", tool_input: { command: cheap } }),
      ]),
      env: ordinarySessionEnv({ CLAUDE_BASH_DURATIONS_DIR: dir }),
      timeout: 30_000,
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(result.stdout.toString()).toBe("");
    expect(await judgedMs(dir, cheapKey)).toBeUndefined();
    // The measured whole compound remains slow, even though its parts are unmeasured.
    expect(await judgedMs(dir, key)).toBe(15_000);
    const repeated = Bun.spawnSync(["bun", HOOK], {
      stdin: new Blob([
        JSON.stringify({
          tool_name: "Bash",
          tool_input: { command: compound },
        }),
      ]),
      env: ordinarySessionEnv({ CLAUDE_BASH_DURATIONS_DIR: dir }),
      timeout: 30_000,
    });
    expect(repeated.exitCode, repeated.stderr.toString()).toBe(0);
    expect(repeated.stdout.toString()).toContain('"permissionDecision":"deny"');
  });

  test("ambiguous legacy samples cannot deny cheap calls; new single-command samples still count", async () => {
    const dir = scratch();
    writeFileSync(
      join(dir, "summary.json"),
      JSON.stringify({
        echo: [13590, 9822, 5204, 13777, 6871, 131, 146921, 340, 4924, 3869],
        "cut -c1-300": [802, 585, 14887],
        "sed -i": [1093, 1327, 118039],
        "mise -C": [15525],
        "bun test": [75148, 8347],
        "mise run land": [45_000],
      }),
    );
    for (const key of ["echo", "cut -c1-300", "sed -i", "mise -C"])
      expect(await judgedMs(dir, key), key).toBeUndefined();
    expect(await judgedMs(dir, "bun test")).toBeGreaterThan(5000);
    expect(await judgedMs(dir, "mise run land")).toBe(45_000);
    recordStart(dir, "new-slow-sed", "sed -i", 0);
    await recordEnd(dir, "new-slow-sed", 12_000);
    expect(await judgedMs(dir, "sed -i")).toBe(12_000);
  });

  test("mise directory flags retain the task identity", () => {
    expect(commandKey("mise -C /tmp/project run land -- x")).toBe(
      "mise run land",
    );
    expect(commandKey("mise -C /tmp/project run deps")).toBe("mise run deps");
    expect(commandKey("mise --cd=/tmp/project run land -- x")).toBe(
      "mise run land",
    );
    expect(commandKey("mise -C/tmp/project run land -- x")).toBe(
      "mise run land",
    );
    expect(commandKey("mise run task -- --cd x")).toBe("mise run task");
  });

  test("quoted separators are data and unsupported syntax retains the entire call", () => {
    expect(stepKeys("echo 'hello; slowcmd' | cut -c1-300")).toEqual([
      "echo",
      "cut -c1-300",
    ]);
    const command = "case x in x) slowcmd;; esac; echo done";
    expect(commandKey(command)).toBe(`unparsed:${command}`);
  });

  test("an old pending record cannot be promoted to trusted telemetry", async () => {
    const dir = scratch();
    recordStart(dir, "old", "echo", 0);
    writeFileSync(
      join(dir, "pending", "old.json"),
      JSON.stringify({ key: "echo", started: 0 }),
    );
    expect(await recordEnd(dir, "old", 15_000)).toBeUndefined();
    expect(await judgedMs(dir, "echo")).toBeUndefined();
  });
});

describe("commandKey", () => {
  test.each([
    ["mise run commit -- -m x --push -- a.ts", "mise run commit"],
    ["cd /Users/fuyu/dotfiles && mise run commit -- -m x", "mise run commit"],
    ["FOO=1 bun test scripts/tests/x.test.ts", "bun test"],
    ["agx worker run b.md --cd x", "agx worker run --cd"],
    ["agx-worker run b.md --cd x", "agx-worker run --cd"],
    ["agx worker dispatch b.md --ws x", "agx worker dispatch --ws"],
    ["agx-worker dispatch b.md --ws x", "agx-worker dispatch --ws"],
    [
      "example-records leaderboard --all --format json",
      "example-records leaderboard --all --format",
    ],
    ["example-records leaderboard", "example-records leaderboard"],
    ["bunx --bun oxlint --type-aware x.ts", "bunx --bun --type-aware"],
    ["ls", "ls"],
    ["/bin/cp -f a b", "exact:/bin/cp -f a b"],
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
  test("a closed record becomes a duration; the median is over the last ten", async () => {
    const dir = scratch();
    for (const [i, ms] of [1000, 30_000, 20_000].entries()) {
      recordStart(dir, `id${i}`, "mise run commit", 0);
      expect(await recordEnd(dir, `id${i}`, ms)).toBe(ms);
    }
    expect(await medianMs(dir, "mise run commit")).toBe(20_000);
    expect(await medianMs(dir, "never ran")).toBeUndefined();
  });

  test("an end with no start (a background call) records nothing", async () => {
    const dir = scratch();
    expect(await recordEnd(dir, "unknown", 5000)).toBeUndefined();
    expect(await medianMs(dir, "ls")).toBeUndefined();
  });

  test("the hook supplied tool duration excludes time spent in the hook harness", async () => {
    const dir = scratch();
    recordStart(dir, "short", "cat", 0);
    expect(await recordEnd(dir, "short", 8000, 120)).toBe(120);
    expect(await medianMs(dir, "cat")).toBe(120);
  });

  test("a PostToolUse event without duration telemetry does not record harness time", async () => {
    const dir = scratch();
    const env = ordinarySessionEnv({ CLAUDE_BASH_DURATIONS_DIR: dir });
    recordStart(dir, "no-duration", "cat", 0);
    Bun.spawnSync(["bun", POST], {
      stdin: new Blob([
        JSON.stringify({ tool_name: "Bash", tool_use_id: "no-duration" }),
      ]),
      env,
      timeout: 30_000,
    });
    expect(await medianMs(dir, "cat")).toBeUndefined();
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

  test("end to end: a measured slow command is denied, a fast one is allowed and measured", async () => {
    const dir = scratch();
    const env = ordinarySessionEnv({ CLAUDE_BASH_DURATIONS_DIR: dir });
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
    // Claude's duration_ms is tool execution time, excluding hook/harness setup.
    hook(POST, { ...first, duration_ms: 40_000 });
    expect(await medianMs(dir, "mise run commit")).toBeGreaterThan(39_000);
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

test("one slow latest run is enough: judged by the larger of median and latest", async () => {
  const dir = scratch();
  for (const [i, ms] of [500, 600, 700, 120_000].entries()) {
    recordStart(dir, `j${i}`, "example-records leaderboard --all", 0);
    await recordEnd(dir, `j${i}`, ms);
  }
  expect(await medianMs(dir, "example-records leaderboard --all")).toBe(650);
  expect(await judgedMs(dir, "example-records leaderboard --all")).toBe(
    120_000,
  );
});

test("a compound call first seen as a whole is still sent back when one of its steps is known slow", async () => {
  expect(
    stepKeys("cd x && f=a.ts && sed -i '' s/a/b/ $f && bun test $f"),
  ).toEqual(["sed -i", "bun test"]);
  const dir = scratch();
  recordStart(dir, "s1", "bun test", 0);
  await recordEnd(dir, "s1", 23_000);
  const out = Bun.spawnSync(["bun", HOOK], {
    stdin: new Blob([
      JSON.stringify({
        tool_name: "Bash",
        tool_use_id: "s2",
        tool_input: { command: "f=a.ts && sed -i '' s/a/b/ $f && bun test $f" },
      }),
    ]),
    env: ordinarySessionEnv({ CLAUDE_BASH_DURATIONS_DIR: dir }),
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

test("a dispatched worker may keep measured-slow and long-timeout Bash calls in front", async () => {
  const dir = scratch();
  recordStart(dir, "worker-slow", "bun test", 0);
  await recordEnd(dir, "worker-slow", 23_000);
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
      [AGX_WORKER_ENV]: AGX_WORKER_VALUE,
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
      [AGX_WORKER_ENV]: AGX_WORKER_VALUE,
    },
    timeout: 30_000,
  }).stdout.toString();
  expect(workerTimeout).toBe("");

  const interactive = Bun.spawnSync(["bun", HOOK], {
    stdin: new Blob([JSON.stringify(payload)]),
    env: ordinarySessionEnv({ CLAUDE_BASH_DURATIONS_DIR: dir }),
    timeout: 30_000,
  }).stdout.toString();
  expect(interactive).toContain('"permissionDecision":"deny"');
  expect(interactive).toContain("`bun test` has taken 23 s here");

  const interactiveTimeout = Bun.spawnSync(["bun", HOOK], {
    stdin: new Blob([JSON.stringify(timeoutOnly)]),
    env: ordinarySessionEnv({ CLAUDE_BASH_DURATIONS_DIR: dir }),
    timeout: 30_000,
  }).stdout.toString();
  expect(interactiveTimeout).toContain('"permissionDecision":"deny"');
  expect(interactiveTimeout).toContain("asks for a 900 s timeout");
});
