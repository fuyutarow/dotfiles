import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
	inspectResearchDocs,
	type ResearchDocsInspection,
} from "../scripts/research-docs-check";

const CHECKER = new URL("../scripts/research-docs-check.ts", import.meta.url)
	.pathname;
const temporaryDirectories: string[] = [];
const RAW_CONTENT = '{"result":{"metrics":{"accuracy":0.91}}}\n';

type Bundle = {
	cleanup: () => void;
	generatedPath: string;
	knowledgeRoot: string;
	rawPath: string;
	rawRoot: string;
	researchRoot: string;
	reviewPath: string;
	statePath: string;
	evidencePath: string;
};

const sha256 = (value: string): string =>
	new Bun.CryptoHasher("sha256").update(value).digest("hex");

const write = (path: string, content: string): void => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
};

const replace = (path: string, before: string, after: string): void => {
	const current = readFileSync(path, "utf8");
	if (!current.includes(before))
		throw new Error(`fixture text not found: ${before}`);
	writeFileSync(path, current.replace(before, after));
};

const codes = (inspection: ResearchDocsInspection): Set<string> =>
	new Set(inspection.findings.map((finding) => finding.code));

const makeBundle = (state: "draft" | "stable" = "draft"): Bundle => {
	const researchRoot = mkdtempSync(join(tmpdir(), "research-docs-"));
	temporaryDirectories.push(researchRoot);
	const rawRoot = join(researchRoot, "raw");
	const knowledgeRoot = join(researchRoot, "knowledge");
	const rawPath = join(rawRoot, "experiments", "run.json");
	const evidencePath = join(knowledgeRoot, "evidence", "route.md");
	const statePath = join(knowledgeRoot, "canonicals", "question.md");
	const reviewPath = join(knowledgeRoot, "reviews", "question.md");
	const generatedPath = join(knowledgeRoot, "generated", "brief.md");
	write(rawPath, RAW_CONTENT);
	write(
		evidencePath,
		`---
type: research_evidence
title: "Evidence: route measurement"
description: "One immutable measurement bound to the raw experiment output."
status: stable
generated:
  by: process:research-ingest
  at: 2026-08-01T00:00:00Z
sources:
  - id: raw-run
    resource: ../../raw/experiments/run.json
rd_role: evidence
rd_evidence:
  source_id: raw-run
  sha256: ${sha256(RAW_CONTENT)}
  locator: "json-pointer:/result/metrics/accuracy"
---

# Observation

The recorded accuracy is 0.91.[^raw-run]

[^raw-run]: Raw experiment output at the declared locator.
`,
	);

	const verification =
		state === "stable"
			? `verified:
  by: human:owner-id
  at: 2026-08-02T00:00:00Z
`
			: "";
	write(
		statePath,
		`---
type: research_position
title: "Current answer: route comparison"
description: "The one current answer for the declared route-comparison question."
status: ${state}
generated:
  by: research-agent/model-v1
  at: 2026-08-01T12:00:00Z
${verification}stale_after: 2026-09-01
sources:
  - id: route-evidence
    resource: ../evidence/route.md
rd_role: canonical
rd_authority_key: implicit-backprop/routes
rd_owner: human:owner-id
rd_retire_when: "A decisive experiment or source correction changes the answer."
---

# Current answer

The route is currently supported under the measured condition.[^route-evidence]

[^route-evidence]: Evidence record for the measurement.
`,
	);
	const candidateSha256 = sha256(readFileSync(statePath, "utf8"));

	const reviewState = state === "stable" ? "accepted" : "open";
	const reviewStatus = state === "stable" ? "stable" : "draft";
	const decidedAt =
		state === "stable" ? "  decided_at: 2026-08-02T01:00:00Z\n" : "";
	write(
		reviewPath,
		`---
type: review_request
title: "Review request: route comparison"
description: "A bounded decision over the route-comparison candidate and evidence."
status: ${reviewStatus}
generated:
  by: human:owner-id
  at: 2026-08-01T13:00:00Z
stale_after: 2026-08-15
sources:
  - id: candidate
    resource: ../canonicals/question.md
  - id: route-evidence
    resource: ../evidence/route.md
rd_role: review_request
rd_owner: human:owner-id
rd_retire_when: "The reviewer records a decision or the candidate is withdrawn."
rd_review:
  candidate: ../canonicals/question.md
  candidate_sha256: ${candidateSha256}
  reviewer: human:reviewer-id
  decision: "Accept the candidate as the current route-comparison answer."
  state: ${reviewState}
${decidedAt}  questions:
    - id: evidence-boundary
      question: "Does the claim stay inside the measured condition?"
      evidence:
        - ../evidence/route.md
      accept_if: "The claim names the condition and cites the measurement."
---

# Decision requested

Review the candidate against the named evidence; do not copy the candidate here.
`,
	);

	write(
		generatedPath,
		`---
type: research_briefing
title: "Generated briefing: route comparison"
description: "An expiring view derived from the candidate and its evidence."
status: draft
generated:
  by: process:research-view
  at: 2026-08-01T14:00:00Z
stale_after: 2026-08-08
sources:
  - id: candidate
    resource: ../canonicals/question.md
  - id: route-evidence
    resource: ../evidence/route.md
rd_role: generated_view
rd_expires_at: 2026-08-08
rd_generated_from:
  - ../canonicals/question.md
  - ../evidence/route.md
---

# Disposable briefing

This view is navigation only and must not become a durable source.
`,
	);

	write(
		join(knowledgeRoot, "index.md"),
		`---
okf_version: "0.2"
---

# Research knowledge

- [Current answer](canonicals/question.md)
- [Evidence](evidence/route.md)
- [Review request](reviews/question.md)
`,
	);

	return {
		cleanup: () => rmSync(researchRoot, { force: true, recursive: true }),
		evidencePath,
		generatedPath,
		knowledgeRoot,
		rawPath,
		rawRoot,
		researchRoot,
		reviewPath,
		statePath,
	};
};

