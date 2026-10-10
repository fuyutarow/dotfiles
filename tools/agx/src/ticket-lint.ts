// Shared local admission floor: no model calls or network. Consumers: dispatch and ticket lint.
import type { TicketGrade } from "./report.ts";
import { checkPremises } from "./premises.ts";
import { floorTicketGrade, renderTicketRemand } from "./ticket-grade.ts";
import { parseTicket, resourceKind, ticketFields } from "./ticket.ts";
import { z } from "../../shared/src/zod.ts";

export function lintTicket(
  brief: string,
  cwd: string,
  legacy = false,
): TicketGrade {
  const parsed = parseTicket(brief);
  const floor = floorTicketGrade(brief, parsed);
  const violations = floor.violations.filter(
    (item) => item.rule === "verify" && !legacy,
  );
  const add = (rule: string, quote: string, why: string, fix: string): void => {
    violations.push({
      rule,
      quote_from_brief: quote,
      why_it_blocks_a_6min_first_return: why,
      fix,
    });
  };
  if (parsed.kind === "invalid")
    add(
      "schema",
      parsed.reason,
      `Invalid ticket: ${parsed.reason}`,
      "Correct the TOML/schema fields and close the +++ front matter.",
    );
  const prose = parsed.kind === "invalid" ? brief : parsed.prose;
  if (resourceKind(prose) === undefined)
    add(
      "resource",
      "(absent)",
      "The worker has no RESOURCE declaration.",
      "Add RESOURCE-CLASS(NONCOMPUTE): <reason> or RESOURCE-ENVELOPE(/absolute/path.json): agent-resource-run only to the body.",
    );
  const fields = ticketFields(brief);
  const premises = z.array(z.string()).safeParse(fields.premises);
  const checked = checkPremises(
    premises.success ? premises.data : undefined,
    cwd,
  );
  if (checked.status === "missing")
    for (const premise of checked.premises)
      add(
        "premise",
        premise,
        `${premise} is absent in the --cd tree.`,
        "correct the brief's premise or remove it",
      );
  return {
    verdict: violations.length === 0 ? "pass" : "clarify",
    source: "floor",
    violations,
    ...(checked.status === "timeout"
      ? { warnings: ["premise check skipped: timeout"] }
      : {}),
  };
}

export function renderTicketLint(grade: TicketGrade): string[] {
  return renderTicketRemand(grade);
}
