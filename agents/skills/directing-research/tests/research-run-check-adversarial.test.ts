import { afterEach, describe, expect, test } from "bun:test";
import {
  appendFileSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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

describe("research-run-check adversarial inputs", () => {
  test("rejects interpretation laundered into a receipt", () => {
    const scenario = completeScenario();
    const intentText = intent("run-a");
    writeFileSync(
      scenario.receiptPath,
      receipt("run-a", sha256(intentText), "succeeded", {
        FAILURE_OR_EXCLUSION_REASON:
          "therefore this proves the thesis despite terminal success",
      }),
    );
    const result = run(scenario.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("bounded interpretation phrase");
  });

  test("accepts target-agnostic technical prose and locator words", () => {
    const scenario = completeScenario();
    writeFileSync(
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
    writeFileSync(
      scenario.receiptPath,
      receipt("run-a", sha256(intentText), "succeeded", {
        OBSERVATION_LOCATOR: "research/raw/therefore-case.json:1",
      }),
    );
    expect(run(scenario.arguments_).exitCode).toBe(0);
  });

  test("rejects fake AUDITABLE judgment-only history", () => {
    const directory = temporaryRoot();
    const judgmentPath = write(directory, "judgment.md", judgment(["run-a"]));
    const result = run(["--judgment", judgmentPath]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "AUDITABLE requires intent=receipt=RUN_IDS",
    );
  });

  test("rejects private reasoning and common credential material", () => {
    const scenario = completeScenario();
    writeFileSync(
      scenario.judgmentPath,
      judgment(["run-a"], "AUDITABLE", [], {
        UNRESOLVED:
          "<thinking>copied private payload with secret sk-live-abcdefghijklmnop</thinking>",
      }),
    );
    const result = run(scenario.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("raw reasoning, transcript, prompt");
    expect(result.stdout).toContain("probable credential material");
  });

  test("rejects a scalar creativity score", () => {
    const scenario = completeScenario();
    writeFileSync(
      scenario.judgmentPath,
      `${judgment(["run-a"])}CREATIVITY_SCORE: 0.91\n`,
    );
    const result = run(scenario.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("scalar creativity scores are forbidden");
  });

  test("rejects a duplicated or substituted process lens", () => {
    const scenario = completeScenario();
    writeFileSync(
      scenario.judgmentPath,
      judgment(["run-a"]).replace(
        "| surprise-uptake |",
        "| frame-coevolution |",
      ),
    );
    const result = run(scenario.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("PROCESS LENSES must contain exactly once");
  });

  test("rejects a contradictory second process-lens section", () => {
    const scenario = completeScenario();
    appendFileSync(
      scenario.judgmentPath,
      "\n## PROCESS LENSES\n\n| Lens ID | Evidence locus | Verdict | Causal consequence | Repair / reopen |\n|---|---|---|---|---|\n| frame-coevolution | contradictory.md:1 | VIOLATED | opposite | reopen now |\n",
    );
    const result = run(scenario.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("exactly one ## PROCESS LENSES");
  });

  test("accepts escaped and inline-code pipes but rejects an extra separator", () => {
    const valid = completeScenario();
    writeFileSync(
      valid.judgmentPath,
      readFileSync(valid.judgmentPath, "utf8")
        .replace(
          "bounded consequence for frame-coevolution",
          "comparison of A \\| B",
        )
        .replace(
          "bounded consequence for generation-evaluation-separation",
          "comparison of `generator | evaluator` roles",
        ),
    );
    expect(run(valid.arguments_).exitCode).toBe(0);

    const malformed = completeScenario();
    writeFileSync(
      malformed.judgmentPath,
      readFileSync(malformed.judgmentPath, "utf8").replace(
        "bounded consequence for frame-coevolution",
        "comparison of A | B",
      ),
    );
    const result = run(malformed.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("each lens row needs five cells");
  });

  test("Cleye owns unknown flags; missing judgment uses domain exit 2", () => {
    const unknown = run(["--unknown", "x"]);
    const missing = run([]);
    expect(unknown.exitCode).toBe(1);
    expect(unknown.stderr).toContain("Unknown flag");
    expect(missing.exitCode).toBe(2);
    expect(missing.stderr).toContain("required option: --judgment");
  });

  test("rejects repeated singular judgment flags in either spelling and order", () => {
    const scenario = completeScenario();
    const directory = temporaryRoot();
    const invalid = write(
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
      const result = run([...prefix, ...flags]);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain(
        "--judgment must be provided exactly once",
      );
    }
  });

  test("orders one-to-nine-digit fractional timestamps exactly across offsets", () => {
    const timedRun = (registered: string, started: string, ended: string) => {
      const directory = temporaryRoot();
      const intentText = intent("run-a", { REGISTERED_AT: registered });
      const intentPath = write(directory, "timed.intent.md", intentText);
      const receiptPath = write(
        directory,
        "timed.receipt.md",
        receipt("run-a", sha256(intentText), "succeeded", {
          ENDED_AT: ended,
          STARTED_AT: started,
        }),
      );
      const judgmentPath = write(directory, "timed.md", judgment(["run-a"]));
      return run([
        "--intent",
        intentPath,
        "--receipt",
        receiptPath,
        "--judgment",
        judgmentPath,
      ]);
    };

    expect(
      timedRun(
        "2026-08-02T10:00:00.0009Z",
        "2026-08-02T10:00:00.0001Z",
        "2026-08-02T10:00:01Z",
      ).exitCode,
    ).toBe(1);
    expect(
      timedRun(
        "2026-08-02T10:00:00Z",
        "2026-08-02T10:00:01.0009Z",
        "2026-08-02T10:00:01.0001Z",
      ).exitCode,
    ).toBe(1);
    expect(
      timedRun(
        "2026-08-02T10:00:00.0009+09:00",
        "2026-08-02T01:00:00.0001Z",
        "2026-08-02T01:00:01Z",
      ).exitCode,
    ).toBe(1);
    expect(
      timedRun(
        "2026-08-02T10:00:00.0009+09:00",
        "2026-08-02T01:00:00.001Z",
        "2026-08-02T00:00:00.0011-01:00",
      ).exitCode,
    ).toBe(0);
  });

  test("refuses symlink inputs and oversized packets", () => {
    const directory = temporaryRoot();
    const judgmentPath = write(
      directory,
      "judgment.md",
      judgment(["legacy-run"], "UNAUDITABLE", ["legacy-run"]),
    );
    const linkPath = `${judgmentPath}.link`;
    symlinkSync(judgmentPath, linkPath);
    const symlink = run(["--judgment", linkPath]);
    expect(symlink.exitCode).toBe(2);
    expect(symlink.stderr).toContain("symlink inputs are refused");
    const ancestorPath = `${directory}/ancestor`;
    symlinkSync(directory, ancestorPath);
    const ancestor = run(["--judgment", `${ancestorPath}/judgment.md`]);
    expect(ancestor.exitCode).toBe(2);
    expect(ancestor.stderr).toContain("symlink inputs are refused");

    const oversizedPath = write(
      directory,
      "oversized.md",
      "x".repeat(256 * 1024 + 1),
    );
    const oversized = run(["--judgment", oversizedPath]);
    expect(oversized.exitCode).toBe(2);
    expect(oversized.stderr).toContain("packet exceeds 262144 bytes");
  });
});