const inspect = async (bundle: Bundle): Promise<ResearchDocsInspection> =>
	inspectResearchDocs(bundle.knowledgeRoot, {
		rawRoot: bundle.rawRoot,
		today: "2026-08-02",
	});

const git = (cwd: string, ...args: string[]): void => {
	// bounded: local fixture repository with tiny files and no network remotes.
	const result = Bun.spawnSync(["git", ...args], {
		cwd,
		maxBuffer: 1024 * 1024,
	});
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.toString() || `git ${args.join(" ")} failed`);
	}
};

const commitFixture = (bundle: Bundle): void => {
	git(bundle.researchRoot, "init", "-q");
	git(bundle.researchRoot, "config", "user.email", "fixture@example.invalid");
	git(bundle.researchRoot, "config", "user.name", "Fixture");
	git(bundle.researchRoot, "add", ".");
	git(bundle.researchRoot, "commit", "-qm", "fixture base");
};

const refreshCandidateDigest = (bundle: Bundle): void => {
	const digest = sha256(readFileSync(bundle.statePath, "utf8"));
	const review = readFileSync(bundle.reviewPath, "utf8").replace(
		/candidate_sha256: [a-f0-9]{64}/,
		`candidate_sha256: ${digest}`,
	);
	writeFileSync(bundle.reviewPath, review);
};

const writeAcceptedCurrentReview = (bundle: Bundle, name: string): void => {
	const digest = sha256(readFileSync(bundle.statePath, "utf8"));
	const reviewPath = join(bundle.knowledgeRoot, "reviews", `${name}.md`);
	write(
		reviewPath,
		`---
type: review_request
title: "Review request: ${name}"
description: "A new decision over the current route-comparison candidate."
status: stable
generated:
  by: human:owner-id
  at: 2026-08-03T13:00:00Z
sources:
  - id: candidate
    resource: ../canonicals/question.md
  - id: route-evidence
    resource: ../evidence/route.md
rd_role: review_request
rd_owner: human:owner-id
rd_retire_when: "The decision becomes historical after a newer candidate."
rd_review:
  candidate: ../canonicals/question.md
  candidate_sha256: ${digest}
  reviewer: human:reviewer-id
  decision: "Accept the revised candidate as the current answer."
  state: accepted
  decided_at: 2026-08-04T01:00:00Z
  questions:
    - id: current-evidence
      question: "Does the revised candidate cite current stable evidence?"
      evidence:
        - ../evidence/route.md
      accept_if: "The candidate cites the evidence and states its condition."
---

# Recorded decision
`,
	);
	replace(
		join(bundle.knowledgeRoot, "index.md"),
		"- [Review request](reviews/question.md)",
		`- [Review request](reviews/question.md)\n- [Current review](reviews/${name}.md)`,
	);
};

