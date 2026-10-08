import { describe, expect, test } from "bun:test";
import {
  GRADE_WORKER_PROMPT,
  parseAgentGrade,
  renderGradeRemand,
} from "../src/grader.ts";

const fakeGrade = (grade: unknown): string =>
  `\`\`\`agent-dispatch-grade\n${JSON.stringify(grade)}\n\`\`\``;

const violation = {
  rule: "specificity",
  quote_from_brief: "the brief",
  why_it_blocks_a_6min_first_return: "the decision is unclear",
  fix: "name the decision",
};

const piece = (title: string, writes: string[], depends_on: string[] = []) => ({
  title,
  outcome: `deliver ${title}`,
  consumer: "the owner",
  first_return: `${title} result`,
  writes,
  verify: ["bun test"],
  depends_on,
});

describe("grader prompt rules", () => {
  test("orders overlapping writes and passes one deliverable with questions", () => {
    const prompt = GRADE_WORKER_PROMPT("Choose one retry policy.");
    expect(prompt).toContain(
      "If two pieces' writes overlap, order them with depends_on, or merge them into one piece.",
    );
    expect(prompt).toContain(
      "When there is one final deliverable, return pass even if it is underspecified; put needed questions in questions with verdict pass.",
    );
  });
});

describe("grader response validation", () => {
  test("accepts and renders pass violations as warnings", () => {
    const parsed = parseAgentGrade(
      fakeGrade({ verdict: "pass", violations: [violation] }),
    );
    expect(parsed.valid).toBe(true);
    if (parsed.valid) {
      expect(parsed.grade.violations).toEqual([violation]);
      expect(
        renderGradeRemand({
          verdict: "pass",
          source: "floor+grader",
          violations: [violation],
          grader: { status: "ok" },
        })[0],
      ).toStartWith("agent-dispatch: warning specificity:");
    }
  });

  test("drops unknown and self dependencies, records warnings, and validates writes", () => {
    const parsed = parseAgentGrade(
      fakeGrade({
        verdict: "split",
        violations: [violation],
        pieces: [
          piece("first", ["first.ts"], ["missing", "first"]),
          piece("second", ["second.ts"]),
        ],
      }),
    );
    expect(parsed.valid).toBe(true);
    if (parsed.valid) {
      expect(parsed.grade.pieces?.[0]?.depends_on).toEqual([]);
      expect(parsed.grade.warnings).toEqual([
        "piece first has a dropped unknown dependency: missing",
        "piece first has a dropped self dependency: first",
      ]);
      expect(
        renderGradeRemand({
          verdict: "split",
          source: "floor+grader",
          violations: [violation],
          warnings: parsed.grade.warnings,
          grader: { status: "ok" },
        }),
      ).toContain(
        "agent-dispatch: warning: piece first has a dropped unknown dependency: missing",
      );
    }
  });

  test("tolerates trailing commas once and rejects other malformed JSON", () => {
    const tolerant = parseAgentGrade(
      `\`\`\`agent-dispatch-grade\n{"verdict":"pass","violations":[],}\n\`\`\``,
    );
    expect(tolerant.valid).toBe(true);
    expect(
      parseAgentGrade(`\`\`\`agent-dispatch-grade\n{bad}\n\`\`\``).valid,
    ).toBe(false);
  });
});
