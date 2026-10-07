import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  backgroundReason,
  FOREGROUND_MAX_MS,
} from "../enforce-background-waits.ts";
import { AGENT_ROUTER_WORKER_ENV } from "../../../../tools/shared/src/worker-env.ts";

// enforce-background-waits: a long or waiting foreground Bash call is denied with the resend to make.

const HOOK = join(import.meta.dir, "..", "enforce-background-waits.ts");
const decide = (tool_input: Record<string, unknown>): string => {
  const env = { ...process.env };
  delete env[AGENT_ROUTER_WORKER_ENV];
  const p = Bun.spawnSync(["bun", HOOK], {
    stdin: new Blob([JSON.stringify({ tool_name: "Bash", tool_input })]),
    env,
    timeout: 30_000,
  });
  return p.stdout.toString();
};

describe("backgroundReason", () => {
  test("the default foreground bound and a short call stay in front", () => {
    expect(
      backgroundReason({ command: "ls", timeout: FOREGROUND_MAX_MS }),
    ).toBeUndefined();
    expect(backgroundReason({ command: "bun test x.test.ts" })).toBeUndefined();
  });

  test("a timeout above the bound must go to the background", () => {
    expect(
      backgroundReason({ command: "mise run commit", timeout: 600_000 }),
    ).toContain("600 s timeout");
  });

  test("a wait loop must go to the background, whatever its timeout", () => {
    expect(
      backgroundReason({ command: "until [ -e done ]; do sleep 10; done" }),
    ).toContain("wait loop");
    expect(
      backgroundReason({
        command: "while pgrep x >/dev/null\ndo sleep 5\ndone",
      }),
    ).toContain("wait loop");
  });

  test("run_in_background: true is always allowed", () => {
    expect(
      backgroundReason({
        command: "until x; do sleep 1; done",
        timeout: 600_000,
        run_in_background: true,
      }),
    ).toBeUndefined();
  });

  test("words that merely contain the keywords are not loops", () => {
    expect(
      backgroundReason({ command: "echo untilsleep; cat sleepy.txt" }),
    ).toBeUndefined();
  });
});

describe("as a hook", () => {
  test("denies with the resend to make", () => {
    const out = decide({ command: "until [ -e f ]; do sleep 5; done" });
    expect(out).toContain('"permissionDecision":"deny"');
    expect(out).toContain("run_in_background: true");
  });

  test("says nothing about a short foreground call", () => {
    expect(decide({ command: "ls" })).toBe("");
  });
});
