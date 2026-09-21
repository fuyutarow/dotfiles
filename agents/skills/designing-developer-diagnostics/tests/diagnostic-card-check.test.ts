import { expect, test } from "bun:test";
import { checkCard } from "../scripts/diagnostic-card-check.ts";

const validCard = `# DIAGNOSTIC CARD
Surface: cli
Severity: error
Machine contract: exit=2; channel=stderr
Renderer: terminal
Observed condition: request exceeds the maximum
Evidence / locus: request.limit
Cause confidence: proven
Primary message: \`limit\` exceeds the maximum of 100
Related loci: none
Recovery mode: exact
Validated recovery: set \`limit\` to 100 or less
Preconditions: the documented request schema applies
Next observation: none
Positive case: limit=101
Negative case: limit=100
Receipt: tool check exits 2 on the positive case
`;

test("accepts a complete exact-recovery card", () => {
  expect(checkCard(validCard).failures).toEqual([]);
});

test("rejects an exact recovery without tested preconditions", () => {
  const invalid = validCard.replace("Preconditions: the documented request schema applies", "Preconditions: none");
  expect(checkCard(invalid).failures).toContain("exact recovery requires Preconditions");
});

test("rejects investigation without a discriminating observation", () => {
  const invalid = validCard
    .replace("Recovery mode: exact", "Recovery mode: investigate")
    .replace("Next observation: none", "Next observation: none");
  expect(checkCard(invalid).failures).toContain("investigate recovery requires Next observation");
});
