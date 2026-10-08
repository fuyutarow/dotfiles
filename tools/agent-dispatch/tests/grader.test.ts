import { describe, expect, test } from "bun:test";
import { GRADE_WORKER_PROMPT } from "../src/grader.ts";

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