const addDeprecatedPredecessor = (bundle: Bundle): string => {
	const predecessorPath = join(bundle.knowledgeRoot, "canonicals", "old.md");
	const predecessor = readFileSync(bundle.statePath, "utf8")
		.replace(
			'title: "Current answer: route comparison"',
			'title: "Deprecated answer: route comparison"',
		)
		.replace("status: stable", "status: deprecated");
	write(predecessorPath, predecessor);
	replace(
		bundle.statePath,
		"rd_owner: human:owner-id",
		"rd_supersedes:\n  - old.md\nrd_owner: human:owner-id",
	);
	replace(
		join(bundle.knowledgeRoot, "index.md"),
		"- [Evidence]",
		"- [Deprecated answer](canonicals/old.md)\n- [Evidence]",
	);
	refreshCandidateDigest(bundle);
	return predecessorPath;
};

afterEach(() => {
	while (temporaryDirectories.length > 0) {
		const directory = temporaryDirectories.pop();
		if (directory !== undefined)
			rmSync(directory, { force: true, recursive: true });
	}
});

describe("OKF compatibility and local profile boundary", () => {
	test("a type-only concept is OKF-conformant but fails the R&D profile", async () => {
		const researchRoot = mkdtempSync(join(tmpdir(), "okf-floor-"));
		temporaryDirectories.push(researchRoot);
		const root = join(researchRoot, "knowledge");
		const rawRoot = join(researchRoot, "raw");
		mkdirSync(rawRoot, { recursive: true });
		write(join(root, "concept.md"), "---\ntype: Note\n---\n\n# Note\n");

		const okf = await inspectResearchDocs(root, { mode: "okf" });
		const profile = await inspectResearchDocs(root, {
			mode: "profile",
			rawRoot,
			today: "2026-08-02",
		});
		expect(okf.findings).toHaveLength(0);
		expect([...codes(profile)]).toEqual(
			expect.arrayContaining([
				"RDS003",
				"RDS007",
				"RDS008",
				"RDS009",
				"RDS010",
			]),
		);
	});

	test("base OKF tolerates unknown fields and broken links while the profile rejects them", async () => {
		const bundle = makeBundle();
		replace(
			bundle.statePath,
			"rd_role: canonical",
			"x_vendor: value\nrd_role: canonical",
		);
		replace(
			bundle.statePath,
			"# Current answer",
			"# Current answer\n\nSee [missing](../missing.md).",
		);
		const okf = await inspectResearchDocs(bundle.knowledgeRoot, {
			mode: "okf",
		});
		const profile = await inspect(bundle);
		expect(okf.findings).toHaveLength(0);
		expect([...codes(profile)]).toEqual(
			expect.arrayContaining(["RDS006", "RDR050"]),
		);
	});

	test("duplicate top-level YAML keys fail the OKF parser floor", async () => {
		const bundle = makeBundle();
		replace(bundle.statePath, "status: draft", "status: stable\nstatus: draft");
		expect(codes(await inspect(bundle))).toContain("OKF003");
	});

	test("quoted duplicate YAML keys fail the OKF parser floor", async () => {
		const bundle = makeBundle();
		replace(
			bundle.statePath,
			"status: draft",
			'status: draft\n"status": stable',
		);
		expect(codes(await inspect(bundle))).toContain("OKF003");
	});

	test("excessive YAML alias expansion is a content finding, not a fatal crash", async () => {
		const bundle = makeBundle();
		const aliases = Array.from({ length: 101 }, () => "*probe").join(", ");
		replace(
			bundle.statePath,
			"status: draft",
			`rd_probe: &probe [1, 2, 3]\nrd_expansion: [${aliases}]\nstatus: draft`,
		);
		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			mode: "okf",
		});
		expect(codes(result)).toContain("OKF004");
	});

	test("profile source identifiers are stable citation keys", async () => {
		const bundle = makeBundle();
		replace(bundle.generatedPath, "id: candidate", "id: bad id");
		expect(codes(await inspect(bundle))).toContain("RDS042");
	});
});

