import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import {
  cleanupTemporaryRoots,
  completeScenario,
  DIGEST_A,
  intent,
  judgment,
  receipt,
  run,
  sha256,
  temporaryRoot,
  write,
} from "./research-run-check-fixtures";

afterEach(cleanupTemporaryRoots);

describe("research-run-check joins and lifecycle", () => {
  test("accepts a complete AUDITABLE packet family", () => {
    const scenario = completeScenario();
    const result = run(scenario.arguments_);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "FAIL=0 intents=1 receipts=1 auditability=AUDITABLE",
    );
    expect(result.stderr).toBe("");
  });

  test("rejects intent hash tampering after receipt capture", () => {
    const scenario = completeScenario();
    writeFileSync(
      scenario.intentPath,
      intent("run-a", {
        REGISTERED_EXPECTATION: "rewritten after observation",
      }),
    );
    const result = run(scenario.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("INTENT_SHA256 does not match exact bytes");
  });

  test("rejects a winner-only denominator", () => {
    const directory = temporaryRoot();
    const intentA = intent("run-a");
    const intentPaths = [
      write(directory, "a.intent.md", intentA),
      write(directory, "b.intent.md", intent("run-b")),
    ];
    const receiptPath = write(
      directory,
      "a.receipt.md",
      receipt("run-a", sha256(intentA)),
    );
    const judgmentPath = write(directory, "judgment.md", judgment(["run-a"]));
    const result = run([
      "--intent",
      intentPaths[0] ?? "",
      "--intent",
      intentPaths[1] ?? "",
      "--receipt",
      receiptPath,
      "--judgment",
      judgmentPath,
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "AUDITABLE requires intent=receipt=RUN_IDS",
    );
  });

  test("rejects a known failed run whose receipt is missing", () => {
    const directory = temporaryRoot();
    const intentA = intent("run-a");
    const paths = [
      write(directory, "a.intent.md", intentA),
      write(directory, "b.intent.md", intent("run-b")),
    ];
    const receiptPath = write(
      directory,
      "a.receipt.md",
      receipt("run-a", sha256(intentA)),
    );
    const judgmentPath = write(
      directory,
      "judgment.md",
      judgment(["run-a", "run-b"]),
    );
    const result = run([
      "--intent",
      paths[0] ?? "",
      "--intent",
      paths[1] ?? "",
      "--receipt",
      receiptPath,
      "--judgment",
      judgmentPath,
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "AUDITABLE requires intent=receipt=RUN_IDS",
    );
  });

  test("rejects duplicate intent and receipt IDs", () => {
    const directory = temporaryRoot();
    const intentText = intent("run-a");
    const intentPaths = [
      write(directory, "a1.intent.md", intentText),
      write(directory, "a2.intent.md", intentText),
    ];
    const receiptText = receipt("run-a", sha256(intentText));
    const receiptPaths = [
      write(directory, "a1.receipt.md", receiptText),
      write(directory, "a2.receipt.md", receiptText),
    ];
    const judgmentPath = write(directory, "judgment.md", judgment(["run-a"]));
    const result = run([
      "--intent",
      intentPaths[0] ?? "",
      "--intent",
      intentPaths[1] ?? "",
      "--receipt",
      receiptPaths[0] ?? "",
      "--receipt",
      receiptPaths[1] ?? "",
      "--judgment",
      judgmentPath,
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("duplicate intent RUN_ID run-a");
    expect(result.stdout).toContain("duplicate receipt RUN_ID run-a");
  });

  test("rejects hindsight and terminal time inversion", () => {
    const scenario = completeScenario();
    const intentText = intent("run-a", {
      REGISTERED_AT: "2026-08-02T10:03:00Z",
    });
    writeFileSync(scenario.intentPath, intentText);
    writeFileSync(
      scenario.receiptPath,
      receipt("run-a", sha256(intentText), "succeeded", {
        ENDED_AT: "2026-08-02T10:00:00Z",
      }),
    );
    const result = run(scenario.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("REGISTERED_AT <= STARTED_AT");
    expect(result.stdout).toContain("STARTED_AT <= ENDED_AT");
  });

  test("accepts an honest PARTIAL denominator", () => {
    const directory = temporaryRoot();
    const intentA = intent("run-a");
    const intentPaths = [
      write(directory, "a.intent.md", intentA),
      write(directory, "b.intent.md", intent("run-b")),
    ];
    const receiptPath = write(
      directory,
      "a.receipt.md",
      receipt("run-a", sha256(intentA)),
    );
    const judgmentPath = write(
      directory,
      "judgment.md",
      judgment(["run-a", "run-b"], "PARTIAL", ["run-b"]),
    );
    const result = run([
      "--intent",
      intentPaths[0] ?? "",
      "--intent",
      intentPaths[1] ?? "",
      "--receipt",
      receiptPath,
      "--judgment",
      judgmentPath,
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("auditability=PARTIAL");
  });

  test("accepts an honest judgment-only UNAUDITABLE history", () => {
    const directory = temporaryRoot();
    const judgmentPath = write(
      directory,
      "judgment.md",
      judgment(["legacy-run"], "UNAUDITABLE", ["legacy-run"], {
        AUDIT_CLEARANCE_LOCUS: "NONE — prospective evidence is unavailable",
      }),
    );
    const result = run(["--judgment", judgmentPath]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("auditability=UNAUDITABLE");
  });

  test("enforces exact UNAUDITABLE missing-receipt coverage", () => {
    const complete = completeScenario();
    writeFileSync(
      complete.judgmentPath,
      judgment(["run-a"], "UNAUDITABLE", ["run-a"]),
    );
    const presentButMissing = run(complete.arguments_);
    expect(presentButMissing.exitCode).toBe(1);
    expect(presentButMissing.stdout).toContain(
      "missing=run-a expected-missing=NONE",
    );

    const directory = temporaryRoot();
    const incompleteHistory = write(
      directory,
      "incomplete-history.md",
      judgment(["run-a", "run-b"], "UNAUDITABLE", ["run-a"]),
    );
    const uncovered = run(["--judgment", incompleteHistory]);
    expect(uncovered.exitCode).toBe(1);
    expect(uncovered.stdout).toContain(
      "missing=run-a expected-missing=run-a,run-b",
    );

    const intentText = intent("run-a");
    const intentPath = write(directory, "hybrid.intent.md", intentText);
    const receiptPath = write(
      directory,
      "hybrid.receipt.md",
      receipt("run-a", sha256(intentText)),
    );
    const hybridJudgment = write(
      directory,
      "hybrid-judgment.md",
      judgment(["run-a", "legacy-run"], "UNAUDITABLE", ["legacy-run"]),
    );
    const honest = run([
      "--intent",
      intentPath,
      "--receipt",
      receiptPath,
      "--judgment",
      hybridJudgment,
    ]);
    expect(honest.exitCode).toBe(0);
  });

  for (const status of [
    "succeeded",
    "failed",
    "stopped",
    "aborted",
    "excluded",
  ])
    test(`accepts terminal status ${status}`, () => {
      const result = run(completeScenario(status).arguments_);
      expect(result.exitCode).toBe(0);
    });

  test("rejects denominator digest tampering", () => {
    const scenario = completeScenario();
    writeFileSync(
      scenario.judgmentPath,
      judgment(["run-a"], "AUDITABLE", [], { DENOMINATOR_SHA256: DIGEST_A }),
    );
    const result = run(scenario.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("DENOMINATOR_SHA256 mismatch");
  });

  test("validates TRANSITION and EPISODE_DISPOSITION independently", () => {
    const independent = completeScenario();
    writeFileSync(
      independent.judgmentPath,
      judgment(["run-a"], "AUDITABLE", [], {
        TRANSITION: "NO_CHANGE",
        EPISODE_DISPOSITION: "RETIRE",
      }),
    );
    expect(run(independent.arguments_).exitCode).toBe(0);

    for (const [key, value] of [
      ["TRANSITION", "PAUSE"],
      ["EPISODE_DISPOSITION", "TREE_UPDATE"],
    ]) {
      const scenario = completeScenario();
      writeFileSync(
        scenario.judgmentPath,
        judgment(["run-a"], "AUDITABLE", [], { [key ?? ""]: value ?? "" }),
      );
      const result = run(scenario.arguments_);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(`${key} must be`);
    }
  });
});
