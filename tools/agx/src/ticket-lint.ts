// Shared local admission floor: no model calls or network. Consumers: dispatch and ticket lint.
import type { TicketGrade } from "./report.ts";
import { checkPremises } from "./premises.ts";
import { renderTicketRemand } from "./ticket-grade.ts";
import { parseTicket, resourceKind, ticketFields } from "./ticket.ts";
import { z } from "../../shared/src/zod.ts";
import { resolve } from "node:path";

export async function lintTicket(
  brief: string,
  cwd: string,
): Promise<TicketGrade> {
  const parsed = parseTicket(brief);
  const violations: TicketGrade["violations"] = [];
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
      "Correct the front matter fields named above; agx ticket new prints a complete skeleton.",
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
  const warnings: string[] = [];
  const createsFiles =
    parsed.kind === "ticket"
      ? await Promise.all(
          parsed.ticket.writes.map(
            async (glob) =>
              /^(tools|scripts)\//u.test(glob) &&
              (/[*?[\]{}]/u.test(glob) ||
                !(await Bun.file(resolve(cwd, glob)).exists())),
          ),
        )
      : [];
  if (
    parsed.kind === "ticket" &&
    parsed.ticket.reuses === undefined &&
    createsFiles.some(Boolean)
  )
    warnings.push(
      "writes may create a new file under tools/ or scripts/ without reuses = [...]; run rr exists '<capability>' first and record the reused implementation.",
    );
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
    warnings: [
      ...warnings,
      ...(checked.status === "timeout"
        ? ["premise check skipped: timeout"]
        : []),
    ],
  };
}

/** Codex protects these directories even inside a writable checkout. Validate before allocation. */
export function sandboxWriteViolations(
  brief: string,
  sandbox: string,
): string[] {
  const parsed = parseTicket(brief);
  if (parsed.kind !== "ticket" || sandbox === "none") return [];
  const writes = parsed.ticket.writes;
  if (sandbox === "read-only" && writes.length > 0)
    return ["read-only sandbox cannot satisfy ticket writes"];
  return writes
    .filter((glob) =>
      glob
        .split("/")
        .some((part) => [".git", ".agents", ".codex"].includes(part)),
    )
    .map(
      (glob) =>
        `writes ${glob} is protected in the Codex workspace-write sandbox; choose a writable scope or an explicitly authorized sandbox`,
    );
}

export function renderTicketLint(grade: TicketGrade): string[] {
  return renderTicketRemand(grade);
}