describe("valid role and review lifecycles", () => {
	test("a draft canonical with one open review and a disposable view passes", async () => {
		const bundle = makeBundle();
		const result = await inspect(bundle);
		expect(result.findings).toEqual([]);
		expect(result.concepts).toBe(4);
	});

	test("a stable canonical with current human verification and accepted review passes", async () => {
		const bundle = makeBundle("stable");
		expect((await inspect(bundle)).findings).toEqual([]);
	});

	test("stable canonical fails without a current human verifier and accepted review", async () => {
		const bundle = makeBundle();
		replace(bundle.statePath, "status: draft", "status: stable");
		const result = await inspect(bundle);
		expect([...codes(result)]).toEqual(
			expect.arrayContaining(["RDL003", "RDA002"]),
		);
	});

	test("human verification older than generated.at does not authorize stable content", async () => {
		const bundle = makeBundle("stable");
		replace(
			bundle.statePath,
			"at: 2026-08-02T00:00:00Z",
			"at: 2026-07-31T00:00:00Z",
		);
		expect(codes(await inspect(bundle))).toContain("RDL003");
	});

	test("impossible calendar datetimes are rejected", async () => {
		const bundle = makeBundle();
		replace(
			bundle.evidencePath,
			"2026-08-01T00:00:00Z",
			"2026-02-30T00:00:00Z",
		);
		expect(codes(await inspect(bundle))).toContain("RDS013");
	});

	test("draft canonical requires exactly one open review request", async () => {
		const bundle = makeBundle();
		replace(
			bundle.reviewPath,
			"state: open",
			"state: rejected\n  decided_at: 2026-08-02T01:00:00Z",
		);
		replace(bundle.reviewPath, "status: draft", "status: stable");
		expect(codes(await inspect(bundle))).toContain("RDA001");
	});

	test("an open review pins the exact candidate bytes", async () => {
		const bundle = makeBundle();
		const review = readFileSync(bundle.reviewPath, "utf8").replace(
			/candidate_sha256: [a-f0-9]{64}/,
			`candidate_sha256: ${"b".repeat(64)}`,
		);
		writeFileSync(bundle.reviewPath, review);
		expect(codes(await inspect(bundle))).toContain("RDI020");
	});

	test("a placeholder owner is not a valid accountable actor", async () => {
		const bundle = makeBundle();
		replace(bundle.statePath, "rd_owner: human:owner-id", "rd_owner: TBD");
		expect(codes(await inspect(bundle))).toContain("RDS052");
	});

	test("expired canonical and open review fail independently", async () => {
		const bundle = makeBundle();
		replace(
			bundle.statePath,
			"stale_after: 2026-09-01",
			"stale_after: 2026-08-02",
		);
		replace(
			bundle.reviewPath,
			"stale_after: 2026-08-15",
			"stale_after: 2026-08-02",
		);
		const result = await inspect(bundle);
		expect([...codes(result)]).toEqual(
			expect.arrayContaining(["RDL002", "RDL012"]),
		);
	});

	test("a stable current candidate needs an accepted review of its current digest", async () => {
		const bundle = makeBundle("stable");
		replace(
			bundle.statePath,
			"at: 2026-08-01T12:00:00Z",
			"at: 2026-08-03T12:00:00Z",
		);
		replace(
			bundle.statePath,
			"at: 2026-08-02T00:00:00Z",
			"at: 2026-08-04T00:00:00Z",
		);
		replace(
			bundle.statePath,
			"The route is currently supported",
			"The revised route is currently supported",
		);

		const withoutCurrentReview = await inspectResearchDocs(
			bundle.knowledgeRoot,
			{
				rawRoot: bundle.rawRoot,
				today: "2026-08-04",
			},
		);
		expect(codes(withoutCurrentReview)).toContain("RDA002");

		writeAcceptedCurrentReview(bundle, "question-revision");
		const withCurrentReview = await inspectResearchDocs(bundle.knowledgeRoot, {
			rawRoot: bundle.rawRoot,
			today: "2026-08-04",
		});
		expect(withCurrentReview.findings).toEqual([]);
	});
});

