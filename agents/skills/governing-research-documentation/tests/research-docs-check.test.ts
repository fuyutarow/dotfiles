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
const EVIDENCE_NAME = "evi202608_001-route_measurement.md";
const CANONICAL_NAME = "pos202608_001-route_comparison.md";
const REVIEW_NAME = "rev202608_001-route_comparison.md";
const GENERATED_NAME = "view202608_001-route_comparison.md";

type Bundle = {
	cleanup: () => void;
	generatedPath: string;
	knowledgeRoot: string;
	rawPath: string;
	rawRoot: string;
	researchRoot: string;
	reviewPath: string;
	registryPath: string;
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
	const evidencePath = join(knowledgeRoot, "evidence", EVIDENCE_NAME);
	const statePath = join(knowledgeRoot, "canonicals", CANONICAL_NAME);
	const reviewPath = join(knowledgeRoot, "reviews", REVIEW_NAME);
	const generatedPath = join(knowledgeRoot, "generated", GENERATED_NAME);
	const registryPath = join(knowledgeRoot, "rd-types.json");
	write(rawPath, RAW_CONTENT);
	write(
		registryPath,
		`${JSON.stringify(
			{
				schema: "rd-document-types/v1",
				type_codes: {
					research_briefing: "view",
					research_evidence: "evi",
					research_position: "pos",
					review_request: "rev",
				},
			},
			null,
			2,
		)}\n`,
	);
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
rd_document_id: evi202608_001
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
    resource: ../evidence/${EVIDENCE_NAME}
rd_document_id: pos202608_001
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
    resource: ../canonicals/${CANONICAL_NAME}
  - id: route-evidence
    resource: ../evidence/${EVIDENCE_NAME}
rd_document_id: rev202608_001
rd_role: review_request
rd_owner: human:owner-id
rd_retire_when: "The reviewer records a decision or the candidate is withdrawn."
rd_review:
  candidate: ../canonicals/${CANONICAL_NAME}
  candidate_sha256: ${candidateSha256}
  reviewer: human:reviewer-id
  decision: "Accept the candidate as the current route-comparison answer."
  state: ${reviewState}
${decidedAt}  questions:
    - id: evidence-boundary
      question: "Does the claim stay inside the measured condition?"
      evidence:
        - ../evidence/${EVIDENCE_NAME}
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
    resource: ../canonicals/${CANONICAL_NAME}
  - id: route-evidence
    resource: ../evidence/${EVIDENCE_NAME}
rd_document_id: view202608_001
rd_role: generated_view
rd_expires_at: 2026-08-08
rd_generated_from:
  - ../canonicals/${CANONICAL_NAME}
  - ../evidence/${EVIDENCE_NAME}
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

- [Current answer](canonicals/${CANONICAL_NAME})
- [Evidence](evidence/${EVIDENCE_NAME})
- [Review request](reviews/${REVIEW_NAME})
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
		registryPath,
		statePath,
	};
};

const renameEvidenceFile = (bundle: Bundle, nextName: string): void => {
	const nextPath = join(bundle.knowledgeRoot, "evidence", nextName);
	renameSync(bundle.evidencePath, nextPath);
	for (const path of [
		bundle.statePath,
		bundle.reviewPath,
		bundle.generatedPath,
		join(bundle.knowledgeRoot, "index.md"),
	]) {
		writeFileSync(
			path,
			readFileSync(path, "utf8").replaceAll(EVIDENCE_NAME, nextName),
		);
	}
};

const addGeneratedView = (
	bundle: Bundle,
	sequence: number,
	contentTitle: string,
): string => {
	const paddedSequence = sequence.toString().padStart(3, "0");
	const documentId = `view202608_${paddedSequence}`;
	const path = join(
		bundle.knowledgeRoot,
		"generated",
		`${documentId}-${contentTitle}.md`,
	);
	const content = readFileSync(bundle.generatedPath, "utf8")
		.replace("rd_document_id: view202608_001", `rd_document_id: ${documentId}`)
		.replace(
			"# Disposable briefing",
			`# Disposable briefing ${paddedSequence}`,
		);
	write(path, content);
	return path;
};

