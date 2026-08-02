import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * CHARACTERIZATION tests for scripts/probe-models.ts (oracle-first, G2).
 *
 * probe-models.ts calls `main()` unconditionally at module load (no
 * `if (import.meta.main)` guard) and reads real `Bun.argv`, so it CANNOT be
 * imported in-process without immediately executing against the test
 * runner's own argv. Every test here invokes it exactly as a real caller
 * would: `bun scripts/probe-models.ts <model> [...]` as a child process,
 * with CODEX_BIN / PROBE_DIR — the only two env overrides the source reads
 * (scripts/probe-models.ts:53 and :58) — pointed at a fake binary and a
 * scratch cwd.
 *
 * SAFETY: a real `codex` binary is on this machine's PATH (confirmed via
 * `which codex` during characterization). CODEX_BIN is therefore set
 * explicitly in every single test below, including the "missing binary"
 * case (set to a bogus name) — never left unset — so the real, billed/
 * networked codex CLI is never reachable through this suite.
 */

const script = resolve(import.meta.dir, "../scripts/probe-models.ts");
const fixture = resolve(import.meta.dir, "fake-codex.ts");

type ProbeRun = Readonly<{
  stdout: string;
  stderr: string;
  exitCode: number;
}>;

async function runProbe(
  args: string[],
  env: Record<string, string>,
): Promise<ProbeRun> {
  const proc = Bun.spawn(["bun", script, ...args], {
    env: { ...process.env, ...env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function withProbeDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "probe-models-test-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("driving-codex probe-models.ts (current behavior, pre-refactor bracket)", () => {
  test("(a) available model: exact RESULT line, exit 0, nothing on stderr", async () => {
    const run = await withProbeDir((dir) =>
      runProbe(["gpt-good"], { CODEX_BIN: fixture, PROBE_DIR: dir }),
    );
    expect(run.stdout).toBe("RESULT: AVAILABLE gpt-good (1234total tokens)\n");
    expect(run.stderr).toBe("");
    expect(run.exitCode).toBe(0);
  });

  test("(b) rejected model: exact RESULT + capped ERROR lines + 400-ambiguity note, exit 1", async () => {
    const run = await withProbeDir((dir) =>
      runProbe(["gpt-bad"], { CODEX_BIN: fixture, PROBE_DIR: dir }),
    );
    expect(run.stdout).toBe(
      "RESULT: UNAVAILABLE gpt-bad (exit 1)\n" +
        "  ERROR: request failed\n" +
        "  stream connection closed\n" +
        "  note: 400 is AMBIGUOUS — a wrong/short ID of a real model errors identically to a not-rolled-out one; verify the exact ID (references/model-catalog.md) before concluding non-existence\n",
    );
    expect(run.stderr).toBe("");
    expect(run.exitCode).toBe(1);
  });

  test("exit 127 gets its own 'codex not runnable' annotation, independent of the ERROR/stream matcher", async () => {
    const run = await withProbeDir((dir) =>
      runProbe(["gpt-native-fail"], { CODEX_BIN: fixture, PROBE_DIR: dir }),
    );
    expect(run.stdout).toBe(
      "RESULT: UNAVAILABLE gpt-native-fail (exit 127) — codex not runnable, environment problem\n",
    );
    expect(run.stderr).toBe("");
    expect(run.exitCode).toBe(1);
  });

  test("PROBE_DIR is honored as the spawned child's actual cwd", async () => {
    const run = await withProbeDir((dir) =>
      runProbe(["gpt-echo-cwd"], { CODEX_BIN: fixture, PROBE_DIR: dir }).then(
        (result) => ({ result, dir }),
      ),
    );
    expect(run.result.stdout).toBe(
      `RESULT: UNAVAILABLE gpt-echo-cwd (exit 1)\n  ERROR: cwd=${run.dir}\n`,
    );
    expect(run.result.exitCode).toBe(1);
  });

  test("(c) missing codex binary: exact FATAL line on stderr, empty stdout, exit 2", async () => {
    const run = await runProbe(["gpt-good"], {
      CODEX_BIN: "codex-does-not-exist-xyz-a1b2c3",
    });
    expect(run.stderr).toBe(
      "FATAL: codex not on PATH — environment problem, not a model result\n",
    );
    expect(run.stdout).toBe("");
    expect(run.exitCode).toBe(2);
  });

  test("no model argument: Cleye usage error precedes the codex-on-PATH check", async () => {
    // CODEX_BIN deliberately left bogus too: Cleye's required positional guard fires
    // before Bun.which is ever called, so this must not be the PATH FATAL.
    const run = await runProbe([], {
      CODEX_BIN: "codex-does-not-exist-xyz-a1b2c3",
    });
    expect(run.stderr).toBe('Error: Missing required parameter "models"\n\n');
    expect(run.stdout).toContain("USAGE:");
    expect(run.stdout).toContain("probe-models.ts [flags...] <models...>");
    expect(run.exitCode).toBe(1);
  });

  test("rejects --__proto__ before resolving or launching Codex", async () => {
    const run = await runProbe(["--__proto__"], {
      CODEX_BIN: "codex-does-not-exist-xyz-a1b2c3",
    });
    expect(run.stderr).toContain("unknown option '--__proto__'");
    expect(run.stdout).toBe("");
    expect(run.exitCode).toBe(2);
  });

  test("mixed run: one available + one rejected model still exits 1 overall, in argv order", async () => {
    const run = await withProbeDir((dir) =>
      runProbe(["gpt-good", "gpt-bad"], {
        CODEX_BIN: fixture,
        PROBE_DIR: dir,
      }),
    );
    expect(run.stdout).toBe(
      "RESULT: AVAILABLE gpt-good (1234total tokens)\n" +
        "RESULT: UNAVAILABLE gpt-bad (exit 1)\n" +
        "  ERROR: request failed\n" +
        "  stream connection closed\n" +
        "  note: 400 is AMBIGUOUS — a wrong/short ID of a real model errors identically to a not-rolled-out one; verify the exact ID (references/model-catalog.md) before concluding non-existence\n",
    );
    expect(run.exitCode).toBe(1);
  });
});

/**
 * (d) Timeout path — NOT pinned here, by design; recorded per the task's own
 * escape hatch ("if not [reachable without editing the script], record why
 * in notes and do NOT add an override").
 *
 * scripts/probe-models.ts:78 hardcodes `120_000` as a literal argument at the
 * `run()` call site. Unlike driving-claude's probe-models.ts (which exports
 * `probeModels()`/`RunConfig` with an injectable `timeoutMs`, letting its own
 * test drive a 20ms timeout in-process), this file exports nothing — `run`
 * and `main` are module-private — and there is no env var read anywhere in
 * the source (grepped: only CODEX_BIN at line 53 and PROBE_DIR at line 58)
 * that can shrink the 120s wait. Reaching `timedOut === true` for real would
 * require a fixture that actually sleeps ~120s and a test that waits it out
 * end-to-end — neither "small" nor "env-controlled", the task's own bar for
 * attempting this without touching the script. Adding a
 * PROBE_TIMEOUT_MS-style override would itself be the behavior change this
 * CHARACTERIZE phase must not introduce. Left unpinned; flagged in
 * argue_back/notes for the refactor phase to decide whether the eventual
 * rewrite should make the timeout injectable (which would then let a fast
 * test pin it).
 */