describe("authority, provenance, and anti-drift invariants", () => {
	test("two active canonicals with one authority key fail", async () => {
		const bundle = makeBundle();
		const duplicate = readFileSync(bundle.statePath, "utf8").replace(
			'title: "Current answer: route comparison"',
			'title: "Competing answer: route comparison"',
		);
		write(join(bundle.knowledgeRoot, "canonicals", "duplicate.md"), duplicate);
		replace(
			join(bundle.knowledgeRoot, "index.md"),
			"- [Evidence]",
			"- [Competing answer](canonicals/duplicate.md)\n- [Evidence]",
		);
		expect(codes(await inspect(bundle))).toContain("RDL030");
	});

	test("raw digest mismatch and an escaping evidence source fail", async () => {
		const bundle = makeBundle();
		writeFileSync(bundle.rawPath, '{"changed":true}\n');
		let result = await inspect(bundle);
		expect(codes(result)).toContain("RDI010");

		replace(
			bundle.evidencePath,
			"../../raw/experiments/run.json",
			"../../../outside.json",
		);
		result = await inspect(bundle);
		expect([...codes(result)]).toEqual(
			expect.arrayContaining(["RDR001", "RDR021"]),
		);
	});

	test("a raw-path symlink cannot escape the configured raw root", async () => {
		const bundle = makeBundle();
		const outsidePath = join(bundle.researchRoot, "outside-run.json");
		write(outsidePath, RAW_CONTENT);
		unlinkSync(bundle.rawPath);
		symlinkSync(outsidePath, bundle.rawPath);

		expect([...codes(await inspect(bundle))]).toEqual(
			expect.arrayContaining(["RDR001", "RDR021"]),
		);
	});

	test("evidence locators must use a typed syntax and resolve in the raw artifact", async () => {
		const invalidSyntax = makeBundle();
		replace(
			invalidSyntax.evidencePath,
			"json-pointer:/result/metrics/accuracy",
			"definitely-not-present",
		);
		expect(codes(await inspect(invalidSyntax))).toContain("RDS066");

		const absentPointer = makeBundle();
		replace(
			absentPointer.evidencePath,
			"json-pointer:/result/metrics/accuracy",
			"json-pointer:/result/metrics/missing",
		);
		expect(codes(await inspect(absentPointer))).toContain("RDR024");
	});

	test("whole-artifact and bounded line locators are accepted", async () => {
		const whole = makeBundle();
		replace(
			whole.evidencePath,
			"json-pointer:/result/metrics/accuracy",
			"whole",
		);
		expect((await inspect(whole)).findings).toEqual([]);

		const line = makeBundle();
		replace(
			line.evidencePath,
			"json-pointer:/result/metrics/accuracy",
			"line:1",
		);
		expect((await inspect(line)).findings).toEqual([]);
	});

	test("canonical sources must be stable evidence and cited in a claim", async () => {
		const bundle = makeBundle();
		replace(
			bundle.statePath,
			"resource: ../evidence/route.md",
			"resource: ../generated/brief.md",
		);
		replace(bundle.statePath, "[^route-evidence]", "without-citation");
		const result = await inspect(bundle);
		expect([...codes(result)]).toEqual(
			expect.arrayContaining(["RDR010", "RDR011"]),
		);
	});

	test("durable concepts cannot link to generated views", async () => {
		const bundle = makeBundle();
		replace(
			bundle.statePath,
			"# Current answer",
			"# Current answer\n\nSee [temporary briefing](../generated/brief.md).",
		);
		expect(codes(await inspect(bundle))).toContain("RDR051");
	});

	test("a file URI cannot hide a generated-view dependency", async () => {
		const bundle = makeBundle();
		replace(
			bundle.statePath,
			"# Current answer",
			`# Current answer\n\nSee [temporary briefing](${pathToFileURL(bundle.generatedPath).href}).`,
		);
		refreshCandidateDigest(bundle);
		expect(codes(await inspect(bundle))).toContain("RDR050");
	});

	test("reference-style Markdown links cannot hide a generated-view dependency", async () => {
		const bundle = makeBundle();
		replace(
			bundle.statePath,
			"# Current answer",
			"# Current answer\n\nSee [temporary briefing][brief].\n\n[brief]: ../generated/brief.md",
		);
		expect(codes(await inspect(bundle))).toContain("RDR051");
	});

	test("an unused reference definition is not treated as a dependency", async () => {
		const bundle = makeBundle();
		replace(
			bundle.statePath,
			"# Current answer",
			"# Current answer\n\n[unused-brief]: ../generated/brief.md",
		);
		refreshCandidateDigest(bundle);
		expect((await inspect(bundle)).findings).toEqual([]);
	});

	test("review questions require typed evidence and exact source coverage", async () => {
		const bundle = makeBundle();
		replace(
			bundle.reviewPath,
			"evidence:\n        - ../evidence/route.md",
			"evidence:\n        - ../generated/brief.md",
		);
		const result = await inspect(bundle);
		expect([...codes(result)]).toEqual(
			expect.arrayContaining(["RDR041", "RDR044"]),
		);
	});

	test("semantic adequacy remains a human gate even when the review shape passes", async () => {
		const bundle = makeBundle();
		replace(
			bundle.reviewPath,
			"Accept the candidate as the current route-comparison answer.",
			"Do you like this?",
		);
		replace(
			bundle.reviewPath,
			"Does the claim stay inside the measured condition?",
			"Is it good?",
		);
		replace(
			bundle.reviewPath,
			"The claim names the condition and cites the measurement.",
			"The reviewer says yes.",
		);
		expect((await inspect(bundle)).findings).toEqual([]);
	});

	test("ordinary concept-link cycles are allowed", async () => {
		const bundle = makeBundle();
		replace(
			bundle.statePath,
			"# Current answer",
			"# Current answer\n\nSee [evidence](../evidence/route.md).",
		);
		replace(
			bundle.evidencePath,
			"# Observation",
			"# Observation\n\nSee [current interpretation](../canonicals/question.md).",
		);
		refreshCandidateDigest(bundle);
		expect((await inspect(bundle)).findings).toEqual([]);
	});

	test("every durable concept must be reachable from the root index", async () => {
		const bundle = makeBundle();
		replace(
			join(bundle.knowledgeRoot, "index.md"),
			"- [Review request](reviews/question.md)\n",
			"",
		);
		expect(codes(await inspect(bundle))).toContain("RDR071");
	});
});

