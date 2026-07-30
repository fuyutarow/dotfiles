// Characterization tests for scripts/probe-models.ts (PHASE: CHARACTERIZE, G2).
// These pin the CURRENT behavior of the source file byte-for-byte — they are the
// bracket for a later refactor, not a spec for new behavior. Every assertion below
// carries a probe-models.ts:<line> receipt in the sibling comment.
//
// probe-models.ts has NO exports and NO `import.meta.main` guard (grep receipt:
// no `export` token in the file) — `main().catch(...)` runs unconditionally at
// module load (probe-models.ts:133-138). It can only be exercised as a real
// subprocess: `bun scripts/probe-models.ts [models...]`, never imported.
//
// SAFETY (HARD RULE): a real `grok` binary is on this host's PATH
// (/home/linuxbrew/.linuxbrew/bin/grok). Every spawn below sets GROK explicitly
// to the fake-grok.ts fixture (or a deliberately-bogus path) and never lets the
// script fall through to a bare "grok" lookup against the real PATH.

import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const SCRIPT = resolve(import.meta.dir, "../scripts/probe-models.ts");
const FIXTURE = resolve(import.meta.dir, "fake-grok.ts");
// The real bun binary's absolute path (bypasses any PATH lookup entirely —
// important for the PATH-restricted GROK-unset test below, since the mise
// shim at `Bun.which("bun")` needs PATH to resolve ITS OWN backing install).
const BUN_BIN = process.execPath;

type Ran = Readonly<{ stdout: string; stderr: string; exitCode: number }>;