const addGeneratedDigest = (bundle: Bundle, sequence: number): string => {
	const paddedSequence = sequence.toString().padStart(3, "0");
	const documentId = `dig202608_${paddedSequence}`;
	replace(
		bundle.registryPath,
		'"research_briefing": "view",',
		'"research_briefing": "view",\n    "research_digest": "dig",',
	);
	const path = join(
		bundle.knowledgeRoot,
		"generated",
		`${documentId}-first_digest.md`,
	);
	const content = readFileSync(bundle.generatedPath, "utf8")
		.replace("type: research_briefing", "type: research_digest")
		.replace("rd_document_id: view202608_001", `rd_document_id: ${documentId}`)
		.replace("# Disposable briefing", "# First disposable digest");
	write(path, content);
	return path;
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
	const reviewName = `rev202608_002-${name}.md`;
	const reviewPath = join(bundle.knowledgeRoot, "reviews", reviewName);
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
    resource: ../canonicals/${CANONICAL_NAME}
  - id: route-evidence
    resource: ../evidence/${EVIDENCE_NAME}
rd_document_id: rev202608_002
rd_role: review_request
rd_owner: human:owner-id
rd_retire_when: "The decision becomes historical after a newer candidate."
rd_review:
  candidate: ../canonicals/${CANONICAL_NAME}
  candidate_sha256: ${digest}
  reviewer: human:reviewer-id
  decision: "Accept the revised candidate as the current answer."
  state: accepted
  decided_at: 2026-08-04T01:00:00Z
  questions:
    - id: current-evidence
      question: "Does the revised candidate cite current stable evidence?"
      evidence:
        - ../evidence/${EVIDENCE_NAME}
      accept_if: "The candidate cites the evidence and states its condition."
---

# Recorded decision
`,
	);
	replace(
		join(bundle.knowledgeRoot, "index.md"),
		`- [Review request](reviews/${REVIEW_NAME})`,
		`- [Review request](reviews/${REVIEW_NAME})\n- [Current review](reviews/${reviewName})`,
	);
};

const addDeprecatedPredecessor = (bundle: Bundle): string => {
	const predecessorName = "pos202608_002-deprecated_route_comparison.md";
	const predecessorPath = join(
		bundle.knowledgeRoot,
		"canonicals",
		predecessorName,
	);
	const predecessor = readFileSync(bundle.statePath, "utf8")
		.replace(
			'title: "Current answer: route comparison"',
			'title: "Deprecated answer: route comparison"',
		)
		.replace("rd_document_id: pos202608_001", "rd_document_id: pos202608_002")
		.replace("status: stable", "status: deprecated");
	write(predecessorPath, predecessor);
	replace(
		bundle.statePath,
		"rd_owner: human:owner-id",
		`rd_supersedes:\n  - ${predecessorName}\nrd_owner: human:owner-id`,
	);
	replace(
		join(bundle.knowledgeRoot, "index.md"),
		"- [Evidence]",
		`- [Deprecated answer](canonicals/${predecessorName})\n- [Evidence]`,
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

describe("R&D document naming profile", () => {
	test("a profile bundle requires its type-code registry", async () => {
		const bundle = makeBundle();
		unlinkSync(bundle.registryPath);
		expect(codes(await inspect(bundle))).toContain("RDN001");
	});

	test("malformed registry JSON is a finding, not a fatal error", async () => {
		const bundle = makeBundle();
		writeFileSync(bundle.registryPath, "{not-json\n");
		expect(codes(await inspect(bundle))).toContain("RDN002");
	});

	test("the type registry must be a regular file inside the bundle", async () => {
		const bundle = makeBundle();
		const externalRegistry = join(
			bundle.researchRoot,
			"external-rd-types.json",
		);
		write(externalRegistry, readFileSync(bundle.registryPath, "utf8"));
		unlinkSync(bundle.registryPath);
		symlinkSync(externalRegistry, bundle.registryPath);
		expect(codes(await inspect(bundle))).toContain("RDN006");
	});

	test("registry schema, code shape, and one-to-one mappings are closed", async () => {
		const wrongSchema = makeBundle();
		writeFileSync(
			wrongSchema.registryPath,
			'{"schema":"rd-document-types/v2","type_codes":{}}\n',
		);
		expect(codes(await inspect(wrongSchema))).toContain("RDN003");

		const invalidCode = makeBundle();
		writeFileSync(
			invalidCode.registryPath,
			'{"schema":"rd-document-types/v1","type_codes":{"research_evidence":"EVI"}}\n',
		);
		expect(codes(await inspect(invalidCode))).toContain("RDN004");

		const duplicateCode = makeBundle();
		writeFileSync(
			duplicateCode.registryPath,
			'{"schema":"rd-document-types/v1","type_codes":{"research_evidence":"pos","research_position":"pos"}}\n',
		);
		expect(codes(await inspect(duplicateCode))).toContain("RDN005");

		const duplicateTypeKey = makeBundle();
		writeFileSync(
			duplicateTypeKey.registryPath,
			'{"schema":"rd-document-types/v1","type_codes":{"research_evidence":"evi","research_evidence":"evx"}}\n',
		);
		expect(codes(await inspect(duplicateTypeKey))).toContain("RDN003");
	});

	test("every governed type must be registered", async () => {
		const bundle = makeBundle();
		replace(
			bundle.evidencePath,
			"type: research_evidence",
			"type: unregistered_evidence",
		);
		expect(codes(await inspect(bundle))).toContain("RDN010");
	});

	test("every governed concept requires a valid stable document ID", async () => {
		const bundle = makeBundle();
		replace(bundle.evidencePath, "rd_document_id: evi202608_001\n", "");
		expect(codes(await inspect(bundle))).toContain("RDN011");

		const trailingLineBreak = makeBundle();
		replace(
			trailingLineBreak.evidencePath,
			"rd_document_id: evi202608_001",
			'rd_document_id: "evi202608_001\\n"',
		);
		expect(codes(await inspect(trailingLineBreak))).toContain("RDN011");
	});

	for (const invalidName of [
		"evi2608_001-route_measurement.md",
		"evi202613_001-route_measurement.md",
		"evi202608_000-route_measurement.md",
		"evi202608_01-route_measurement.md",
		"evi202608_001-Route_measurement.md",
		"evi202608_001-route__measurement.md",
		"evi202608_001-route-measurement.md",
		"evi202608_001-測定結果.md",
		"README.md",
	]) {
		test(`rejects malformed document name ${invalidName}`, async () => {
			const bundle = makeBundle();
			renameEvidenceFile(bundle, invalidName);
			expect(codes(await inspect(bundle))).toContain("RDN012");
		});
	}

	test("filename grammar rejects a trailing line terminator", async () => {
		for (const terminator of ["\n", "\u2028", "\u2029"]) {
			const bundle = makeBundle();
			renameEvidenceFile(bundle, `${EVIDENCE_NAME}${terminator}`);
			expect(codes(await inspect(bundle))).toContain("RDN012");
		}
	});

	test("frontmatter ID, filename ID, and registered type code must agree", async () => {
		const mismatchedId = makeBundle();
		replace(
			mismatchedId.evidencePath,
			"rd_document_id: evi202608_001",
			"rd_document_id: evi202608_002",
		);
		expect(codes(await inspect(mismatchedId))).toContain("RDN013");

		const mismatchedCode = makeBundle();
		renameEvidenceFile(mismatchedCode, "pos202608_001-route_measurement.md");
		expect(codes(await inspect(mismatchedCode))).toContain("RDN014");
	});

	test("document IDs are unique across bundle directories and slugs", async () => {
		const bundle = makeBundle();
		const duplicateRaw = '{"result":"secondary"}\n';
		write(join(bundle.rawRoot, "experiments", "secondary.json"), duplicateRaw);
		write(
			join(
				bundle.knowledgeRoot,
				"observations",
				"evi202608_001-secondary_measurement.md",
			),
			`---
type: research_evidence
title: "Evidence: secondary measurement"
description: "A second observation with an illegally reused document ID."
status: stable
generated: { by: process:research-ingest, at: 2026-08-02T00:00:00Z }
sources:
  - id: raw-secondary
    resource: ../../raw/experiments/secondary.json
rd_document_id: evi202608_001
rd_role: evidence
rd_evidence:
  source_id: raw-secondary
  sha256: ${sha256(duplicateRaw)}
  locator: whole
---

# Observation

The second raw artifact is retained.[^raw-secondary]

[^raw-secondary]: The declared raw artifact.
`,
		);
		replace(
			join(bundle.knowledgeRoot, "index.md"),
			"- [Evidence]",
			"- [Secondary evidence](observations/evi202608_001-secondary_measurement.md)\n- [Evidence]",
		);
		expect(codes(await inspect(bundle))).toContain("RDN015");
	});

	test("reserved log names stay outside the concept naming grammar", async () => {
		const bundle = makeBundle();
		write(
			join(bundle.knowledgeRoot, "history", "log.md"),
			"# Change log\n\n## 2026-08-02\n\nNaming policy admitted.\n",
		);
		expect((await inspect(bundle)).findings).toEqual([]);
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

		writeAcceptedCurrentReview(bundle, "question_revision");
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
		const duplicate = readFileSync(bundle.statePath, "utf8")
			.replace(
				'title: "Current answer: route comparison"',
				'title: "Competing answer: route comparison"',
			)
			.replace(
				"rd_document_id: pos202608_001",
				"rd_document_id: pos202608_002",
			);
		const duplicateName = "pos202608_002-competing_route_comparison.md";
		write(join(bundle.knowledgeRoot, "canonicals", duplicateName), duplicate);
		replace(
			join(bundle.knowledgeRoot, "index.md"),
			"- [Evidence]",
			`- [Competing answer](canonicals/${duplicateName})\n- [Evidence]`,
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
			`resource: ../evidence/${EVIDENCE_NAME}`,
			`resource: ../generated/${GENERATED_NAME}`,
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
			`# Current answer\n\nSee [temporary briefing](../generated/${GENERATED_NAME}).`,
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
			`# Current answer\n\nSee [temporary briefing][brief].\n\n[brief]: ../generated/${GENERATED_NAME}`,
		);
		expect(codes(await inspect(bundle))).toContain("RDR051");
	});

	test("an unused reference definition is not treated as a dependency", async () => {
		const bundle = makeBundle();
		replace(
			bundle.statePath,
			"# Current answer",
			`# Current answer\n\n[unused-brief]: ../generated/${GENERATED_NAME}`,
		);
		refreshCandidateDigest(bundle);
		expect((await inspect(bundle)).findings).toEqual([]);
	});

	test("review questions require typed evidence and exact source coverage", async () => {
		const bundle = makeBundle();
		replace(
			bundle.reviewPath,
			`evidence:\n        - ../evidence/${EVIDENCE_NAME}`,
			`evidence:\n        - ../generated/${GENERATED_NAME}`,
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
			`# Current answer\n\nSee [evidence](../evidence/${EVIDENCE_NAME}).`,
		);
		replace(
			bundle.evidencePath,
			"# Observation",
			`# Observation\n\nSee [current interpretation](../canonicals/${CANONICAL_NAME}).`,
		);
		refreshCandidateDigest(bundle);
		expect((await inspect(bundle)).findings).toEqual([]);
	});

	test("every durable concept must be reachable from the root index", async () => {
		const bundle = makeBundle();
		replace(
			join(bundle.knowledgeRoot, "index.md"),
			`- [Review request](reviews/${REVIEW_NAME})\n`,
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
		replace(
			bundle.generatedPath,
			`  - ../evidence/${EVIDENCE_NAME}\n---`,
			"---",
		);
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
			`rd_authority_key: another/question\nrd_supersedes:\n  - ${CANONICAL_NAME}`,
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
			join(
				bundle.knowledgeRoot,
				"evidence",
				"evi202608_002-negative_result.md",
			),
			`---
type: research_evidence
title: "Evidence: negative result"
description: "A preserved negative result from one immutable raw artifact."
status: stable
generated: { by: process:research-ingest, at: 2026-08-02T01:00:00Z }
sources:
  - id: raw-negative
    resource: ../../raw/experiments/negative.json
rd_document_id: evi202608_002
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
			"- [Negative result](evidence/evi202608_002-negative_result.md)\n- [Review request]",
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
			join(
				bundle.knowledgeRoot,
				"canonicals",
				"pos202608_001-renamed_route_comparison.md",
			),
		);
		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		expect(codes(result)).toContain("RDI003");
	});

	test("a durable document ID cannot be reissued in place", async () => {
		const bundle = makeBundle();
		commitFixture(bundle);
		replace(
			bundle.statePath,
			"rd_document_id: pos202608_001",
			"rd_document_id: pos202608_099",
		);
		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		expect(codes(result)).toContain("RDI007");
		expect(codes(result)).not.toContain("RDI013");
	});

	test("a generated-view document ID cannot be reissued in place", async () => {
		const bundle = makeBundle();
		commitFixture(bundle);
		replace(
			bundle.generatedPath,
			"rd_document_id: view202608_001",
			"rd_document_id: view202608_099",
		);
		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		expect(codes(result)).toContain("RDI007");
		expect(codes(result)).not.toContain("RDI013");
	});

	test("an admitted document type cannot be reclassified in place", async () => {
		const bundle = makeBundle();
		commitFixture(bundle);
		replace(
			bundle.statePath,
			"type: research_position",
			"type: research_argument",
		);
		replace(
			bundle.registryPath,
			'"research_position": "pos"',
			'"research_argument": "pos"',
		);
		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		expect(codes(result)).toContain("RDI008");

		const generated = makeBundle();
		commitFixture(generated);
		replace(
			generated.generatedPath,
			"type: research_briefing",
			"type: research_digest",
		);
		replace(
			generated.registryPath,
			'"research_briefing": "view"',
			'"research_digest": "view"',
		);
		const generatedResult = await inspectResearchDocs(generated.knowledgeRoot, {
			base: "HEAD",
			rawRoot: generated.rawRoot,
			today: "2026-08-02",
		});
		expect(codes(generatedResult)).toContain("RDI008");
	});

	test("an admitted document role cannot be changed in place", async () => {
		const promoted = makeBundle();
		commitFixture(promoted);
		replace(
			promoted.generatedPath,
			"rd_role: generated_view",
			"rd_role: canonical",
		);
		const promotedResult = await inspectResearchDocs(promoted.knowledgeRoot, {
			base: "HEAD",
			rawRoot: promoted.rawRoot,
			today: "2026-08-02",
		});
		expect(codes(promotedResult)).toContain("RDI009");

		const demoted = makeBundle();
		commitFixture(demoted);
		replace(demoted.statePath, "rd_role: canonical", "rd_role: generated_view");
		const demotedResult = await inspectResearchDocs(demoted.knowledgeRoot, {
			base: "HEAD",
			rawRoot: demoted.rawRoot,
			today: "2026-08-02",
		});
		expect(codes(demotedResult)).toContain("RDI009");
	});

	test("an existing document ID remains bound to its original path", async () => {
		const renamed = makeBundle();
		commitFixture(renamed);
		renameSync(
			renamed.generatedPath,
			join(
				renamed.knowledgeRoot,
				"generated",
				"view202608_001-renamed_route_comparison.md",
			),
		);
		const renamedResult = await inspectResearchDocs(renamed.knowledgeRoot, {
			base: "HEAD",
			rawRoot: renamed.rawRoot,
			today: "2026-08-02",
		});
		expect(codes(renamedResult)).toContain("RDI011");
		expect(
			renamedResult.findings.find((finding) => finding.code === "RDI011")
				?.message,
		).toContain("original path");

		const recreated = makeBundle();
		commitFixture(recreated);
		const replacement = readFileSync(recreated.generatedPath, "utf8")
			.replace("Disposable briefing", "Replacement briefing")
			.replace(
				"This view is navigation only and must not become a durable source.",
				"This new rendering has a distinct purpose, but it still cannot reuse the deleted ID.",
			);
		unlinkSync(recreated.generatedPath);
		write(
			join(
				recreated.knowledgeRoot,
				"generated",
				"view202608_001-recreated_route_comparison.md",
			),
			replacement,
		);
		const recreatedResult = await inspectResearchDocs(recreated.knowledgeRoot, {
			base: "HEAD",
			rawRoot: recreated.rawRoot,
			today: "2026-08-02",
		});
		expect(codes(recreatedResult)).toContain("RDI011");
	});

	test("new document sequences cannot skip or fill gaps after the Git base", async () => {
		const skipped = makeBundle();
		commitFixture(skipped);
		addGeneratedView(skipped, 3, "skipped_sequence");
		const skippedResult = await inspectResearchDocs(skipped.knowledgeRoot, {
			base: "HEAD",
			rawRoot: skipped.rawRoot,
			today: "2026-08-02",
		});
		expect(codes(skippedResult)).toContain("RDI013");

		const gapFill = makeBundle();
		addGeneratedView(gapFill, 3, "existing_gap");
		commitFixture(gapFill);
		addGeneratedView(gapFill, 2, "late_gap_fill");
		const gapFillResult = await inspectResearchDocs(gapFill.knowledgeRoot, {
			base: "HEAD",
			rawRoot: gapFill.rawRoot,
			today: "2026-08-02",
		});
		expect(codes(gapFillResult)).toContain("RDI013");
	});

	test("multiple new sequences may extend a base maximum contiguously", async () => {
		const bundle = makeBundle();
		addGeneratedView(bundle, 3, "existing_gap");
		commitFixture(bundle);
		addGeneratedView(bundle, 4, "first_new_view");
		addGeneratedView(bundle, 5, "second_new_view");
		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		expect(result.findings).toEqual([]);
	});

	test("sequence 999 exhausts its code and month", async () => {
		const bundle = makeBundle();
		addGeneratedView(bundle, 999, "last_available_sequence");
		commitFixture(bundle);
		addGeneratedView(bundle, 998, "late_allocation_after_exhaustion");
		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		const finding = result.findings.find((item) => item.code === "RDI013");
		expect(finding?.message).toContain("sequence 999 is exhausted");
	});

	test("a code and month absent from the base starts at sequence 001", async () => {
		const first = makeBundle();
		commitFixture(first);
		addGeneratedDigest(first, 1);
		const firstResult = await inspectResearchDocs(first.knowledgeRoot, {
			base: "HEAD",
			rawRoot: first.rawRoot,
			today: "2026-08-02",
		});
		expect(firstResult.findings).toEqual([]);

		const skipped = makeBundle();
		commitFixture(skipped);
		addGeneratedDigest(skipped, 2);
		const skippedResult = await inspectResearchDocs(skipped.knowledgeRoot, {
			base: "HEAD",
			rawRoot: skipped.rawRoot,
			today: "2026-08-02",
		});
		expect(codes(skippedResult)).toContain("RDI013");
	});

	test("a deleted generated view may be replaced only under a new ID", async () => {
		const bundle = makeBundle();
		commitFixture(bundle);
		const replacementPath = join(
			bundle.knowledgeRoot,
			"generated",
			"view202608_002-new_route_comparison.md",
		);
		renameSync(bundle.generatedPath, replacementPath);
		replace(
			replacementPath,
			"rd_document_id: view202608_001",
			"rd_document_id: view202608_002",
		);
		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		expect(result.findings).toEqual([]);
	});

	test("a used type-code mapping survives generated-view deletion", async () => {
		const bundle = makeBundle();
		commitFixture(bundle);
		unlinkSync(bundle.generatedPath);
		replace(
			bundle.registryPath,
			'"research_briefing": "view"',
			'"research_digest": "view"',
		);
		const result = await inspectResearchDocs(bundle.knowledgeRoot, {
			base: "HEAD",
			rawRoot: bundle.rawRoot,
			today: "2026-08-02",
		});
		expect(codes(result)).toContain("RDI012");
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