describe("generated-view and retirement policy", () => {
	test("generated views are draft-only, unverified, expiring, and source-aligned", async () => {
		const bundle = makeBundle();
		replace(bundle.generatedPath, "status: draft", "status: stable");
		replace(
			bundle.generatedPath,
			"stale_after: 2026-08-08",
			"verified: { by: human:owner-id, at: 2026-08-02T00:00:00Z }\nstale_after: 2026-08-09",
		);
		replace(
			bundle.generatedPath,
			"rd_expires_at: 2026-08-08",
			"rd_expires_at: 2026-09-30",
		);
		replace(bundle.generatedPath, "  - ../evidence/route.md\n---", "---");
		const result = await inspect(bundle);
		expect([...codes(result)]).toEqual(
			expect.arrayContaining([
				"RDS080",
				"RDS081",
				"RDL022",
				"RDL023",
				"RDR034",
			]),
		);
	});

	test("expired generated views fail and may be deleted", async () => {
		const bundle = makeBundle();
		expect(
			codes(
				await inspectResearchDocs(bundle.knowledgeRoot, {
					rawRoot: bundle.rawRoot,
					today: "2026-08-08",
				}),
			),
		).toContain("RDL024");

		commitFixture(bundle);
		unlinkSync(bundle.generatedPath);
		const afterDelete = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		expect(afterDelete.findings).toEqual([]);
	});

	test("deprecated canonical needs one successor or a retirement reason", async () => {
		const bundle = makeBundle("stable");
		replace(bundle.statePath, "status: stable", "status: deprecated");
		replace(
			bundle.statePath,
			"rd_retire_when:",
			'rd_retired_reason: "No replacement was selected."\nrd_retire_when:',
		);
		refreshCandidateDigest(bundle);
		expect((await inspect(bundle)).findings).toEqual([]);

		replace(
			bundle.statePath,
			'rd_retired_reason: "No replacement was selected."\n',
			"",
		);
		expect(codes(await inspect(bundle))).toContain("RDL034");
	});

	test("a same-key deprecated predecessor and one successor pass", async () => {
		const bundle = makeBundle("stable");
		addDeprecatedPredecessor(bundle);
		expect((await inspect(bundle)).findings).toEqual([]);
	});

	test("supersession across authority keys and supersession cycles fail", async () => {
		const bundle = makeBundle("stable");
		const predecessorPath = addDeprecatedPredecessor(bundle);
		replace(
			predecessorPath,
			"rd_authority_key: implicit-backprop/routes",
			"rd_authority_key: another/question\nrd_supersedes:\n  - question.md",
		);
		const result = await inspect(bundle);
		expect([...codes(result)]).toEqual(
			expect.arrayContaining(["RDL031", "RDL032", "RDL033"]),
		);
	});
});

