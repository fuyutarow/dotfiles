import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// DETERMINISTIC LEXICAL DESCRIPTION CONTRACT.
// Checks agreed text, polarity, and order. NOT a selector, trigger evaluation,
// model-inference test, or proof of live routing behavior.
const DESCRIPTION_BUDGET = 1024;
const SKILLS_ROOT = resolve(import.meta.dir, "../..");

const FAMILY = [
  "directing-research",
  "supervising-research-programmes",
  "directing-research-sections",
  "auditing-research-processes",
  "orchestrating-agents",
  "raising-resolution",
  "systematizing-knowledge",
  "forging-novel-theses",
  "arguing-research-papers",
  "surfacing-blind-spots",
  "acting-on-hypotheses",
  "governing-research-documentation",
  "continuing-long-running-tasks",
] as const;

type FamilySkill = (typeof FAMILY)[number];
type Assertion = readonly [skill: FamilySkill, pattern: RegExp];
type Contract = readonly [name: string, assertions: readonly Assertion[]];

function description(skill: FamilySkill): string {
  const text = readFileSync(resolve(SKILLS_ROOT, skill, "SKILL.md"), "utf8");
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/u)?.[1];
  if (frontmatter === undefined)
    throw new Error(`${skill}: missing frontmatter`);
  const lines = frontmatter.split("\n");
  const start = lines.indexOf("description: >-");
  if (start === -1)
    throw new Error(`${skill}: description must use folded >- form`);
  const valueLines: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("  ")) break;
    valueLines.push(line.slice(2).trim());
  }
  if (valueLines.length === 0) throw new Error(`${skill}: empty description`);
  return valueLines.join(" ").replaceAll(/\s+/g, " ").trim();
}

// biome-ignore format: keep the lexical matrix compact and below the component-size ceiling.
const CONTRACTS: readonly Contract[] = [
  [
    "legacy shim owns routing only",
    [
      ["directing-research", /Routes legacy broad or ambiguous creative-research invocations/iu],
      ["directing-research", /emits a routing decision only/iu],
      ["directing-research", /owns no programme, section, candidate, admission, run, audit, retrospective, or transition semantics/iu],
    ],
  ],
  [
    "programme asks route to the programme supervisor",
    [
      ["directing-research", /Programme\/frame\/portfolio→supervising-research-programmes/iu],
      ["supervising-research-programmes", /programme-level relevance, coverage, and allocation/iu],
      ["supervising-research-programmes", /never a section's method or run/iu],
    ],
  ],
  [
    "one granted section routes to the section director",
    [
      ["directing-research", /one granted section\/candidate-test\/run\/learning→directing-research-sections/iu],
      ["directing-research-sections", /Directs exactly ONE granted research section/iu],
      ["directing-research-sections", /never changes a programme/iu],
    ],
  ],
  [
    "frozen episode routes to the process auditor",
    [
      ["directing-research", /frozen episode\/process postmortem→auditing-research-processes/iu],
      ["auditing-research-processes", /Audits one frozen research episode's evidence and process integrity/iu],
      ["auditing-research-processes", /never directs live work or enacts a transition/iu],
    ],
  ],
  [
    "specific v2 asks bypass the compatibility shim",
    [
      ["directing-research", /Specific asks invoke those skills directly/iu],
      ["supervising-research-programmes", /section execution belongs to directing-research-sections/iu],
      ["supervising-research-programmes", /terminal process review belongs to auditing-research-processes/iu],
    ],
  ],
  [
    "documentation continuity and control remain external",
    [
      ["directing-research", /Documentation→governing-research-documentation/iu],
      ["directing-research", /continuity→continuing-long-running-tasks/iu],
      ["directing-research", /dispatch\/visibility→orchestrating-agents/iu],
    ],
  ],
  [
    "worker specialists retain their own verbs",
    [
      ["raising-resolution", /Inspects ONE factual present-state row/iu],
      ["systematizing-knowledge", /Systematizes a source CORPUS/iu],
      ["surfacing-blind-spots", /Exposes blind spots in ONE existing plan, frame, or decision artifact/iu],
      ["forging-novel-theses", /Generates a BATCH of testable thesis CANDIDATES/iu],
      ["acting-on-hypotheses", /Acts on ONE SELECTED hypothesis tree/iu],
      ["arguing-research-papers", /Argues ONE FINISHED research CLAIM/iu],
    ],
  ],
  [
    "orchestration is still an overlay rather than research meaning",
    [
      ["orchestrating-agents", /control plane/iu],
      ["orchestrating-agents", /Domain content\/skill craftは各owner/iu],
    ],
  ],
];

describe("DETERMINISTIC LEXICAL DESCRIPTION CONTRACT — not live routing proof", () => {
  test(`all thirteen descriptions fit DESCRIPTION_BUDGET=${DESCRIPTION_BUDGET}`, () => {
    for (const skill of FAMILY)
      expect(
        [...description(skill)].length,
        `${skill}: Unicode length`,
      ).toBeLessThanOrEqual(DESCRIPTION_BUDGET);
  });
  for (const [name, assertions] of CONTRACTS)
    test(name, () => {
      for (const [skill, pattern] of assertions)
        expect(description(skill), `${skill}: lexical contract only`).toMatch(
          pattern,
        );
    });
});
