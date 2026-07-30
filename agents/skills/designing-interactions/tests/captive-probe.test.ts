// Fixture-binary tests for scripts/captive-probe.ts — every case spawns the REAL probe against a
// REAL executable, so the timeout, pipe-drain, and exit-code paths are actually exercised.
// Run: bun test agents/skills/designing-interactions/tests
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PROBE = join(ROOT, "scripts", "captive-probe.ts");
const FIXTURES = join(ROOT, "tests", "fixtures");

type Envelope = {
  status: string;
  command: string[];
  exit_code: number | null;
  timed_out: boolean;
  findings: { level: string; code: string; detail: string }[];
};

async function probe(
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const child = Bun.spawn({
    cmd: ["bun", PROBE, ...args],
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    signal: AbortSignal.timeout(30_000),
  });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode: child.exitCode ?? -1, stdout, stderr };
}

async function codes(
  args: string[],
): Promise<{ exitCode: number; envelope: Envelope }> {
  const result = await probe(["--json", ...args]);
  return {
    exitCode: result.exitCode,
    envelope: JSON.parse(result.stdout) as Envelope,
  };
}

// Fixtures are spawned as real executables (shebang + exec bit), not via `bun <path>` — that is
// the whole point of the fixture-binary pattern: the probe must face a genuine process.
const fixture = (name: string): string[] => ["--", join(FIXTURES, name)];

describe("captive-probe findings", () => {
  test("FAIL HANG on a process that never exits", async () => {
    const { exitCode, envelope } = await codes([
      "--timeout",
      "1500",
      ...fixture("hangs.ts"),
    ]);
    expect(envelope.findings.map((f) => f.code)).toContain("HANG");
    expect(envelope.timed_out).toBe(true);
    expect(envelope.exit_code).toBeNull();
    expect(exitCode).toBe(1);
  });

  test("FAIL PROMPT-WITHOUT-TTY on a question with no stdin", async () => {
    const { exitCode, envelope } = await codes(fixture("prompts.ts"));
    expect(envelope.findings.map((f) => f.code)).toContain(
      "PROMPT-WITHOUT-TTY",
    );
    expect(envelope.timed_out).toBe(false);
    expect(exitCode).toBe(1);
  });

  test("WARN ANSI-TO-PIPE and CR-FLOOD do not gate the exit code", async () => {
    const { exitCode, envelope } = await codes(fixture("decorated.ts"));
    const found = envelope.findings.map((f) => f.code);
    expect(found).toContain("ANSI-TO-PIPE");
    expect(found).toContain("CR-FLOOD");
    expect(envelope.findings.every((f) => f.level === "WARN")).toBe(true);
    expect(exitCode).toBe(0);
  });

  test("FAIL SILENT-FAILURE only when the caller declares the invocation should fail", async () => {
    const declared = await codes([
      "--expect-fail",
      ...fixture("quiet-failure.ts"),
    ]);
    expect(declared.envelope.findings.map((f) => f.code)).toContain(
      "SILENT-FAILURE",
    );
    expect(declared.exitCode).toBe(1);

    const undeclared = await codes(fixture("quiet-failure.ts"));
    expect(undeclared.envelope.findings.map((f) => f.code)).not.toContain(
      "SILENT-FAILURE",
    );
  });

  test("WARN ERROR-ON-STDOUT when a non-zero exit reports only on the payload channel", async () => {
    const { envelope } = await codes([
      ...fixture("quiet-failure.ts"),
      "--really-fail",
    ]);
    expect(envelope.findings.map((f) => f.code)).toContain("ERROR-ON-STDOUT");
    expect(envelope.exit_code).toBe(3);
  });

  test("OK on the well-behaved control", async () => {
    const { exitCode, envelope } = await codes(fixture("clean.ts"));
    expect(envelope.findings).toHaveLength(0);
    expect(envelope.status).toBe("ok");
    expect(exitCode).toBe(0);
  });
});

describe("captive-probe contract", () => {
  test("passes the probed command's own flags through untouched", async () => {
    const { envelope } = await codes(["--", "sh", "-c", "printf ok"]);
    expect(envelope.command).toEqual(["sh", "-c", "printf ok"]);
  });

  test("verdict lines are the default consumer; --json switches to the envelope", async () => {
    const lines = await probe(fixture("prompts.ts"));
    expect(lines.stdout).toStartWith("FAIL PROMPT-WITHOUT-TTY:");
    expect(() => JSON.parse(lines.stdout)).toThrow();
  });

  test("exits 2 with usage on no command", async () => {
    const result = await probe([]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("usage:");
    expect(result.stdout).toBe("");
  });

  test("accepts the separator in either position — bun eats a leading `--`, not a later one", async () => {
    // `--` first (bun consumes it) and `--` after a flag (bun keeps it) must both work.
    const leading = await codes(fixture("clean.ts"));
    const later = await codes(["--timeout", "5000", ...fixture("clean.ts")]);
    expect(leading.envelope.command).toEqual(later.envelope.command);
    expect(leading.exitCode).toBe(0);
    expect(later.exitCode).toBe(0);
  });

  test("rejects an unknown flag instead of silently accepting it (type-flag is not strict)", async () => {
    const result = await probe(["--bogus", "1", "--", "true"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("unknown flag(s): --bogus");
  });

  test("rejects --__proto__ before launching the probed command", async () => {
    const result = await probe(["--__proto__", "--", "true"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("unknown flag(s): --__proto__");
    expect(result.stdout).toBe("");
  });

  test("exits 2 on an unparsable timeout", async () => {
    const result = await probe(["--timeout", "nope", "--", "true"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--timeout");
  });

  test("exits 2 when the probed command is not on PATH", async () => {
    const result = await probe(["--", "definitely-not-a-real-command-xyz"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toStartWith("FATAL:");
  });
});