describe("Git append-only and durable-history floor", () => {
	test("raw and evidence modifications fail relative to an explicit base", async () => {
		const bundle = makeBundle();
		commitFixture(bundle);
		writeFileSync(bundle.rawPath, '{"changed":true}\n');
		replace(
			bundle.evidencePath,
			"The recorded accuracy",
			"The rewritten accuracy",
		);
		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		expect([...codes(result)]).toEqual(
			expect.arrayContaining(["RDI001", "RDI002"]),
		);
	});

	test("changing raw and its digest together cannot bypass append-only history", async () => {
		const bundle = makeBundle();
		commitFixture(bundle);
		const changed = '{"result":{"metrics":{"accuracy":1}}}\n';
		writeFileSync(bundle.rawPath, changed);
		replace(bundle.evidencePath, sha256(RAW_CONTENT), sha256(changed));
		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		expect([...codes(result)]).toEqual(
			expect.arrayContaining(["RDI001", "RDI002"]),
		);
		expect(codes(result)).not.toContain("RDI010");
	});

	test("new raw and evidence records are allowed additions", async () => {
		const bundle = makeBundle();
		commitFixture(bundle);
		const newRaw = '{"result":"negative"}\n';
		write(join(bundle.rawRoot, "experiments", "negative.json"), newRaw);
		write(
			join(bundle.knowledgeRoot, "evidence", "negative.md"),
			`---
type: research_evidence
title: "Evidence: negative result"
description: "A preserved negative result from one immutable raw artifact."
status: stable
generated: { by: process:research-ingest, at: 2026-08-02T01:00:00Z }
sources:
  - id: raw-negative
    resource: ../../raw/experiments/negative.json
rd_role: evidence
rd_evidence:
  source_id: raw-negative
  sha256: ${sha256(newRaw)}
  locator: "json-pointer:/result"
---

# Observation

The run recorded a negative result.[^raw-negative]

[^raw-negative]: Raw negative-result artifact.
`,
		);
		replace(
			join(bundle.knowledgeRoot, "index.md"),
			"- [Review request]",
			"- [Negative result](evidence/negative.md)\n- [Review request]",
		);
		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		expect(result.findings).toEqual([]);
	});

	test("deleting a durable concept fails even when generated deletion is allowed", async () => {
		const bundle = makeBundle();
		commitFixture(bundle);
		unlinkSync(bundle.statePath);
		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		expect(codes(result)).toContain("RDI003");
	});

	test("renaming a durable concept is detected from Git R100 status", async () => {
		const bundle = makeBundle();
		commitFixture(bundle);
		renameSync(
			bundle.statePath,
			join(bundle.knowledgeRoot, "canonicals", "renamed.md"),
		);
		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		expect(codes(result)).toContain("RDI003");
	});

	test("type-changing a durable concept to a symlink is rejected", async () => {
		const bundle = makeBundle();
		commitFixture(bundle);
		const replacement = join(bundle.researchRoot, "replacement.md");
		write(replacement, readFileSync(bundle.statePath, "utf8"));
		unlinkSync(bundle.statePath);
		symlinkSync(replacement, bundle.statePath);
		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		expect(codes(result)).toContain("RDI003");
	});

	test("a closed review decision is immutable", async () => {
		const bundle = makeBundle("stable");
		commitFixture(bundle);
		replace(
			bundle.reviewPath,
			"Accept the candidate",
			"Silently revise the decision and accept the candidate",
		);
		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		expect(codes(result)).toContain("RDI005");
	});

	test("a stable canonical body change needs a newer derivation and review", async () => {
		const bundle = makeBundle("stable");
		commitFixture(bundle);
		replace(
			bundle.statePath,
			"The route is currently supported",
			"The changed route is currently supported",
		);
		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		expect([...codes(result)]).toEqual(
			expect.arrayContaining(["RDI006", "RDA002"]),
		);
	});

	test("a committed raw and evidence rewrite is detected against HEAD^", async () => {
		const bundle = makeBundle();
		commitFixture(bundle);
		const changed = '{"result":{"metrics":{"accuracy":1}}}\n';
		writeFileSync(bundle.rawPath, changed);
		replace(bundle.evidencePath, sha256(RAW_CONTENT), sha256(changed));
		replace(
			bundle.evidencePath,
			"The recorded accuracy",
			"The rewritten accuracy",
		);
		git(bundle.researchRoot, "add", ".");
		git(bundle.researchRoot, "commit", "-qm", "rewrite raw and evidence");

		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD^",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		expect([...codes(result)]).toEqual(
			expect.arrayContaining(["RDI001", "RDI002"]),
		);
		expect(codes(result)).not.toContain("RDI010");
	});
});

