import { describe, expect, test } from "bun:test";
import { TicketGradeSchema } from "../src/report.ts";
import { floorTicketGrade, renderTicketRemand } from "../src/ticket-grade.ts";
import { parseTicket } from "../src/ticket.ts";
import { completeTicket } from "./fixture-ticket.ts";

const schema2 = (fields: string): string =>
  completeTicket(`+++\nschema = 2\n${fields}\n+++\nAnalyze this brief.\n`);

describe("floor ticket grade", () => {
  test("the floor adds nothing to a schema-valid ticket at normal effort", () => {
    const brief = schema2("writes = []\nverify = []");
    const grade = floorTicketGrade(brief, parseTicket(brief));
    expect(grade).toEqual({ verdict: "pass", source: "floor", violations: [] });
    expect(renderTicketRemand(grade)).toEqual([]);
    expect(TicketGradeSchema.safeParse(grade).success).toBe(true);
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

  test("xhigh/max needs a structured capability justification", () => {
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
      "debugging a hang across a 4000-line file where four luna attempts failed",
    ]) {
      const brief = schema2(`${base}\ncapabilities = ["${capability}"]`);
      expect(
        floorTicketGrade(brief, parseTicket(brief), "max").violations.map(
          (item) => item.rule,
        ),
      ).toContain("effort");
    }
    const brief = schema2(
      `${base}\ncapabilities = [{ need = "debugging a hang", lower_effort_lacks = "four lower effort attempts failed to find the deadlock" }]`,
    );
    expect(floorTicketGrade(brief, parseTicket(brief), "xhigh").verdict).toBe(
      "pass",
    );
  });
});
