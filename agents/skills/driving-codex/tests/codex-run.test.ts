import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonOf, z } from "../../../hooks/zod.ts";
import { decodedJson } from "../../../hooks/tests/decode.ts";

/**
 * codex-run.ts as a real child process against a fake `codex` (CODEX_RUN_BIN). The fake logs its
 * argv and plays one mode: ok | fail | nolast | slow. SAFETY: CODEX_RUN_BIN is set in every run, so
 * the real, billed codex on PATH is never reachable from this suite.
 */

const script = resolve(import.meta.dir, "../scripts/codex-run.ts");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function scratch(): string {
  const d = mkdtempSync(join(tmpdir(), "codex-run-"));
  dirs.push(d);
  return d;
}

// The fake: writes the prompt-independent last message to the -o path, prints two turn.completed
// events (so the usage SUM is observable), and logs its argv one word per line.
function fakeCodex(dir: string): { bin: string; log: string } {
  const bin = join(dir, "codex");
  const log = join(dir, "argv.log");
  writeFileSync(
    bin,
    `#!/bin/sh
printf '%s\\n' "$@" > "${log}"
out=""; prev=""
for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
case "$FAKE_CODEX_MODE" in
  slow) sleep "\${FAKE_CODEX_SLEEP:-5}" ;;
  fail) echo 'ERROR: stream disconnected' >&2; exit 7 ;;
  nolast) echo '{"type":"turn.completed","usage":{"input_tokens":1,"cached_input_tokens":0,"output_tokens":1,"reasoning_output_tokens":0}}'; exit 0 ;;
esac
echo '{"type":"thread.started"}'
echo '{"type":"item.started","item":{"type":"command_execution","command":"bun test"}}'
echo '{"type":"item.completed","item":{"type":"file_change","changes":[{"path":"/w/kernel.ts"}]}}'
echo 'not json at all'
echo '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":40,"output_tokens":7,"reasoning_output_tokens":3}}'
echo '{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":0,"output_tokens":2,"reasoning_output_tokens":1}}'
printf 'VERDICT: fine\\n' > "$out"
exit 0
`,
  );
  chmodSync(bin, 0o755);
  return { bin, log };
}

const Receipt = z.object({
  schema: z.literal(1),
  outcome: z.enum(["ok", "codex-failed", "refused", "timeout"]),
  model: z.string().nullable(),
  elapsed_s: z.number(),
  receipt_file: z.string().nullable(),
  why: z.string().optional(),
  codex_exit: z.number().optional(),
  usage: z
    .object({
      input_tokens: z.number(),
      cached_input_tokens: z.number(),
      output_tokens: z.number(),
      reasoning_output_tokens: z.number(),
    })
    .optional(),
  last_message: z.string().optional(),
  stderr_tail: z.string().optional(),
});

type Run = {
  code: number;
  receipt: z.output<typeof Receipt>;
  stdout: string;
  stderr: string;
};
function run(
  args: string[],
  env: Record<string, string>,
  prompt = "Audit this.",
): Run {
  const dir = scratch();
  const promptFile = join(dir, "prompt.md");
  writeFileSync(promptFile, prompt);
  const p = Bun.spawnSync(
    [
      "bun",
      script,
      "--receipt-dir",
      join(dir, "receipts"),
      "--prompt-file",
      promptFile,
      ...args,
    ],
    // CODEX_RUN_HOST_FILE defaults to a path that does not exist: a box that really carries a host
    // declaration (a rented container) must not flip every sandbox assertion in this suite.
    {
      env: {
        ...process.env,
        CODEX_RUN_HOST_FILE: join(dir, "no-host.toml"),
        ...env,
      },
      stdin: "ignore",
      timeout: 30_000,
    },
  );
  const stdout = p.stdout.toString();
  const lines = stdout.trim().split("\n");
  return {
    code: p.exitCode ?? -1,
    receipt: decodedJson(Receipt, lines.at(-1) ?? ""),
    stdout,
    stderr: p.stderr.toString(),
  };
}
const FULL = [
  "--model",
  "gpt-6-luna",
  "--effort",
  "medium",
  "--sandbox",
  "read-only",
  "--cd",
  tmpdir(),
];

