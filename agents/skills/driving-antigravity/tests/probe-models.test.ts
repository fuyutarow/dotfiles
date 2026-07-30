// bun test — CHARACTERIZATION brackets for scripts/probe-models.ts (oracle-first, G2).
// These pin the CURRENT script's exact stdout/stderr line formats and exit codes against a fake
// `agy` fixture (fake-agy.ts, substituted via the AGY_BIN env override the source reads at
// scripts/probe-models.ts:49) so a later refactor of the script can be graded against this
// bracket. NEVER invokes the real `agy` binary.
//
// Cases pinned, each with its scripts/probe-models.ts:line receipt:
//   (a) no models given            -> roster path                       (lines 63-70)
//   (b) valid model                -> RESULT: AVAILABLE                 (lines 79-83)
//   (c) invalid model name         -> RESULT: INVALID_NAME              (lines 85-91)
//   (d) rc=0 but stdout != "OK"    -> RESULT: INCONCLUSIVE (rc=0 note)  (lines 92-98, 96)
//   (d) non-zero rc + error lines  -> RESULT: INCONCLUSIVE (rc=N note)  (lines 92-105, 97, 99-104)
//   +  version floor warning       -> WARNING: ... below the 1.1.2 floor (lines 54-60)
//   +  AGY_BIN unresolvable        -> FATAL: agy not on PATH...         (lines 49-53, 111-115)
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const SCRIPT = resolve(import.meta.dir, "../scripts/probe-models.ts");
const FIXTURE = resolve(import.meta.dir, "fake-agy.ts");

type Run = { stdout: string; stderr: string; code: number };

function runProbe(
  args: string[],
  env: Record<string, string | undefined> = {},
): Run {
  // bounded: fixture replies instantly for every argv shape this suite exercises (no real
  // timeout branch is reachable without waiting out the script's hardcoded 120s model timeout).
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args], {
    env: { ...process.env, AGY_BIN: FIXTURE, ...env },
    maxBuffer: 1024 * 1024,
  });
  return {
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

describe("probe-models.ts CURRENT-behavior bracket", () => {
  test("rejects --__proto__ before resolving or launching Antigravity", () => {
    const { stdout, stderr, code } = runProbe(["--__proto__"], {
      AGY_BIN: "agy-does-not-exist-xyz",
    });
    expect(stderr).toContain("unknown option '--__proto__'");
    expect(stdout).toBe("");
    expect(code).toBe(2);
  });

  test("(a) no models: prints version + roster header verbatim, exits 0 on rc=0 roster", () => {
    const { stdout, stderr, code } = runProbe([], {
      FAKE_AGY_VERSION: "1.1.5",
      FAKE_AGY_MODELS_OUTPUT: "Gemini 3.5 Flash (Medium)\nClaude 4.6 Sonnet\n",
    });

    expect(stdout).toBe(
      "agy version: 1.1.5\n" +
        "roster (copy display strings VERBATIM — spaces/parens/capitalization are literal):\n" +
        "Gemini 3.5 Flash (Medium)\nClaude 4.6 Sonnet\n",
    );
    expect(stderr).toBe("");
    expect(code).toBe(0);
  });

  test("(a) no models: roster rc!=0 maps to exit 2", () => {
    const { code } = runProbe([], {
      FAKE_AGY_VERSION: "1.1.5",
      FAKE_AGY_MODELS_EXIT: "1",
    });

    expect(code).toBe(2);
  });

  test("(b) valid model: RESULT: AVAILABLE, exit 0", () => {
    const { stdout, code } = runProbe(["avail"], { FAKE_AGY_VERSION: "1.1.5" });

    expect(stdout).toContain(
      "RESULT: AVAILABLE avail (usage: n/a — agy exposes none)\n",
    );
    expect(code).toBe(0);
  });

  test("(c) invalid model name: RESULT: INVALID_NAME, exit 1", () => {
    const { stdout, code } = runProbe(["invalid"], {
      FAKE_AGY_VERSION: "1.1.5",
    });

    expect(stdout).toContain(
      "RESULT: INVALID_NAME invalid (exit 1) — not an EXACT `agy models` display name; " +
        "copy it verbatim incl. spaces/parens/capitalization\n",
    );
    expect(code).toBe(1);
  });

  test("(d) rc=0 but empty stdout: INCONCLUSIVE with the swallowed-error note, exit 1", () => {
    const { stdout, code } = runProbe(["rc0-empty"], {
      FAKE_AGY_VERSION: "1.1.5",
    });

    expect(stdout).toContain(
      "RESULT: INCONCLUSIVE rc0-empty (rc=0 but stdout != 'OK' (empty/other) — " +
        "possible <1.1.2 swallowed-error landmine (antigravity-cli#76))\n",
    );
    expect(code).toBe(1);
  });

  test("(d) rc=0 but non-OK stdout: same INCONCLUSIVE note, exit 1", () => {
    const { stdout, code } = runProbe(["rc0-other"], {
      FAKE_AGY_VERSION: "1.1.5",
    });

    expect(stdout).toContain(
      "RESULT: INCONCLUSIVE rc0-other (rc=0 but stdout != 'OK' (empty/other) — " +
        "possible <1.1.2 swallowed-error landmine (antigravity-cli#76))\n",
    );
    expect(code).toBe(1);
  });

  test("(d) non-zero rc: INCONCLUSIVE with rc=N note, plus first 2 matching error lines only", () => {
    const { stdout, code } = runProbe(["quota-error"], {
      FAKE_AGY_VERSION: "1.1.5",
    });

    expect(stdout).toBe(
      "RESULT: INCONCLUSIVE quota-error (rc=1)\n" +
        "  Error: quota exceeded for this project\n" +
        "  denied: RESOURCE_EXHAUSTED\n",
    );
    expect(stdout).not.toContain("harmless line");
    expect(code).toBe(1);
  });

  test("+ version below the 1.1.2 floor: WARNING on stderr, run still proceeds", () => {
    const { stdout, stderr, code } = runProbe(["avail"], {
      FAKE_AGY_VERSION: "1.1.1",
    });

    expect(stderr).toBe(
      "WARNING: agy 1.1.1 is below the 1.1.2 floor — invalid-model downgrade + " +
        "empty-stdout-swallow bugs may make probes unreliable (SKILL.md A1)\n",
    );
    expect(stdout).toContain("RESULT: AVAILABLE avail");
    expect(code).toBe(0);
  });

  test("+ AGY_BIN unresolvable: FATAL on stderr, exit 2, no RESULT line", () => {
    const { stdout, stderr, code } = runProbe(["avail"], {
      AGY_BIN: "/nonexistent/definitely-not-agy",
    });

    expect(stderr).toBe(
      "FATAL: agy not on PATH — environment problem, not a model result\n",
    );
    expect(stdout).toBe("");
    expect(code).toBe(2);
  });
});
