import type { TicketGrade } from "./report.ts";
import { type ParsedBrief, type Capability } from "./ticket.ts";

function quoteFor(brief: string, key: string): string {
  const line = brief
    .split("\n")
    .find((candidate) => new RegExp(`^\\s*${key}\\s*=`, "u").test(candidate));
  return line?.trim() ?? "(absent)";
}

function violation(brief: string, rule: string, why: string, fix: string) {
  return {
    rule,
    quote_from_brief: quoteFor(brief, rule),
    why_it_blocks_a_6min_first_return: why,
    fix,
  };
}

export function hasXhighMaxJustification(
  capabilities: readonly Capability[],
): boolean {
  return capabilities.some(
    (capability) =>
      typeof capability !== "string" &&
      capability.need.trim() !== "" &&
      capability.lower_effort_lacks.trim() !== "",
  );
}

/** Model-free floor beyond the schema: the effort a picked row may use. `pieces` and `questions`
 *  are left to the grader. */
export function floorTicketGrade(
  brief: string,
  parsed: ParsedBrief,
  selectedEffort?: string,
): TicketGrade {
  const violations: TicketGrade["violations"] = [];
  if (
    (selectedEffort === "xhigh" || selectedEffort === "max") &&
    !hasXhighMaxJustification(
      parsed.kind === "ticket" ? parsed.ticket.capabilities : [],
    )
  ) {
    violations.push(
      violation(
        brief,
        "effort",
        "xhigh/max slows the first return; the ticket names no measurable capability lower effort lacks.",
        'capabilities = [{ need = "<capability>", lower_effort_lacks = "<measurable limitation>" }] or re-brief smaller',
      ),
    );
  }

  const grade = {
    verdict: violations.length === 0 ? "pass" : "clarify",
    source: "floor",
    violations,
  } satisfies TicketGrade;
  return grade;
}

export function renderTicketRemand(grade: TicketGrade): string[] {
  return grade.violations.map(
    (item) =>
      `agx: remand ${item.rule}: ${item.why_it_blocks_a_6min_first_return} Fix: ${item.fix}`,
  );
}
