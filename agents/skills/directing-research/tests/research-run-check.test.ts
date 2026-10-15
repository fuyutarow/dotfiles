import { afterEach, describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
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
  test("accepts a complete AUDITABLE packet family", async () => {
    const scenario = await completeScenario();
    const result = await run(scenario.arguments_);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "FAIL=0 intents=1 receipts=1 auditability=AUDITABLE",
    );
    expect(result.stderr).toBe("");
  });

  test("rejects intent hash tampering after receipt capture", async () => {
    const scenario = await completeScenario();
    await writeFile(
      scenario.intentPath,
      intent("run-a", {
        REGISTERED_EXPECTATION: "rewritten after observation",
      }),
    );
    const result = await run(scenario.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("INTENT_SHA256 does not match exact bytes");
  });

  test("rejects a winner-only denominator", async () => {
    const directory = await temporaryRoot();
    const intentA = intent("run-a");
    const intentPaths = [
      await write(directory, "a.intent.md", intentA),
      await write(directory, "b.intent.md", intent("run-b")),
    ];
    const receiptPath = await write(
      directory,
      "a.receipt.md",
      receipt("run-a", sha256(intentA)),
    );
    const judgmentPath = await write(
      directory,
      "judgment.md",
      judgment(["run-a"]),
    );
    const result = await run([
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

  test("rejects a known failed run whose receipt is missing", async () => {
    const directory = await temporaryRoot();
    const intentA = intent("run-a");
    const paths = [
      await write(directory, "a.intent.md", intentA),
      await write(directory, "b.intent.md", intent("run-b")),
    ];
    const receiptPath = await write(
      directory,
      "a.receipt.md",
      receipt("run-a", sha256(intentA)),
    );
    const judgmentPath = await write(
      directory,
      "judgment.md",
      judgment(["run-a", "run-b"]),
    );
    const result = await run([
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

  test("rejects duplicate intent and receipt IDs", async () => {
    const directory = await temporaryRoot();
    const intentText = intent("run-a");
    const intentPaths = [
      await write(directory, "a1.intent.md", intentText),
      await write(directory, "a2.intent.md", intentText),
    ];
    const receiptText = receipt("run-a", sha256(intentText));
    const receiptPaths = [
      await write(directory, "a1.receipt.md", receiptText),
      await write(directory, "a2.receipt.md", receiptText),
    ];
    const judgmentPath = await write(
      directory,
      "judgment.md",
      judgment(["run-a"]),
    );
    const result = await run([
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

  test("rejects hindsight and terminal time inversion", async () => {
    const scenario = await completeScenario();
    const intentText = intent("run-a", {
      REGISTERED_AT: "2026-08-02T10:03:00Z",
    });
    await writeFile(scenario.intentPath, intentText);
    await writeFile(
      scenario.receiptPath,
      receipt("run-a", sha256(intentText), "succeeded", {
        ENDED_AT: "2026-08-02T10:00:00Z",
      }),
    );
    const result = await run(scenario.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("REGISTERED_AT <= STARTED_AT");
    expect(result.stdout).toContain("STARTED_AT <= ENDED_AT");
  });

  test("accepts an honest PARTIAL denominator", async () => {
    const directory = await temporaryRoot();
    const intentA = intent("run-a");
    const intentPaths = [
      await write(directory, "a.intent.md", intentA),
      await write(directory, "b.intent.md", intent("run-b")),
    ];
    const receiptPath = await write(
      directory,
      "a.receipt.md",
      receipt("run-a", sha256(intentA)),
    );
    const judgmentPath = await write(
      directory,
      "judgment.md",
      judgment(["run-a", "run-b"], "PARTIAL", ["run-b"]),
    );
    const result = await run([
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

  test("accepts an honest judgment-only UNAUDITABLE history", async () => {
    const directory = await temporaryRoot();
    const judgmentPath = await write(
      directory,
      "judgment.md",
      judgment(["legacy-run"], "UNAUDITABLE", ["legacy-run"], {
        AUDIT_CLEARANCE_LOCUS: "NONE — prospective evidence is unavailable",
      }),
    );
    const result = await run(["--judgment", judgmentPath]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("auditability=UNAUDITABLE");
  });

  test("enforces exact UNAUDITABLE missing-receipt coverage", async () => {
    const complete = await completeScenario();
    await writeFile(
      complete.judgmentPath,
      judgment(["run-a"], "UNAUDITABLE", ["run-a"]),
    );
    const presentButMissing = await run(complete.arguments_);
    expect(presentButMissing.exitCode).toBe(1);
    expect(presentButMissing.stdout).toContain(
      "missing=run-a expected-missing=NONE",
    );

    const directory = await temporaryRoot();
    const incompleteHistory = await write(
      directory,
      "incomplete-history.md",
      judgment(["run-a", "run-b"], "UNAUDITABLE", ["run-a"]),
    );
    const uncovered = await run(["--judgment", incompleteHistory]);
    expect(uncovered.exitCode).toBe(1);
    expect(uncovered.stdout).toContain(
      "missing=run-a expected-missing=run-a,run-b",
    );

    const intentText = intent("run-a");
    const intentPath = await write(directory, "hybrid.intent.md", intentText);
    const receiptPath = await write(
      directory,
      "hybrid.receipt.md",
      receipt("run-a", sha256(intentText)),
    );
    const hybridJudgment = await write(
      directory,
      "hybrid-judgment.md",
      judgment(["run-a", "legacy-run"], "UNAUDITABLE", ["legacy-run"]),
    );
    const honest = await run([
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
    test(`accepts terminal status ${status}`, async () => {
      const result = await run((await completeScenario(status)).arguments_);
      expect(result.exitCode).toBe(0);
    });

  test("rejects denominator digest tampering", async () => {
    const scenario = await completeScenario();
    await writeFile(
      scenario.judgmentPath,
      judgment(["run-a"], "AUDITABLE", [], { DENOMINATOR_SHA256: DIGEST_A }),
    );
    const result = await run(scenario.arguments_);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("DENOMINATOR_SHA256 mismatch");
  });

  test("validates TRANSITION and EPISODE_DISPOSITION independently", async () => {
    const independent = await completeScenario();
    await writeFile(
      independent.judgmentPath,
      judgment(["run-a"], "AUDITABLE", [], {
        TRANSITION: "NO_CHANGE",
        EPISODE_DISPOSITION: "RETIRE",
      }),
    );
    expect((await run(independent.arguments_)).exitCode).toBe(0);

    for (const [key, value] of [
      ["TRANSITION", "PAUSE"],
      ["EPISODE_DISPOSITION", "TREE_UPDATE"],
    ]) {
      const scenario = await completeScenario();
      await writeFile(
        scenario.judgmentPath,
        judgment(["run-a"], "AUDITABLE", [], { [key ?? ""]: value ?? "" }),
      );
      const result = await run(scenario.arguments_);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(`${key} must be`);
    }
  }, 15_000);
});
