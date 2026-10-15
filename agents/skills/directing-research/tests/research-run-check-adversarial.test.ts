import { afterEach, describe, expect, test } from "bun:test";
import { appendFile, readFile, symlink, writeFile } from "node:fs/promises";
import {
  cleanupTemporaryRoots,
  completeScenario,
  intent,
  judgment,
  receipt,
  run,
  sha256,
  temporaryRoot,
  write,
} from "./research-run-check-fixtures";

afterEach(cleanupTemporaryRoots);

async function timedRun(registered: string, started: string, ended: string) {
  const directory = await temporaryRoot();
  const intentText = intent("run-a", { REGISTERED_AT: registered });
  const intentPath = await write(directory, "timed.intent.md", intentText);
  const receiptPath = await write(
    directory,
    "timed.receipt.md",
    receipt("run-a", sha256(intentText), "succeeded", {
      ENDED_AT: ended,
      STARTED_AT: started,
    }),
  );
  const judgmentPath = await write(directory, "timed.md", judgment(["run-a"]));
  return run([
    "--intent",
    intentPath,
    "--receipt",
    receiptPath,
    "--judgment",
    judgmentPath,
  ]);
}

describe("research-run-check adversarial inputs", () => {
  test("rejects interpretation laundered into a receipt", async () => {
    const scenario = await completeScenario();
    const intentText = intent("run-a");
    await writeFile(
      scenario.receiptPath,
      receipt("run-a", sha256(intentText), "succeeded", {
        FAILURE_OR_EXCLUSION_REASON:
          "therefore this proves the thesis despite terminal success",
      }),
    );
    const result = await run(scenario.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("bounded interpretation phrase");
  });

  test("accepts target-agnostic technical prose and locator words", async () => {
    const scenario = await completeScenario();
    await writeFile(
      scenario.judgmentPath,
      judgment(["run-a"], "AUDITABLE", [], {
        ALTERNATIVES_GAINED_OR_LOST:
          "creative coding plus a weighted objective improved F1 score",
        NEXT_REGISTERED_TEST:
          "system prompt robustness remains a legitimate research target",
        SCOPE_ACTUALLY_TESTED: "the parser returns Map<String, Result>",
        UNRESOLVED: "whole transcriptome sequencing remains underpowered",
      }),
    );
    const intentText = intent("run-a");
    await writeFile(
      scenario.receiptPath,
      receipt("run-a", sha256(intentText), "succeeded", {
        OBSERVATION_LOCATOR: "research/raw/therefore-case.json:1",
      }),
    );
    expect((await run(scenario.arguments_)).exitCode).toBe(0);
  });

  test("rejects fake AUDITABLE judgment-only history", async () => {
    const directory = await temporaryRoot();
    const judgmentPath = await write(
      directory,
      "judgment.md",
      judgment(["run-a"]),
    );
    const result = await run(["--judgment", judgmentPath]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "AUDITABLE requires intent=receipt=RUN_IDS",
    );
  });

  test("rejects private reasoning and common credential material", async () => {
    const scenario = await completeScenario();
    await writeFile(
      scenario.judgmentPath,
      judgment(["run-a"], "AUDITABLE", [], {
        UNRESOLVED:
          "<thinking>copied private payload with secret sk-live-abcdefghijklmnop</thinking>",
      }),
    );
    const result = await run(scenario.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("raw reasoning, transcript, prompt");
    expect(result.stdout).toContain("probable credential material");
  });

  test("rejects a scalar creativity score", async () => {
    const scenario = await completeScenario();
    await writeFile(
      scenario.judgmentPath,
      `${judgment(["run-a"])}CREATIVITY_SCORE: 0.91\n`,
    );
    const result = await run(scenario.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("scalar creativity scores are forbidden");
  });

  test("rejects a duplicated or substituted process lens", async () => {
    const scenario = await completeScenario();
    await writeFile(
      scenario.judgmentPath,
      judgment(["run-a"]).replace(
        "| surprise-uptake |",
        "| frame-coevolution |",
      ),
    );
    const result = await run(scenario.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("PROCESS LENSES must contain exactly once");
  });

  test("rejects a contradictory second process-lens section", async () => {
    const scenario = await completeScenario();
    await appendFile(
      scenario.judgmentPath,
      "\n## PROCESS LENSES\n\n| Lens ID | Evidence locus | Verdict | Causal consequence | Repair / reopen |\n|---|---|---|---|---|\n| frame-coevolution | contradictory.md:1 | VIOLATED | opposite | reopen now |\n",
    );
    const result = await run(scenario.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("exactly one ## PROCESS LENSES");
  });

  test("accepts escaped and inline-code pipes but rejects an extra separator", async () => {
    const valid = await completeScenario();
    await writeFile(
      valid.judgmentPath,
      (await readFile(valid.judgmentPath, "utf8"))
        .replace(
          "bounded consequence for frame-coevolution",
          "comparison of A \\| B",
        )
        .replace(
          "bounded consequence for generation-evaluation-separation",
          "comparison of `generator | evaluator` roles",
        ),
    );
    expect((await run(valid.arguments_)).exitCode).toBe(0);

    const malformed = await completeScenario();
    await writeFile(
      malformed.judgmentPath,
      (await readFile(malformed.judgmentPath, "utf8")).replace(
        "bounded consequence for frame-coevolution",
        "comparison of A | B",
      ),
    );
    const result = await run(malformed.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("each lens row needs five cells");
  });

  test("Cleye owns unknown flags; missing judgment uses domain exit 2", async () => {
    const unknown = await run(["--unknown", "x"]);
    const missing = await run([]);
    expect(unknown.exitCode).toBe(1);
    expect(unknown.stderr).toContain("Unknown flag");
    expect(missing.exitCode).toBe(2);
    expect(missing.stderr).toContain("required option: --judgment");
  });

  test("rejects repeated singular judgment flags in either spelling and order", async () => {
    const scenario = await completeScenario();
    const directory = await temporaryRoot();
    const invalid = await write(
      directory,
      "invalid-judgment.md",
      judgment(["run-a"], "AUDITABLE", [], { JUDGMENT_ID: "bad id" }),
    );
    const prefix = [
      "--intent",
      scenario.intentPath,
      "--receipt",
      scenario.receiptPath,
    ];
    for (const flags of [
      ["--judgment", scenario.judgmentPath, "--judgment", invalid],
      [`--judgment=${invalid}`, `--judgment=${scenario.judgmentPath}`],
    ]) {
      const result = await run([...prefix, ...flags]);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain(
        "--judgment must be provided exactly once",
      );
    }
  });

  test("orders one-to-nine-digit fractional timestamps exactly across offsets", async () => {
    expect(
      (
        await timedRun(
          "2026-08-02T10:00:00.0009Z",
          "2026-08-02T10:00:00.0001Z",
          "2026-08-02T10:00:01Z",
        )
      ).exitCode,
    ).toBe(1);
    expect(
      (
        await timedRun(
          "2026-08-02T10:00:00Z",
          "2026-08-02T10:00:01.0009Z",
          "2026-08-02T10:00:01.0001Z",
        )
      ).exitCode,
    ).toBe(1);
    expect(
      (
        await timedRun(
          "2026-08-02T10:00:00.0009+09:00",
          "2026-08-02T01:00:00.0001Z",
          "2026-08-02T01:00:01Z",
        )
      ).exitCode,
    ).toBe(1);
    expect(
      (
        await timedRun(
          "2026-08-02T10:00:00.0009+09:00",
          "2026-08-02T01:00:00.001Z",
          "2026-08-02T00:00:00.0011-01:00",
        )
      ).exitCode,
    ).toBe(0);
  }, 15_000);

  test("refuses symlink inputs and oversized packets", async () => {
    const directory = await temporaryRoot();
    const judgmentPath = await write(
      directory,
      "judgment.md",
      judgment(["legacy-run"], "UNAUDITABLE", ["legacy-run"]),
    );
    const linkPath = `${judgmentPath}.link`;
    await symlink(judgmentPath, linkPath);
    const symlinkResult = await run(["--judgment", linkPath]);
    expect(symlinkResult.exitCode).toBe(2);
    expect(symlinkResult.stderr).toContain("symlink inputs are refused");
    const ancestorPath = `${directory}/ancestor`;
    await symlink(directory, ancestorPath);
    const ancestor = await run(["--judgment", `${ancestorPath}/judgment.md`]);
    expect(ancestor.exitCode).toBe(2);
    expect(ancestor.stderr).toContain("symlink inputs are refused");

    const oversizedPath = await write(
      directory,
      "oversized.md",
      "x".repeat(256 * 1024 + 1),
    );
    const oversized = await run(["--judgment", oversizedPath]);
    expect(oversized.exitCode).toBe(2);
    expect(oversized.stderr).toContain("packet exceeds 262144 bytes");
  });
});
