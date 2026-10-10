import type { TicketGrade } from "./report.ts";
import { ticketFields, type ParsedBrief } from "./ticket.ts";

function frontMatterKeys(brief: string): Set<string> {
  return new Set(Object.keys(ticketFields(brief)));
}

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
  capabilities: readonly string[],
): boolean {
  return capabilities.some(
    (capability) => capability.trim().split(/\s+/u).length >= 4,
  );
}

/** Mechanical, model-free floor. `pieces` and `questions` are intentionally left to a later grader. */
export function floorTicketGrade(
  brief: string,
  parsed: ParsedBrief,
  selectedEffort?: string,
): TicketGrade {
  const violations: TicketGrade["violations"] = [];
  const keys = frontMatterKeys(brief);
  const ticket = parsed.kind === "ticket" ? parsed.ticket : ticketFields(brief);
  const missing = (key: string, example: string): void => {
    violations.push(
      violation(
        brief,
        key,
        `Without ${key}, the worker cannot know a checkable first return within the six-minute window.`,
        example,
      ),
    );
  };

  if (ticket?.outcome === undefined)
    missing("outcome", 'outcome = "<decision/result this changes>"');
  if (ticket?.consumer === undefined)
    missing("consumer", 'consumer = "<who consumes the result>"');
  if (ticket?.first_return === undefined)
    missing("first_return", 'first_return = "<artifact path> within 6 min"');
  if (!keys.has("writes") || ticket?.writes === undefined)
    missing("writes", 'writes = ["<path or glob>"]');
  if (!keys.has("verify") && ticket?.read_only_diagnostic !== true)
    missing(
      "verify",
      'verify = ["<foreground check>"] or read_only_diagnostic = true',
    );

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
        'capabilities = ["<what lower effort measurably lacks>"] or re-brief smaller',
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
