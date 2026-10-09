import { describe, expect, test } from "bun:test";
import { TicketGradeSchema } from "../src/report.ts";
import { floorTicketGrade, renderTicketRemand } from "../src/ticket-grade.ts";
import { parseTicket } from "../src/ticket.ts";

const schema2 = (fields: string): string =>
  `+++\nschema = 2\n${fields}\n+++\nAnalyze this brief.\n`;

describe("floor ticket grade", () => {
  test("schema 2 missing keys gets actionable clarify remands", () => {
    const brief = schema2("writes = []");
    const grade = floorTicketGrade(brief, parseTicket(brief));
    expect(grade.verdict).toBe("clarify");
    expect(grade.violations.map((v) => v.rule)).toEqual([
      "outcome",
      "consumer",
      "first_return",
      "verify",
    ]);
    const lines = renderTicketRemand(grade);
    expect(lines).toHaveLength(4);
    for (const [index, v] of grade.violations.entries()) {
      expect(lines[index]).toContain(v.rule);
      expect(lines[index]).toContain(v.fix);
    }
    const roundTrip = TicketGradeSchema.safeParse(grade);
    expect(roundTrip.success).toBe(true);
    if (roundTrip.success) expect(roundTrip.data).toEqual(grade);
  });

  test("a complete diagnostic ticket passes", () => {
    const brief = schema2(
      [
        'outcome = "choose retry behavior"',
        'consumer = "runtime owner"',
        'first_return = "decision.md within 6 min"',
        "writes = []",
        "read_only_diagnostic = true",
      ].join("\n"),
    );
    expect(floorTicketGrade(brief, parseTicket(brief)).verdict).toBe("pass");
  });

  test("xhigh/max without a capability tag adds an effort remand", () => {
    const brief = schema2(
      [
        'outcome = "choose retry behavior"',
        'consumer = "runtime owner"',
        'first_return = "decision.md within 6 min"',
        "writes = []",
        "read_only_diagnostic = true",
      ].join("\n"),
    );
    const grade = floorTicketGrade(brief, parseTicket(brief), "xhigh");
    expect(grade.verdict).toBe("clarify");
    expect(grade.violations.at(-1)?.rule).toBe("effort");
    expect(grade.violations.at(-1)?.fix).toContain("capabilities =");
  });

  test("xhigh/max needs a free-text capability justification", () => {
    const base = [
      'outcome = "choose retry behavior"',
      'consumer = "runtime owner"',
      'first_return = "decision.md within 6 min"',
      "writes = []",
      "read_only_diagnostic = true",
    ].join("\n");
    for (const capability of [
      "merge-conflicts",
      "typescript",
      "three word tag",
    ]) {
      const brief = schema2(`${base}\ncapabilities = ["${capability}"]`);
      expect(
        floorTicketGrade(brief, parseTicket(brief), "max").violations.map(
          (item) => item.rule,
        ),
      ).toContain("effort");
    }
    const brief = schema2(
      `${base}\ncapabilities = ["debugging a hang across a 4000-line file where four luna attempts failed"]`,
    );
    expect(floorTicketGrade(brief, parseTicket(brief), "xhigh").verdict).toBe(
      "pass",
    );
  });
});
