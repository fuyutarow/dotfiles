import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// DETERMINISTIC LEXICAL DESCRIPTION CONTRACT.
// Checks agreed text, polarity, and order. NOT a selector, trigger evaluation,
// model-inference test, or proof of live routing behavior.
const DESCRIPTION_BUDGET = 960;
const SKILLS_ROOT = resolve(import.meta.dir, "../..");

const FAMILY = [
  "directing-research",
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
		"bare research programme: D leads before O overlay",
		[
			["directing-research", /Bare .+ starts here; orchestration follows a signed domain map/iu],
			["orchestrating-agents", /裸の「研究を進めて」では発火せず.+署名後にoverlay/u],
		],
	],
	[
		"Japanese research-problem formulation: D positive, R negative",
		[
			["directing-research", /Use for .+研究問題\/研究課題の解像度・具体化・定式化/iu],
			["raising-resolution", /research-problem\/課題 解像度・具体化・定式化\s*→\s*directing-research/iu],
		],
	],
	[
		"standalone resolution: R only inspects an existing present artifact",
		[["raising-resolution", /Standalone 解像度 fires only for factual present-state inspection of an existing artifact/iu]],
	],
	[
		"present fact: D yields to R and R stops at one citation",
		[
			["directing-research", /fact→raising-resolution \(silent cited row only\)/iu],
			["raising-resolution", /one citation→stop and hand off the observation/iu],
		],
	],
	[
		"research-process postmortem: D owns meaning, O limits itself to controls",
		[
			["directing-research", /Directs CREATIVE RESEARCH:.+RESEARCH PROCESS POSTMORTEM/iu],
			["orchestrating-agents", /Postmortem.+control-plane failureだけ/iu],
		],
	],
	[
		"generic software incident: D and O route to implementation/debugging",
		[
			["directing-research", /generic software incident\/postmortem→implementing-and-debugging/iu],
			["orchestrating-agents", /generic software incident\/postmortem\s*→\s*implementing-and-debugging/iu],
		],
	],
	[
		"dispatch retrospective: D yields to O control-plane ownership",
		[
			["directing-research", /topology\/dispatch review→orchestrating-agents/iu],
			["orchestrating-agents", /Postmortem.+dispatch\/pacing\/delegation.+control-plane failureだけ/iu],
		],
	],
	[
		"premise exposure: D yields and B forbids thesis candidates",
		[
			["directing-research", /premises→surfacing-blind-spots/iu],
			["surfacing-blind-spots", /Emits one Blind-spot packet; never solutions or thesis candidates/iu],
		],
	],
	[
		"B/A reciprocal: premises go to B; expensive selected bets go to A",
		[
			["acting-on-hypotheses", /tacit premises→surfacing-blind-spots/iu],
			["surfacing-blind-spots", /expensive\/irreversible bet\s*→\s*acting-on-hypotheses/iu],
		],
	],
	[
		"thesis/mapping and collapsed-batch recovery: F returns once to D",
		[
			["directing-research", /thesis\/mapping→forging-novel-theses/iu],
			["forging-novel-theses", /Owns GENESIS and selected-target mapping/iu],
			["forging-novel-theses", /frozen\/deduplicated batch collapses.+Recovery regenerates once.+explicit COVERAGE GAP.+freeze\/dedup, and admission\s*→\s*directing-research/iu],
		],
	],
	[
		"donor discovery: S stops before F target mapping",
		[
			["systematizing-knowledge", /target-agnostic `DONOR SET`.+target correspondence\/prediction\/thesis\s*→\s*forging-novel-theses/iu],
			["forging-novel-theses", /Never .+ discovers donors\. Donor discovery\s*→\s*systematizing-knowledge/iu],
		],
	],
	[
		"one costly selected tree: D yields and A owns threshold/action",
		[
			["directing-research", /expensive tree→acting-on-hypotheses/iu],
			["acting-on-hypotheses", /ONE SELECTED hypothesis tree.+load-bearing bet.+expensive or hard-to-reverse\/irreversible work/iu],
		],
	],
	[
		"cheap reversible probe: A routes to the plain executor",
		[["acting-on-hypotheses", /cheap deterministic reversible probe without expensive downstream exposure→domain\/plain executor/iu]],
	],
	[
		"finished claim and qualified section aliases: D yields to P",
		[
			["directing-research", /finished claim→arguing-research-papers/iu],
			["arguing-research-papers", /Argues ONE FINISHED research CLAIM via CLAIM SPEC/iu],
			["arguing-research-papers", /Use for CLAIM\/ARGUMENT work on abstract, introduction\/intro, Limitations, related work\/ related-work/iu],
		],
	],
	[
		"paper typo or format-only edit: P routes direct",
		[["arguing-research-papers", /typo\/format-only[^.;]*→\s*direct\/plain edit/iu]],
	],
	[
		"paper corpus synthesis: P yields; S signs before G admission",
		[
			["arguing-research-papers", /corpus synthesis\s*(?:→|->)\s*systematizing-knowledge/iu],
			["systematizing-knowledge", /Systematizes a source CORPUS into a known\/uncertain\/disputed\/missing position/iu],
			["systematizing-knowledge", /signs the corpus position first; governing-research-documentation then decides admission and authority/iu],
		],
	],
	[
		"durable research judgments: D keeps meaning; G admits loci",
		[
			["directing-research", /docs→governing-research-documentation/iu],
			["governing-research-documentation", /durable RUN INTENT\/RECEIPT\/RETROSPECTIVE JUDGMENT, directing-research owns semantic verdict\/programme move; HERE admits loci/iu],
		],
	],
	[
		"transient task: G yields and C owns resumable task state",
		[
			["governing-research-documentation", /transient task\s*→\s*continuing-long-running-tasks/iu],
			["continuing-long-running-tasks", /Keeps work resumable when task state must cross compact, session, executor, interruption, or handoff/iu],
		],
	],
	[
		"continuity order: record before overlay before writer checkpoint",
		[
			["orchestrating-agents", /continuity record\s*(?:→|->)\s*orchestration overlay\s*(?:→|->)\s*writer checkpoint/iu],
			["continuing-long-running-tasks", /continuity record\s*(?:→|->)\s*orchestration overlay\s*(?:→|->)\s*writer checkpoint/iu],
		],
	],
	[
		"D/C reciprocal: D yields transport; C yields programme judgment",
		[
			["directing-research", /transport→continuing-long-running-tasks/iu],
			["continuing-long-running-tasks", /programme judgment alone→directing-research/iu],
		],
	],
];

describe("DETERMINISTIC LEXICAL DESCRIPTION CONTRACT — not live routing proof", () => {
  test(`all ten descriptions fit DESCRIPTION_BUDGET=${DESCRIPTION_BUDGET}`, () => {
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