describe("codex-run", () => {
  test("ok: one receipt line, usage summed over every turn, last message, and the same receipt on disk", () => {
    const { bin, log } = fakeCodex(scratch());
    const r = run(FULL, { CODEX_RUN_BIN: bin });
    expect(r.code).toBe(0);
    expect(r.stdout.trim().split("\n")).toHaveLength(1);
    expect(r.receipt.outcome).toBe("ok");
    expect(r.receipt.usage).toEqual({
      input_tokens: 110,
      cached_input_tokens: 40,
      output_tokens: 9,
      reasoning_output_tokens: 4,
    });
    expect(r.receipt.last_message).toBe("VERDICT: fine");
    const file = r.receipt.receipt_file ?? "";
    expect(existsSync(file)).toBe(true);
    expect(decodedJson(Receipt, readFileSync(file, "utf8"))).toEqual(
      decodedJson(Receipt, r.stdout),
    );
    // C2: the triplet reaches codex explicitly, with --json and -o.
    const argv = readFileSync(log, "utf8").split("\n");
    for (const w of [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "-m",
      "gpt-6-luna",
      "read-only",
      'model_reasoning_effort="medium"',
      "-o",
    ])
      expect(argv).toContain(w);
    expect(r.stderr).toContain(
      "codex-run: started gpt-6-luna effort=medium sandbox=read-only",
    );
    expect(r.stderr).toMatch(/codex-run: ok after \d+(\.\d)? s — receipt /u);
  });

  test.each([
    [
      "missing model, effort, sandbox and cd",
      [],
      "missing --model, --effort, --sandbox, --cd",
    ],
    [
      "a model below its family's floor",
      [
        "--model",
        "gpt-5.6-luna",
        "--effort",
        "medium",
        "--sandbox",
        "read-only",
        "--cd",
        ".",
      ],
      "model-floor:",
    ],
    [
      "a model family with no floor",
      [
        "--model",
        "gpt-9-nova",
        "--effort",
        "medium",
        "--sandbox",
        "read-only",
        "--cd",
        ".",
      ],
      "model-floor:",
    ],
    [
      "danger-full-access",
      [
        "--model",
        "gpt-6-luna",
        "--effort",
        "medium",
        "--sandbox",
        "danger-full-access",
        "--cd",
        ".",
      ],
      "isolated runner only",
    ],
    [
      "effort ultra",
      [
        "--model",
        "gpt-6-luna",
        "--effort",
        "ultra",
        "--sandbox",
        "read-only",
        "--cd",
        ".",
      ],
      "cannot admit",
    ],
    [
      "a timeout above the ceiling",
      [...FULL, "--timeout-s", "99999"],
      "--timeout-s must be an integer",
    ],
  ])(
    "refuses %s before codex starts (exit 2, the reason in the receipt)",
    (_name, args, why) => {
      const { bin, log } = fakeCodex(scratch());
      const r = run(args, { CODEX_RUN_BIN: bin });
      expect(r.code).toBe(2);
      expect(r.receipt.outcome).toBe("refused");
      expect(r.receipt.why).toContain(why);
      expect(existsSync(log)).toBe(false);
    },
  );

  test("a host declaration runs codex unsandboxed, says so on stderr, and records why", () => {
    const dir = scratch();
    const { bin, log } = fakeCodex(dir);
    const host = join(dir, "host.toml");
    writeFileSync(
      host,
      'schema = 1\nunsandboxed_reason = "Vast container: seccomp blocks user namespaces"\n',
    );
    const r = run(FULL, { CODEX_RUN_BIN: bin, CODEX_RUN_HOST_FILE: host });
    expect(r.code).toBe(0);
    const argv = readFileSync(log, "utf8").split("\n");
    expect(argv).toContain("danger-full-access");
    expect(argv).not.toContain("read-only");
    expect(r.stderr).toContain(
      "UNSANDBOXED: asked for read-only, running danger-full-access",
    );
    expect(r.stderr).toContain("seccomp blocks user namespaces");
    const Sandbox = z.object({
      sandbox: z.string(),
      sandbox_effective: z.string(),
      unsandboxed_reason: z.string(),
    });
    expect(decodedJson(Sandbox, r.stdout.trim())).toEqual({
      sandbox: "read-only",
      sandbox_effective: "danger-full-access",
      unsandboxed_reason: "Vast container: seccomp blocks user namespaces",
    });
  });

  test("CODEX_RUN_PROGRESS_FILE gets the final progress record (the statusline Run: row's source)", () => {
    const dir = scratch();
    const { bin } = fakeCodex(dir);
    const file = join(dir, "run.progress.json");
    const r = run(FULL, { CODEX_RUN_BIN: bin, CODEX_RUN_PROGRESS_FILE: file });
    expect(r.code).toBe(0);
    const Progress = z.object({
      schema: z.literal(1),
      last: z.string(),
      commands: z.number(),
      files: z.number(),
    });
    expect(decodedJson(Progress, readFileSync(file, "utf8"))).toEqual({
      schema: 1,
      last: "✎ kernel.ts",
      commands: 1,
      files: 1,
    });
    // usage is still summed from the same stream the progress was folded from
    expect(r.receipt.usage?.input_tokens).toBe(110);
  });

  test("no host declaration: the asked sandbox, and the receipt says so", () => {
    const { bin } = fakeCodex(scratch());
    const r = run(FULL, { CODEX_RUN_BIN: bin });
    const Sandbox = z.object({
      sandbox_effective: z.string(),
      unsandboxed_reason: z.null(),
    });
    expect(decodedJson(Sandbox, r.stdout.trim())).toEqual({
      sandbox_effective: "read-only",
      unsandboxed_reason: null,
    });
    expect(r.stderr).not.toContain("UNSANDBOXED");
  });

  test.each([
    ["an empty reason", 'schema = 1\nunsandboxed_reason = "  "\n'],
    [
      "an unknown key",
      'schema = 1\nunsandboxed_reason = "x"\nnetwork = true\n',
    ],
    ["not TOML", "schema = = 1\n"],
  ])(
    "a malformed host declaration (%s) is refused before codex starts",
    (_name, text) => {
      const dir = scratch();
      const { bin, log } = fakeCodex(dir);
      const host = join(dir, "host.toml");
      writeFileSync(host, text);
      const r = run(FULL, { CODEX_RUN_BIN: bin, CODEX_RUN_HOST_FILE: host });
      expect(r.code).toBe(2);
      expect(r.receipt.why).toContain("is not a valid host declaration");
      expect(existsSync(log)).toBe(false);
    },
  );

  test("--emit-envelope writes a P7 envelope for exactly this call and runs no codex", () => {
    const dir = scratch();
    const { bin, log } = fakeCodex(dir);
    const path = join(dir, "job.resource.json");
    const p = Bun.spawnSync(
      [
        "bun",
        script,
        ...FULL,
        "--timeout-s",
        "300",
        "--emit-envelope",
        path,
        "--job-id",
        "luna-verify-1",
      ],
      {
        env: { ...process.env, CODEX_RUN_BIN: bin },
        stdin: "ignore",
        timeout: 30_000,
      },
    );
    expect(p.exitCode).toBe(0);
    expect(existsSync(log)).toBe(false);
    const env = jsonOf(
      z.object({
        schema: z.literal(1),
        job_id: z.literal("luna-verify-1"),
        child_fanout: z.literal(0),
        walltime_seconds: z.literal(330),
        device: z.object({
          kind: z.literal("cpu"),
          gpu_status: z.literal("not-beneficial"),
        }),
      }),
    ).safeParse(readFileSync(path, "utf8"));
    expect(env.success).toBe(true);
  });

  test("--emit-envelope still refuses what a run would refuse", () => {
    const dir = scratch();
    const path = join(dir, "job.resource.json");
    const p = Bun.spawnSync(
      [
        "bun",
        script,
        "--model",
        "gpt-5.6-luna",
        "--effort",
        "low",
        "--sandbox",
        "read-only",
        "--cd",
        ".",
        "--emit-envelope",
        path,
      ],
      { stdin: "ignore", timeout: 30_000 },
    );
    expect(p.exitCode).toBe(2);
    expect(existsSync(path)).toBe(false);
  });

  test("--choice takes model and effort from the roster's luna row", () => {
    const { bin, log } = fakeCodex(scratch());
    const r = run(
      ["--choice", "luna-max", "--sandbox", "read-only", "--cd", tmpdir()],
      { CODEX_RUN_BIN: bin },
    );
    expect(r.code).toBe(0);
    expect(r.receipt.model).toBe("gpt-6-luna");
    const argv = readFileSync(log, "utf8").split("\n");
    expect(argv).toContain('model_reasoning_effort="max"');
  });

  test.each([
    [["--choice", "sonnet-high"], "is not a luna row"],
    [["--choice", "luna-high", "--model", "gpt-6-luna"], "not both"],
  ])("--choice %p is refused before codex starts", (args, why) => {
    const { bin, log } = fakeCodex(scratch());
    const r = run([...args, "--sandbox", "read-only", "--cd", tmpdir()], {
      CODEX_RUN_BIN: bin,
    });
    expect(r.code).toBe(2);
    expect(r.receipt.why).toContain(why);
    expect(existsSync(log)).toBe(false);
  });

  test("an empty prompt is refused", () => {
    const { bin, log } = fakeCodex(scratch());
    const r = run(FULL, { CODEX_RUN_BIN: bin }, "   \n");
    expect(r.code).toBe(2);
    expect(r.receipt.why).toContain("empty prompt");
    expect(existsSync(log)).toBe(false);
  });

  test("codex failing is exit 1 with its exit code and stderr tail in the receipt", () => {
    const { bin } = fakeCodex(scratch());
    const r = run(FULL, { CODEX_RUN_BIN: bin, FAKE_CODEX_MODE: "fail" });
    expect(r.code).toBe(1);
    expect(r.receipt.outcome).toBe("codex-failed");
    expect(r.receipt.codex_exit).toBe(7);
    expect(r.receipt.stderr_tail).toContain("stream disconnected");
  });

  test("exit 0 with no last message is a failure, not success", () => {
    const { bin } = fakeCodex(scratch());
    const r = run(FULL, { CODEX_RUN_BIN: bin, FAKE_CODEX_MODE: "nolast" });
    expect(r.code).toBe(1);
    expect(r.receipt.why).toContain("wrote no last message");
  });

  test("a run past --timeout-s is killed, exit 3, and says so; the wait is never silent", () => {
    const { bin } = fakeCodex(scratch());
    const t0 = performance.now();
    const r = run([...FULL, "--timeout-s", "3"], {
      CODEX_RUN_BIN: bin,
      FAKE_CODEX_MODE: "slow",
      FAKE_CODEX_SLEEP: "20",
      CODEX_RUN_HEARTBEAT_S: "1",
    });
    expect(performance.now() - t0).toBeLessThan(10_000);
    expect(r.code).toBe(3);
    expect(r.receipt.outcome).toBe("timeout");
    expect(r.receipt.why).toContain("3 s bound");
    expect(r.stderr).toMatch(
      /codex-run: waiting for gpt-6-luna \(\d+(\.\d)? s of 3 s\)…/u,
    );
  }, 20_000);
});
