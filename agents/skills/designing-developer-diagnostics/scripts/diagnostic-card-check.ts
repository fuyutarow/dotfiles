import { cli } from "cleye";

type RecoveryMode = "exact" | "conditional" | "investigate" | "none";

export type CardCheck = {
  failures: string[];
};

const REQUIRED_FIELDS = [
  "Surface",
  "Severity",
  "Machine contract",
  "Renderer",
  "Observed condition",
  "Evidence / locus",
  "Cause confidence",
  "Primary message",
  "Related loci",
  "Recovery mode",
  "Validated recovery",
  "Preconditions",
  "Next observation",
  "Positive case",
  "Negative case",
  "Receipt",
] as const;

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

function fields(text: string): Map<string, string> {
  const cardFields = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = line.match(/^([^:#][^:]*):\s*(.+)$/);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      cardFields.set(match[1].trim(), match[2].trim());
    }
  }
  return cardFields;
}

function isMeaningful(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "" && value.trim() !== "<none>";
}

/** Structural floor only: it cannot establish that a condition, locus, or recovery is true. */
export function checkCard(text: string): CardCheck {
  const failures: string[] = [];
  if (!text.startsWith("# DIAGNOSTIC CARD\n")) {
    failures.push("missing '# DIAGNOSTIC CARD' heading");
  }

  const cardFields = fields(text);
  for (const field of REQUIRED_FIELDS) {
    if (!isMeaningful(cardFields.get(field))) failures.push(`missing '${field}'`);
  }

  const confidence = cardFields.get("Cause confidence");
  if (!["proven", "candidate", "unknown"].includes(confidence ?? "")) {
    failures.push("Cause confidence must be proven, candidate, or unknown");
  }

  const recoveryMode = cardFields.get("Recovery mode") as RecoveryMode | undefined;
  if (!["exact", "conditional", "investigate", "none"].includes(recoveryMode ?? "")) {
    failures.push("Recovery mode must be exact, conditional, investigate, or none");
    return { failures };
  }

  const recovery = cardFields.get("Validated recovery");
  const preconditions = cardFields.get("Preconditions");
  const nextObservation = cardFields.get("Next observation");
  if (recoveryMode === "exact" && (!isMeaningful(recovery) || recovery === "none")) {
    failures.push("exact recovery requires Validated recovery");
  }
  if (recoveryMode === "exact" && (!isMeaningful(preconditions) || preconditions === "none")) {
    failures.push("exact recovery requires Preconditions");
  }
  if (recoveryMode === "conditional" && (!isMeaningful(preconditions) || preconditions === "none")) {
    failures.push("conditional recovery requires Preconditions");
  }
  if (recoveryMode === "investigate" && (!isMeaningful(nextObservation) || nextObservation === "none")) {
    failures.push("investigate recovery requires Next observation");
  }
  return { failures };
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "diagnostic-card-check.ts",
      parameters: ["<card>"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  // Cleye leaves surplus positionals in the array instead of refusing them (writing-bun-scripts BG1).
  if (parsed._.length > 1) {
    throw new Error(`unexpected argument '${parsed._[1]}'`);
  }
  const card = parsed._[0];
  if (card === undefined) throw new Error("missing card path");
  const result = checkCard(await Bun.file(card).text());
  if (result.failures.length === 0) {
    process.stdout.write(`PASS ${card}: DIAGNOSTIC CARD structural floor\n`);
    return;
  }
  for (const failure of result.failures) process.stdout.write(`FAIL ${card}: ${failure}\n`);
  process.exitCode = 1;
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`FATAL: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  });
}