describe("CLI contract", () => {
	test("valid bundle emits a bounded PASS and exit 0", () => {
		const bundle = makeBundle();
		// bounded: one-shot checker over four tiny fixture concepts.
		const process = Bun.spawnSync(
			[
				"bun",
				CHECKER,
				"--root",
				bundle.knowledgeRoot,
				"--raw-root",
				bundle.rawRoot,
				"--today",
				"2026-08-02",
			],
			{ maxBuffer: 1024 * 1024 },
		);
		expect(process.exitCode).toBe(0);
		expect(process.stdout.toString()).toContain("OKF v0.2 + R&D profile valid");
		expect(process.stdout.toString()).toContain("FAIL=0");
	});

	test("unknown options and invalid base are fatal exit 2", () => {
		const bundle = makeBundle();
		// bounded: one-shot CLI boundary probes over a tiny fixture.
		const unknown = Bun.spawnSync(
			["bun", CHECKER, "--root", bundle.knowledgeRoot, "--wat"],
			{
				maxBuffer: 1024 * 1024,
			},
		);
		const invalidBase = Bun.spawnSync(
			[
				"bun",
				CHECKER,
				"--root",
				bundle.knowledgeRoot,
				"--raw-root",
				bundle.rawRoot,
				"--base",
				"definitely-not-a-commit",
			],
			{ maxBuffer: 1024 * 1024 },
		);
		expect(unknown.exitCode).toBe(1);
		expect(invalidBase.exitCode).toBe(2);
	});
});
