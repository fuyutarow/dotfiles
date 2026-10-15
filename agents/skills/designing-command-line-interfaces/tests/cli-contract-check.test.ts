import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../scripts/cli-contract-check.ts");
const validFixture = resolve(import.meta.dir, "fixtures/valid-contract.md");
const temporaryDirectories: string[] = [];

setDefaultTimeout(15_000);

type RunResult = Readonly<{ exitCode: number; stderr: string; stdout: string }>;

async function fixture(content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "cli-contract-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "CLI-CONTRACT.md");
  await writeFile(path, content);
  return path;
}

async function validContract(): Promise<string> {
  return readFile(validFixture, "utf8");
}

async function run(path: string): Promise<RunResult> {
  const process = Bun.spawn({
    cmd: ["bun", script, path],
    stderr: "pipe",
    stdout: "pipe",
  });
  const timeout = setTimeout(() => {
    process.kill("SIGKILL");
  }, 10_000);
  return Promise.all([
    process.exited,
    new Response(process.stderr).text(),
    new Response(process.stdout).text(),
  ])
    .then(([exitCode, stderr, stdout]) => ({ exitCode, stderr, stdout }))
    .finally(() => {
      clearTimeout(timeout);
    });
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { force: true, recursive: true });
  }
});

describe("cli-contract-check", () => {
  test("accepts a complete contract", async () => {
    const result = await run(validFixture);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("C0  PASS");
    expect(result.stdout).toContain("CLI CONTRACT: FAIL=0");
    expect(result.stderr).toBe("");
  });

  test("rejects a missing required receipt", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(/- Negative receipt:.*\n/u, ""),
      ),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("required field: Negative receipt");
  });

  test("rejects a contract that never says what a human sees during a wait", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(/- Waits \/ liveness:.*\n/u, ""),
      ),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("required field: Waits / liveness");
  });

  test("rejects a placeholder where fallbacks and handoffs belong; an explicit none passes", async () => {
    const contract = await validContract();
    const placeholder = contract.replace(
      /- Fallbacks \/ handoffs:.*\n/u,
      "- Fallbacks / handoffs: TBD\n",
    );
    const result = await run(await fixture(placeholder));
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("placeholder value: Fallbacks / handoffs");
    const none = contract.replace(
      /- Fallbacks \/ handoffs:.*\n/u,
      "- Fallbacks / handoffs: none\n",
    );
    expect((await run(await fixture(none))).exitCode).toBe(0);
  }, 15_000);

  test("rejects duplicate fields", async () => {
    const result = await run(
      await fixture((await validContract()) + "\n- Consumer regimes: ci\n"),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("duplicate field: Consumer regimes");
  });

  test("rejects placeholders", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(
          "Parser profile: target parser rejects unknown flags and treats `--` as end of options.",
          "Parser profile: {{choose parser profile}}",
        ),
      ),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("placeholder value: Parser profile");
  });

  test("rejects a visible placeholder in a table cell", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(
          "inspect local state",
          "{{describe work}}",
        ),
      ),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("visible placeholder at line");
  });

  test("accepts a visible synopsis metavariable", async () => {
    const result = await run(
      await fixture((await validContract()).replace("PATH...", "<path>")),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("CLI CONTRACT: FAIL=0");
  });

  test("rejects a non-meaningful parser profile", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(
          "Parser profile: target parser rejects unknown flags and treats `--` as end of options.",
          "Parser profile: none",
        ),
      ),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "meaningful value required: Parser profile",
    );
  });

  test("rejects non-meaningful effects and receipts", async () => {
    const result = await run(
      await fixture(
        (await validContract())
          .replace(
            "Effects / recovery: inspect reads local files only; apply writes selected records; dry-run predicts selected writes; force bypasses an existing-target guard; partial writes remain named; retry requires the same input snapshot; SIGINT stops future writes.",
            "Effects / recovery: none",
          )
          .replace(/- Positive receipt:.*\n/u, "- Positive receipt: none\n")
          .replace(/- Negative receipt:.*\n/u, "- Negative receipt: none\n"),
      ),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "meaningful value required: Effects / recovery",
    );
    expect(result.stdout).toContain(
      "meaningful value required: Positive receipt",
    );
    expect(result.stdout).toContain(
      "meaningful value required: Negative receipt",
    );
  });

  test("rejects unknown consumer regimes", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(
          "human-interactive, shell-pipeline, ci, agent",
          "human-interactive, dashboard",
        ),
      ),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("unknown consumer regime: dashboard");
  });

  test("ignores fenced decoy fields", async () => {
    const fence = String.fromCodePoint(96).repeat(3);
    const result = await run(
      await fixture(
        fence +
          "\n- Consumer regimes: dashboard\n" +
          fence +
          "\n\n" +
          (await validContract()),
      ),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("CLI CONTRACT: FAIL=0");
  });

  test("ignores indented and commented decoy fields", async () => {
    const content =
      "    - Consumer regimes: dashboard\n<!-- - Consumer regimes: dashboard -->\n\n" +
      (await validContract());
    const result = await run(await fixture(content));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("CLI CONTRACT: FAIL=0");
  });

  test("rejects a machine mode without framing or compatibility", async () => {
    const result = await run(
      await fixture(
        (await validContract())
          .replace(
            "Machine framing: one UTF-8 JSON object per line; no color or progress on stdout.",
            "Machine framing: none",
          )
          .replace(
            "Machine compatibility: `jsonl` v1 fields are additive-only; unknown fields may be ignored.",
            "Machine compatibility: none",
          ),
      ),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "machine mode requires a named machine framing",
    );
    expect(result.stdout).toContain(
      "machine mode requires a named machine compatibility",
    );
  });

  test("known-bad input proves the red exit", async () => {
    const result = await run(
      await fixture("# CLI CONTRACT\n\n## C0 CONSUMERS\n"),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("required section: C5 EVOLUTION");
  });
});
