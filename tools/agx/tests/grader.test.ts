import { describe, expect, test } from "bun:test";
import {
  GRADE_WORKER_PROMPT,
  parseAgentGrade,
  renderGradeRemand,
} from "../src/grader.ts";

const fakeGrade = (grade: unknown): string =>
  `\`\`\`agx-grade\n${JSON.stringify(grade)}\n\`\`\``;

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

const readOnlyBrief = [
  "+++",
  "schema = 2",
  "writes = []",
  "read_only_diagnostic = true",
  "+++",
  "Prove the access property and identify the required slot constraints.",
].join("\n");

describe("grader prompt rules", () => {
  test("orders overlapping writes and passes one deliverable with questions", () => {
    const prompt = GRADE_WORKER_PROMPT("Choose one retry policy.");
    expect(prompt).toContain(
      "If two pieces' writes overlap, order them with depends_on, or merge them into one piece.",
    );
    expect(prompt).toContain(
      "A change and its own acceptance check are one deliverable: build X so check Y passes. This includes tests, dry-runs, seal or hash checks, params/config files the change needs to run, and paired halves of one claim (such as lower and upper bounds, or both directions of an equivalence).",
    );
    expect(prompt).toContain(
      "A split is warranted only when each piece delivers an independently consumable result.",
    );
    expect(prompt).toContain(
      "For a read-only ticket (writes = [] or read_only_diagnostic), split only when its parts answer independent questions; derived or mutually-referencing sections stay together.",
    );
    expect(prompt).toContain(
      "When there is one final deliverable, return pass even if it is underspecified; put needed questions in questions with verdict pass.",
    );
    expect(prompt).toContain(
      "When the brief names functions or files it relies on but declares no premises, add a warning-level question suggesting `premises = [...]` with those names.",
    );
    expect(prompt).toContain(
      "When split pieces have depends_on, name one integration/acceptance piece that consumes the others; if none is named, add a question.",
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
      ).toStartWith("agx: warning specificity:");
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
        "agx: warning: piece first has a dropped unknown dependency: missing",
      );
    }
  });

  test("rejects splitting an implementation from its bit-identity test", () => {
    const parsed = parseAgentGrade(
      fakeGrade({
        verdict: "split",
        violations: [violation],
        pieces: [
          {
            ...piece("implement c3_read", ["src/c3_read.c"]),
            outcome: "implement c3_read",
          },
          {
            ...piece(
              "test c3_read",
              ["tests/c3_read_test.c"],
              ["implement c3_read"],
            ),
            outcome: "test c3_read bit identity",
            first_return: "bit identity test passes for src/c3_read.c",
          },
        ],
      }),
    );
    expect(parsed).toEqual({
      valid: false,
      reason: "split separates a change from its own check",
    });
  });

  test("rejects splitting an implementation from its seal and required params", () => {
    const parsed = parseAgentGrade(
      fakeGrade({
        verdict: "split",
        violations: [violation],
        pieces: [
          {
            ...piece("implement solver", ["src/solver.jl"]),
            outcome: "implement the solver",
          },
          {
            ...piece(
              "seal solver",
              ["params/base.toml", "params/solver.toml"],
              ["implement solver"],
            ),
            outcome: "seal solver and add params/config files needed to run it",
            first_return: "solver seal and params are ready",
          },
        ],
      }),
    );
    expect(parsed).toEqual({
      valid: false,
      reason: "split separates a change from its own check",
    });
  });

  test("accepts a split of independent features", () => {
    const parsed = parseAgentGrade(
      fakeGrade({
        verdict: "split",
        violations: [violation],
        pieces: [
          {
            ...piece("feature alpha", ["src/alpha.ts"]),
            outcome: "deliver alpha feature",
          },
          {
            ...piece("feature beta", ["src/beta.ts"]),
            outcome: "deliver beta feature",
          },
        ],
      }),
    );
    expect(parsed.valid).toBe(true);
  });

  test("rejects splitting dependent sections of a read-only proof", () => {
    const parsed = parseAgentGrade(
      fakeGrade({
        verdict: "split",
        violations: [violation],
        pieces: [
          {
            ...piece("prop A", []),
            outcome: "establish proposition A",
            verify: [],
          },
          {
            ...piece("prop B and lost property", [], ["prop A"]),
            outcome:
              "derive proposition B and the lost property from proposition A",
            verify: [],
          },
        ],
      }),
      readOnlyBrief,
    );
    expect(parsed).toEqual({
      valid: false,
      reason: "split separates dependent read-only sections",
    });
  });

  test("keeps a split of independent read-only questions", () => {
    const parsed = parseAgentGrade(
      fakeGrade({
        verdict: "split",
        violations: [violation],
        pieces: [
          {
            ...piece("question about slots", []),
            outcome: "answer whether slot allocation is unique",
            verify: [],
          },
          {
            ...piece("question about access", []),
            outcome: "answer which LLUs can access each device",
            verify: [],
          },
        ],
      }),
      readOnlyBrief,
    );
    expect(parsed.valid).toBe(true);
  });

  test("keeps exact-input requests as valid clarifications", () => {
    const parsed = parseAgentGrade(
      fakeGrade({
        verdict: "clarify",
        violations: [violation],
        questions: [
          {
            question: "Which exact operation should the counterexample cover?",
            unblocks: "The proof's missing operation input",
          },
        ],
      }),
      readOnlyBrief,
    );
    expect(parsed.valid).toBe(true);
  });

  test("tolerates trailing commas once and rejects other malformed JSON", () => {
    const tolerant = parseAgentGrade(
      `\`\`\`agx-grade\n{"verdict":"pass","violations":[],}\n\`\`\``,
    );
    expect(tolerant.valid).toBe(true);
    expect(parseAgentGrade(`\`\`\`agx-grade\n{bad}\n\`\`\``).valid).toBe(false);
  });
});