async function runProbe(
  args: string[],
  env: Record<string, string | undefined>,
): Promise<Ran> {
  const child = Bun.spawn([BUN_BIN, SCRIPT, ...args], {
    env: { ...process.env, ...env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("probe-models.ts — no-args mode (version + roster)", () => {
  test("rejects --__proto__ before resolving or launching Grok", async () => {
    const run = await runProbe(["--__proto__"], {
      GROK: "grok-does-not-exist-xyz",
    });
    expect(run.stderr).toContain("unknown option '--__proto__'");
    expect(run.stdout).toBe("");
    expect(run.exitCode).toBe(2);
  });

  // receipts: probe-models.ts:60-69 (no-args branch), :61 (--version, 30_000ms),
  // :62 (models, 60_000ms), :64-66 (fixed roster banner line), :68 (exit rule).
  test("(a) prints version output, the fixed banner, then roster output; exit 0 when both succeed", async () => {
    const run = await runProbe([], { GROK: FIXTURE });

    expect(run.stdout).toBe(
      "grok version 9.9.9-fake\n" +
        "roster (copy model ids VERBATIM from this list — -m rejects anything else client-side):\n" +
        "grok-4.5\ngrok-4.5-fast\n",
    );
    expect(run.stderr).toBe("");
    expect(run.exitCode).toBe(0);
  });

  test("exits 2 when the roster sub-call fails, but still relays both outputs", async () => {
    const run = await runProbe([], {
      GROK: FIXTURE,
      FAKE_GROK_MODELS_FAIL: "1",
    });

    // run()'s output is stdout+stderr of the CHILD merged (probe-models.ts:35),
    // and the parent relays that merged blob on its OWN stdout (:67) — so the
    // fixture's stderr line surfaces on the parent's stdout, not its stderr.
    expect(run.stdout).toBe(
      "grok version 9.9.9-fake\n" +
        "roster (copy model ids VERBATIM from this list — -m rejects anything else client-side):\n" +
        "fake roster fetch failed\n",
    );
    expect(run.stderr).toBe("");
    expect(run.exitCode).toBe(2);
  });
});

describe("probe-models.ts — args mode (per-model probe)", () => {
  // receipts: probe-models.ts:74-89 (loop + run() call, -p/-m/--output-format
  // json/--sandbox read-only, cwd=probeDir, timeout 120_000ms), :90-106 (AVAILABLE).
  test("(b) AVAILABLE: exact-text OK reply with usage.total_tokens relayed verbatim", async () => {
    const run = await runProbe(["good-model"], { GROK: FIXTURE });

    expect(run.stdout).toBe(
      "RESULT: AVAILABLE good-model (usage.total_tokens: 123)\n",
    );
    expect(run.exitCode).toBe(0);
  });

  test('AVAILABLE with no usage field renders usage.total_tokens as "?"', async () => {
    const run = await runProbe(["no-usage-model"], { GROK: FIXTURE });

    expect(run.stdout).toBe(
      "RESULT: AVAILABLE no-usage-model (usage.total_tokens: ?)\n",
    );
    expect(run.exitCode).toBe(0);
  });

  // receipts: probe-models.ts:107-110 (INVALID_NAME branch — the exact message
  // interpolates process.env.GROK ?? "grok", which here is the fixture path we
  // ourselves set).
  test("(c) INVALID_NAME: `unknown model id` substring in output short-circuits to the naming verdict", async () => {
    const run = await runProbe(["unknown-model"], { GROK: FIXTURE });

    expect(run.stdout).toBe(
      `RESULT: INVALID_NAME unknown-model (exit 1) — not an exact model id (\`${FIXTURE} models\` or references/model-catalog.md); copy it verbatim\n`,
    );
    expect(run.exitCode).toBe(1);
  });

  // receipts: probe-models.ts:40-51 (jsonRecord — non-JSON/non-object parses to
  // undefined), :111-117 (INCONCLUSIVE note for rc=0 but text != "OK").
  test("(d1) INCONCLUSIVE: rc=0 but the body is not JSON at all", async () => {
    const run = await runProbe(["malformed-model"], { GROK: FIXTURE });

    expect(run.stdout).toBe(
      'RESULT: INCONCLUSIVE malformed-model (rc=0 but .text != "OK" (empty/malformed json, or a genuinely different reply) — not a clean AVAILABLE)\n',
    );
    expect(run.exitCode).toBe(1);
  });

  test('(d2) INCONCLUSIVE: rc=0, valid JSON object, but .text is not exactly "OK"', async () => {
    const run = await runProbe(["wrong-text-model"], { GROK: FIXTURE });

    expect(run.stdout).toBe(
      'RESULT: INCONCLUSIVE wrong-text-model (rc=0 but .text != "OK" (empty/malformed json, or a genuinely different reply) — not a clean AVAILABLE)\n',
    );
    expect(run.exitCode).toBe(1);
  });

  test("(d3) INCONCLUSIVE: a JSON array parses but jsonRecord rejects non-object top level", async () => {
    const run = await runProbe(["array-json-model"], { GROK: FIXTURE });

    expect(run.stdout).toBe(
      'RESULT: INCONCLUSIVE array-json-model (rc=0 but .text != "OK" (empty/malformed json, or a genuinely different reply) — not a clean AVAILABLE)\n',
    );
    expect(run.exitCode).toBe(1);
  });

  // receipts: probe-models.ts:111-124 (non-timeout, non-zero rc → `rc=N` note,
  // plus the first 2 lines matching /Error|error|denied|quota|auth/, dropping
  // any further matches — the .slice(0, 2) bound).
  test("(d4) INCONCLUSIVE: non-zero rc note is `rc=<code>`, and only the first 2 matching diagnostic lines are echoed", async () => {
    const run = await runProbe(["denied-model"], { GROK: FIXTURE });

    expect(run.stdout).toBe(
      "RESULT: INCONCLUSIVE denied-model (rc=2)\n" +
        "  Error: permission denied for model\n" +
        "  Error: quota exceeded this month\n",
    );
    expect(run.exitCode).toBe(1);
  });

  // receipt: probe-models.ts:74 loop iterates every model — no short-circuit —
  // and :130 exit rule: any failure among N models makes the whole run exit 1.
  test("processes every model in argv order and exits 1 if any one is not AVAILABLE", async () => {
    const run = await runProbe(["good-model", "unknown-model"], {
      GROK: FIXTURE,
    });

    expect(run.stdout).toBe(
      "RESULT: AVAILABLE good-model (usage.total_tokens: 123)\n" +
        `RESULT: INVALID_NAME unknown-model (exit 1) — not an exact model id (\`${FIXTURE} models\` or references/model-catalog.md); copy it verbatim\n`,
    );
    expect(run.exitCode).toBe(1);
  });

  // receipt: probe-models.ts:130 — all-AVAILABLE run exits 0.
  test("exits 0 when every probed model is AVAILABLE", async () => {
    const run = await runProbe(["good-model", "no-usage-model"], {
      GROK: FIXTURE,
    });

    expect(run.exitCode).toBe(0);
  });

  // receipt: probe-models.ts:71 (mkdtemp under os.tmpdir(), "driving-grok-"
  // prefix) + :127-129 (finally: rm probeDir recursive+force) — the throwaway
  // probe dir must not survive the run.
  test("the mkdtemp probe dir is created and removed (finally-cleanup)", async () => {
    const before = new Set(
      (await readdir(tmpdir())).filter((name) =>
        name.startsWith("driving-grok-"),
      ),
    );

    await runProbe(["good-model"], { GROK: FIXTURE });

    const after = (await readdir(tmpdir())).filter(
      (name) => name.startsWith("driving-grok-") && !before.has(name),
    );
    expect(after).toEqual([]);
  });
});

describe("probe-models.ts — GROK-not-found FATAL path", () => {
  // receipts: probe-models.ts:54-58 (Bun.which(GROK ?? "grok") null → throw),
  // :133-138 (main().catch → `FATAL: <message>\n` on stderr, exit 2; nothing on
  // stdout since the throw happens before any process.stdout.write call).
  test("GROK set to a nonexistent path: FATAL on stderr, exit 2, no stdout", async () => {
    const bogus = "/no/such/grok-binary-for-probe-grok-tests";
    const run = await runProbe([], { GROK: bogus });

    expect(run.stdout).toBe("");
    expect(run.stderr).toBe(
      `FATAL: ${bogus} not on PATH — environment problem, not a model result\n`,
    );
    expect(run.exitCode).toBe(2);
  });

  test('GROK unset falls back to the literal label "grok" in the FATAL message (grok\'s one PATH dir excised so the real binary on this host is unreachable, everything else — incl. the mise bun shim — left intact)', async () => {
    // Surgical PATH filter: drop ONLY the directory that resolves the real
    // `grok` on this host (verified above via a PATH scan), keep every other
    // entry so the mise-shimmed `bun` we spawn with can still bootstrap itself.
    const grokDir = dirname(Bun.which("grok") ?? "");
    const filteredPath = (process.env.PATH ?? "")
      .split(":")
      .filter((dir) => dir !== grokDir && dir.length > 0)
      .join(":");
    const env: Record<string, string | undefined> = {
      ...process.env,
      PATH: filteredPath,
    };
    env.GROK = undefined;
    const child = Bun.spawn([BUN_BIN, SCRIPT], {
      env: env as Record<string, string>,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    expect(stdout).toBe("");
    expect(stderr).toBe(
      "FATAL: grok not on PATH — environment problem, not a model result\n",
    );
    expect(exitCode).toBe(2);
  });
});

// NOT PINNED (documented gap, not an oversight): the 120_000ms per-model timeout
// (probe-models.ts:88) and the 30_000ms/60_000ms no-args timeouts (:61-62) are
// hardcoded — no env/flag override exists in the source — so reaching the real
// `timedOut` branch (note: "timeout — not a catalog verdict", probe-models.ts:112)
// requires an actual ~120s wait per case. Left unpinned here as impractical for
// a fast characterization suite; the INCONCLUSIVE branch itself (same RESULT:
// line shape, differing only in the parenthetical note) is pinned above via the
// non-timeout rc!=0 and malformed-json cases (d1-d4).
