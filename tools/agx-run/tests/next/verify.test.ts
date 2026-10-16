import { expect, test } from "bun:test";
import { deriveOutcome, type Outcome } from "../../src/next/outcome.ts";
import {
  VerifyResult,
  verifyKind,
  type VerifyKind,
} from "../../src/next/verify.ts";

const cases: [number, VerifyKind, Outcome][] = [
  [0, "passed", "ok"],
  [1, "failed", "verify-failed"],
  [126, "unrunnable", "verify-unrunnable"],
  [127, "unrunnable", "verify-unrunnable"],
  [137, "killed", "verify-killed"],
  [143, "killed", "verify-killed"],
  [255, "failed", "verify-failed"],
];

test.each(cases)(
  "verify exit %s is %s, including historical records without kind",
  (exit, kind, outcome) => {
    expect(verifyKind(exit)).toBe(kind);
    const parsed = VerifyResult.safeParse({
      cmd: "check",
      exit,
      log_path: "check.log",
      future: true,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const old = parsed.data;
    expect(old.kind).toBe(kind);
    expect(old).toHaveProperty("future", true);
    expect(
      deriveOutcome({
        timedOut: false,
        refused: false,
        verify: [old],
        reportValid: true,
        changed: 1,
      }),
    ).toBe(outcome);
  },
);

test("an observed signal wins over an exit code", () => {
  expect(verifyKind(1, "SIGKILL")).toBe("killed");
});
