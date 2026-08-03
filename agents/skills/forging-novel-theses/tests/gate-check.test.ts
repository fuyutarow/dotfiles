import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../scripts/gate-check.ts");
const temporaryDirectories: string[] = [];
const recoveryRule =
	"ONE targeted regeneration in an unoccupied legitimate cell; then COVERAGE GAP";

type RunResult = Readonly<{
	exitCode: number;
	stderr: string;
	stdout: string;
}>;

type CandidateOptions = Readonly<{
	discriminator?: string;
	frameUpdate?: string;
	id?: string;
	noveltyDelta?: string;
	operation?: string;
	premise?: string;
	prediction?: string;
	recipe?: string;
	seed?: string;
	status?: string;
	target?: string;
	thesis?: string;
	trace?: string;
	transferDetails?: string;
}>;

const spawn = (arguments_: readonly string[], stdin?: string): RunResult => {
	const result = Bun.spawnSync({
		cmd: ["bun", script, ...arguments_],
		stderr: "pipe",
		stdin: stdin === undefined ? undefined : new Blob([stdin]),
		stdout: "pipe",
		timeout: 10_000,
	});

	return {
		exitCode: result.exitCode,
		stderr: result.stderr.toString(),
		stdout: result.stdout.toString(),
	};
};

const run = (...arguments_: string[]): RunResult => spawn(arguments_);

const fixture = (content: string): string => {
	const directory = mkdtempSync(join(tmpdir(), "novel-thesis-packet-"));
	temporaryDirectories.push(directory);
	const path = join(directory, "thesis.md");
	writeFileSync(path, `${content.trim()}\n`);
	return path;
};

const donorSet = `
# DONOR SET

- Transfer search question: Which source relations preserve recoverability after aggregation?
- Coverage contract: bounded comparison of two supplied source units; no completeness claim
- Selection rule: select relations and constraints, not surface names, vocabulary, or distance

## Donor records

| Donor ID | Source / locator | Source domain | Source scope | Roles / entities | Relation | Preconditions | Observable consequence | Boundary / failure |
|---|---|---|---|---|---|---|---|---|
| D1 | doi:10.1000/example-a, p. 4 | event histories | retained ordered histories | event; log; replay | replay preserves recoverable order before aggregation | ordered events remain available | distinct histories remain reconstructable | compaction destroys order |
| D2 | reports/b.md:18 | dynamical systems | observable systems | state; observation; smoother | smoothing recovers state relations from ordered observations | dynamics are specified and observable | latent trajectories remain distinguishable | unobservable modes collapse |

## Comparison

- Common relational schema: preserving ordered intermediate relations permits recovery that endpoint aggregation destroys
- Non-common structure: D1 assumes discrete lossless events; D2 permits noisy continuous observations
- Retrieval-only cues: shared words located candidates but do not warrant transfer
- Single-donor limit: NONE — two distinct donor evidence units were compared

## Knowledge state

- Known: both source units state a bounded recoverability relation
- Uncertain: whether that relation survives outside their stated scopes
- Disputed: none found in the bounded corpus
- Missing: target correspondence and target-side evidence

## Handoff

- Handoff: forging-novel-theses — donor IDs D1,D2; no target mapping, no target prediction, no thesis, and no target test verdict
`;

const frozenDonorSet = (): Readonly<{ digest: string; path: string }> => {
	const path = fixture(donorSet);
	return {
		digest: createHash("sha256").update(readFileSync(path)).digest("hex"),
		path,
	};
};

const candidate = (options: CandidateOptions = {}): string => `
## Candidate ${options.id ?? "C1"}

- Input problem/frame: Existing protein screens miss transient interactions.
- Generation recipe (optional): ${options.recipe ?? "representation change"}
- Seed provenance: ${options.seed ?? "OBSERVATION — cited endpoint/trace mismatch"}
- Transformation target: ${options.target ?? "REPRESENTATION"}
- Operation: ${options.operation ?? "SUBSTITUTE"}
${options.transferDetails ?? ""}
- Premise challenged: ${options.premise ?? "NONE — grounded control"}
- Transformation trace: ${options.trace ?? "static endpoint state -> SUBSTITUTE with a time-indexed transition log -> recover transient relations"}
- Thesis claim: ${options.thesis ?? "Time-indexed interaction traces expose transient protein complexes absent from endpoint assays."}
- New testable prediction: ${options.prediction ?? "Trace reconstruction recovers a reproducible class of complexes absent from matched endpoint assays."}
- New discriminator: ${options.discriminator ?? "Under matched samples, the trace account predicts transient recovery while the endpoint account predicts no recovery."}
- Nearest prior / novelty delta: ${options.noveltyDelta ?? "Endpoint assays / adds reconstruction from time-indexed events."}
- Frame update flag: ${options.frameUpdate ?? "YES — the object changes from states to transitions."}
- Status: ${options.status ?? "CANDIDATE"}
`;

const transferDetails = (
	path: string,
	digest: string,
): string => `- Transfer attempt ID: T1
- Donor set: path=${path}; sha256=${digest}
- Donor IDs: D1, D2
- Source comparison: compared D1 and D2 to extract a common relation; surface labels were ignored
- Source relation / locator: queued events preserve recoverable order under replay; D1:doi:10.1000/example-a, p. 4 and D2:reports/b.md:18
- Target relation before transfer: endpoint aggregation discards event order before reconstruction
- Correspondence map: source event=target assay transition; source replay=target trace reconstruction; source order=target temporal order
- Preserved relation: recovery depends on retaining ordered transitions before aggregation
- Non-correspondence: source transactions are discrete and lossless, while target observations are noisy and partially observed
- Transfer boundary: mapping breaks when transition order is unidentifiable or the target dynamics are order-invariant
- Precision loss: discrete replay guarantees become probabilistic reconstruction bounds in the target
- Target-side evidence: UNTESTED
- Target-side counterexample: matched target traces with distinct event order yield indistinguishable reconstruction and outcomes`;

const validTransferCandidate = (path: string, digest: string): string =>
	candidate({
		discriminator:
			"Under matched endpoint states, the transfer account predicts order-dependent recovery while the endpoint account predicts equivalence.",
		operation: "TRANSFER",
		prediction:
			"Matched endpoint states with different transition order produce different recoverable interaction histories.",
		recipe: "structural transfer",
		seed: "ANALOGY — DONOR SET research/donor-set.md D1,D2 with source-located replay relations",
		target: "RELATION",
		thesis:
			"Order-preserving transition traces recover target interactions that endpoint aggregation cannot identify.",
		trace:
			"endpoint aggregation -> TRANSFER order-preserving replay relation -> reconstruct target transition histories",
		transferDetails: transferDetails(path, digest),
	});

const validMappingBreak = (
	path: string,
	digest: string,
	handoffOwner = "directing-research-sections",
): string => `
## MAPPING-BREAK T2

- Transfer attempt ID: T2
- Input problem/frame: Existing protein screens miss transient interactions.
- Donor set: path=${path}; sha256=${digest}
- Donor IDs: D1
- Source comparison: SINGLE-DONOR LIMIT — hypothesis seed only; no abstract schema established; no target transport established
- Source relation / locator: atomic rollback restores a prior state; D1:doi:10.1000/example-a, p. 4
- Target relation before transfer: target observations are irreversible population averages
- Attempted correspondence: source rollback=target recovery; source prior state=target pre-perturbation state
- Non-correspondence axis: RELATION — the target has no inverse transition that restores an identifiable prior state
- Failed invariant: recovery would require an invertible transition, but target aggregation is many-to-one
- Transfer boundary: mapping breaks when all admissible target observations remain non-invertible under the supplied regime
- Evidence / locator: target constraint at research/target-frame.md:27 and donor relation at D1:doi:10.example/a#p4
- Handoff: ${handoffOwner} — preserve T2 in the TRANSFER DISPOSITION denominator
- Status: MAPPING-BREAK
`;

const validBatch = (): string => `
## Batch contract
- Requested candidate count: 3
- Grounded control candidate: C1
- Premise-breaking anti-default candidate: C2
- Collapse recovery: ${recoveryRule}

${candidate({ id: "C1" })}

${candidate({
	discriminator:
		"Under order-matched loads, the coupled account predicts sequence effects while the cumulative-load account predicts none.",
	id: "C2",
	operation: "COUPLE",
	premise: "Equal cumulative load implies equivalent degradation behavior.",
	prediction:
		"Permuting identical load events changes degradation when controller relaxation is coupled to the material.",
	recipe: "competing-account synthesis",
	seed: "CONSTRAINT — cumulative load is treated as sufficient",
	target: "RELATION",
	thesis:
		"Controller relaxation and material recovery jointly determine sequence-sensitive degradation.",
	trace:
		"independent controller and material states -> COUPLE their relaxation dynamics -> create order-sensitive degradation",
})}

${candidate({
	discriminator:
		"At equal mean porosity, the topology account predicts path-specific tails while the mean-field account predicts equivalence.",
	id: "C3",
	operation: "DECOMPOSE",
	premise: "Equal mean porosity implies equivalent transport topology.",
	prediction:
		"Electrodes with equal mean porosity but different path tails show different intermittent acceleration.",
	recipe: "constraint inversion",
	seed: "NEGATIVE-SPACE — endpoint images omit connectivity tails",
	target: "EVIDENCE",
	thesis:
		"Connectivity-tail evidence explains degradation differences hidden by equal mean porosity.",
	trace:
		"mean porosity summary -> DECOMPOSE into path connectivity and tail evidence -> expose intermittent transport bottlenecks",
})}
`;

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("gate-check", () => {
	test("accepts a complete coordinate-bearing packet by path", () => {
		const result = run(fixture(candidate()));

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("candidate packet: FAIL=0");
		expect(result.stderr).toBe("");
	});

	test("accepts the same packet from stdin", () => {
		const result = spawn(["-"], candidate());

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("candidate packet: FAIL=0");
		expect(result.stderr).toBe("");
	});

	test("accepts a covered batch and emits its derived matrix", () => {
		const result = run(fixture(validBatch()));

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("candidate batch: FAIL=0");
		expect(result.stdout).toContain("MATRIX  C1");
		expect(result.stdout).toContain("MATRIX  C2");
		expect(result.stdout).toContain("MATRIX  C3");
	});

	test("rejects a mechanically collapsed batch after checking every candidate", () => {
		const shared = {
			discriminator:
				"Under matched samples, the trace account predicts transient recovery while the endpoint account predicts no recovery.",
			operation: "SUBSTITUTE",
			target: "REPRESENTATION",
		};
		const result = run(
			fixture(`
## Batch contract
- Requested candidate count: 3
- Grounded control candidate: C1
- Anti-default EXEMPT: EXEMPT — the selected frame fixes all premises by a proved conservation constraint.
- Collapse recovery: ${recoveryRule}

${candidate({ ...shared, id: "C1" })}
${candidate({ ...shared, id: "C2" })}
${candidate({ ...shared, id: "C3" })}
`),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("C1/C12");
		expect(result.stdout).toContain("C2/C12");
		expect(result.stdout).toContain("C3/C12");
		expect(result.stdout).toContain(
			"All candidates share one transformation target",
		);
		expect(result.stdout).toContain("All candidates share one discriminator");
		expect(result.stdout).toContain(
			"Coverage has 1 unique cells; minimum is 3",
		);
	});

	test("rejects the demonstrated vague brainstorming false positive", () => {
		const result = run(
			fixture(
				candidate({
					discriminator: "Results will be different.",
					operation: "OTHER — BRAINSTORM",
					prediction: "Research results will improve.",
					recipe: "brainstorming",
					seed: "OTHER — FREE-FORM-BRAINSTORM",
					thesis:
						"A more innovative approach will produce stronger research results.",
					trace: "use a more innovative and holistic approach",
				}),
			),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain(
			"Transformation trace contains only novelty adjectives",
		);
		expect(result.stdout).toContain(
			"New testable prediction states generic improvement",
		);
		expect(result.stdout).toContain(
			"New discriminator states only difference or improvement",
		);
	});

	test("rejects an unnamed OTHER coordinate", () => {
		const result = run(fixture(candidate({ seed: "OTHER" })));

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain(
			"Seed provenance: OTHER must name the open-set value",
		);
	});

	test("rejects a bare seed-provenance label without a specific seed", () => {
		const result = run(fixture(candidate({ seed: "OBSERVATION" })));

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain(
			"Seed provenance must name the specific seed or source",
		);
	});

	test("requires an attested Blind-spot packet row for a TACIT seed", () => {
		const invalid = run(
			fixture(candidate({ seed: "TACIT — plausible practitioner intuition" })),
		);
		const ownerOnly = run(
			fixture(
				candidate({
					seed: "TACIT — Blind-spot packet research/blind-spots.md, Probe P1, HUMAN:operator",
				}),
			),
		);
		const emptyLocus = run(
			fixture(
				candidate({
					seed: "TACIT — Blind-spot packet research/blind-spots.md, Probe P1, HUMAN:operator@",
				}),
			),
		);
		const valid = run(
			fixture(
				candidate({
					seed: "TACIT — Blind-spot packet research/blind-spots.md, Probe P1, HUMAN:operator@conversation:user-turn-7",
				}),
			),
		);

		expect(invalid.exitCode).toBe(1);
		expect(invalid.stdout).toContain(
			"exactly HUMAN:<owner>@<attestation-locus>",
		);
		expect(ownerOnly.exitCode).toBe(1);
		expect(ownerOnly.stdout).toContain(
			"exactly HUMAN:<owner>@<attestation-locus>",
		);
		expect(emptyLocus.exitCode).toBe(1);
		expect(emptyLocus.stdout).toContain(
			"exactly HUMAN:<owner>@<attestation-locus>",
		);
		expect(valid.exitCode).toBe(0);
	});

	test("does not let a one-candidate file bypass its batch contract", () => {
		const result = run(
			fixture(`
## Batch contract
- Requested candidate count: 3
- Grounded control candidate: C1
- Premise-breaking anti-default candidate: C2
- Collapse recovery: ${recoveryRule}

${candidate({ id: "C1" })}
`),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain(
			"Batch returned 1 candidates for 3 requested",
		);
		expect(result.stdout).toContain("Anti-default candidate C2 not found");
	});

	test("rejects an old kill-and-withdrawal packet", () => {
		const result = run(
			fixture(`
制約を装った慣習: Assays must capture stable states.
転移した構造: Event sourcing → temporal reconstruction.
最も安い反証実験: Recovery below 10% kills the thesis.
撤退基準: Stop after two failed runs.
Why now: Sensors are cheaper.
Capital fit: One-quarter budget.
`),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("Input problem/frame");
		expect(result.stdout).toContain("Seed provenance");
		expect(result.stdout).toContain("Status");
	});

	test("rejects a blank novelty delta", () => {
		const result = run(fixture(candidate({ noveltyDelta: "" })));

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("Nearest prior / novelty delta");
		expect(result.stdout).toContain("placeholder");
	});

	test("accepts explicit UNVERIFIED with a warning", () => {
		const result = run(
			fixture(
				candidate({
					noveltyDelta: "UNVERIFIED — nearest-prior search is still pending.",
				}),
			),
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("WARN");
		expect(result.stdout).toContain("UNVERIFIED");
	});

	test("rejects a non-candidate status", () => {
		const result = run(fixture(candidate({ status: "VALIDATED" })));

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("Status must be exactly CANDIDATE");
	});

	test("accepts a relation-level transfer candidate with target evidence still untested", () => {
		const donor = frozenDonorSet();
		const result = run(
			"--donor-set",
			donor.path,
			fixture(validTransferCandidate(donor.path, donor.digest)),
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("transfer candidate");
		expect(result.stdout).toContain("FAIL=0");
	});

	test("rejects a TRANSFER operation that carries only an analogy label", () => {
		const result = run(
			fixture(
				candidate({
					operation: "TRANSFER",
					recipe: "structural transfer",
					seed: "ANALOGY — event sourcing resembles assay traces",
				}),
			),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("Donor set");
		expect(result.stdout).toContain("Correspondence map");
		expect(result.stdout).toContain("Transfer boundary");
		expect(result.stdout).toContain("Target-side evidence");
	});

	test("rejects transfer-only fields on a non-transfer candidate", () => {
		const result = run(
			fixture(
				candidate({
					transferDetails: `- Donor set: path=research/donor-set.md; sha256=${"a".repeat(64)}`,
				}),
			),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain(
			"Transfer fields require Operation: TRANSFER: Donor set",
		);
	});

	test("rejects source-side success laundered as target-side support", () => {
		const donor = frozenDonorSet();
		const invalid = validTransferCandidate(donor.path, donor.digest).replace(
			"Target-side evidence: UNTESTED",
			"Target-side evidence: SUPPORTED — both donor systems succeeded",
		);
		const result = run("--donor-set", donor.path, fixture(invalid));

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain(
			"candidate-stage target-side evidence must be exactly UNTESTED",
		);
	});

	test("requires non-correspondence, a transfer boundary, and precision loss separately", () => {
		const donor = frozenDonorSet();
		for (const field of [
			"Non-correspondence",
			"Transfer boundary",
			"Precision loss",
		]) {
			const invalid = validTransferCandidate(donor.path, donor.digest).replace(
				new RegExp(`^- ${field}:.*$`, "m"),
				"",
			);
			const result = run("--donor-set", donor.path, fixture(invalid));

			expect(result.exitCode).toBe(1);
			expect(result.stdout).toContain(field);
		}
	});

	test("accepts a concrete MAPPING-BREAK as a preserved non-candidate result", () => {
		const donor = frozenDonorSet();
		const result = run(
			"--donor-set",
			donor.path,
			fixture(validMappingBreak(donor.path, donor.digest)),
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("mapping-break packet: FAIL=0");
	});

	test("default mode accepts the current handoff and rejects the legacy v1 handoff", () => {
		const donor = frozenDonorSet();
		const current = run(
			"--donor-set",
			donor.path,
			fixture(validMappingBreak(donor.path, donor.digest)),
		);
		const legacy = run(
			"--donor-set",
			donor.path,
			fixture(
				validMappingBreak(donor.path, donor.digest, "directing-research"),
			),
		);
		const caseVariant = run(
			"--donor-set",
			donor.path,
			fixture(
				validMappingBreak(
					donor.path,
					donor.digest,
					"DIRECTING-RESEARCH-SECTIONS",
				),
			),
		);

		expect(current.exitCode).toBe(0);
		expect(legacy.exitCode).toBe(1);
		expect(caseVariant.exitCode).toBe(1);
		expect(legacy.stdout).toContain("exact directing-research-sections owner");
	});

	test("legacy v1 mode accepts only the exact legacy handoff", () => {
		const donor = frozenDonorSet();
		const legacy = run(
			"--legacy-v1",
			"--donor-set",
			donor.path,
			fixture(
				validMappingBreak(donor.path, donor.digest, "directing-research"),
			),
		);
		const current = run(
			"--legacy-v1",
			"--donor-set",
			donor.path,
			fixture(validMappingBreak(donor.path, donor.digest)),
		);
		const caseVariant = run(
			"--legacy-v1",
			"--donor-set",
			donor.path,
			fixture(
				validMappingBreak(donor.path, donor.digest, "DIRECTING-RESEARCH"),
			),
		);
		const adjacentToCandidate = run(
			"--donor-set",
			donor.path,
			"--legacy-v1",
			fixture(
				validMappingBreak(donor.path, donor.digest, "directing-research"),
			),
		);

		expect(legacy.exitCode).toBe(0);
		expect(current.exitCode).toBe(1);
		expect(caseVariant.exitCode).toBe(1);
		expect(adjacentToCandidate.exitCode).toBe(0);
		expect(adjacentToCandidate.stdout).toContain(
			"mapping-break packet: FAIL=0",
		);
		expect(current.stdout).toContain("exact directing-research owner");
	});

	test("legacy v1 compatibility accepts only one exact bare flag token", () => {
		const donor = frozenDonorSet();
		const legacyFixture = fixture(
			validMappingBreak(donor.path, donor.digest, "directing-research"),
		);
		const invalidArgumentSets = [
			["--legacy-v1", "--legacy-v1"],
			["--legacyV1"],
			["--Legacy-v1"],
			["--LEGACY-V1"],
			["--no-legacy-v1"],
			["--legacy.v1"],
			["--prefix-legacy-v1"],
			["--legacy-v1-suffix"],
			["--legacy-v1="],
			["--legacy-v1=false"],
			["--legacy-v1=FALSE"],
			["--legacy-v1=true"],
			["--legacy-v1=TRUE"],
			["--legacy-v1=1"],
			["--legacy-v1=yes"],
			["--legacy-v1=garbage"],
			["--legacy-v1", "--legacy-v1=false"],
		] as const;

		for (const arguments_ of invalidArgumentSets) {
			const result = run(
				...arguments_,
				"--donor-set",
				donor.path,
				legacyFixture,
			);

			expect(result.exitCode).toBe(2);
			expect(result.stderr).toContain(
				"legacy v1 compatibility requires exactly one bare --legacy-v1 token",
			);
		}
	});

	test("handoff owner matching rejects ambiguous substrings in both modes", () => {
		const donor = frozenDonorSet();
		const currentSubstring = run(
			"--donor-set",
			donor.path,
			fixture(
				validMappingBreak(
					donor.path,
					donor.digest,
					"prefix-directing-research-sections",
				),
			),
		);
		const legacySubstring = run(
			"--legacy-v1",
			"--donor-set",
			donor.path,
			fixture(
				validMappingBreak(
					donor.path,
					donor.digest,
					"directing-research-shadow",
				),
			),
		);

		expect(currentSubstring.exitCode).toBe(1);
		expect(legacySubstring.exitCode).toBe(1);
	});

	test("rejects a vague MAPPING-BREAK and candidate leakage in the same attempt", () => {
		const donor = frozenDonorSet();
		const invalid = validMappingBreak(donor.path, donor.digest)
			.replace(
				"RELATION — the target has no inverse transition that restores an identifiable prior state",
				"domains differ",
			)
			.replace(
				"- Status: MAPPING-BREAK",
				"- Thesis claim: Rollback will solve the target problem.\n- Status: MAPPING-BREAK",
			);
		const result = run("--donor-set", donor.path, fixture(invalid));

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("typed non-correspondence");
		expect(result.stdout).toContain("must not contain Thesis claim");
	});

	test("rejects duplicate transfer attempt IDs across a candidate and MAPPING-BREAK", () => {
		const donor = frozenDonorSet();
		const duplicate = `${validTransferCandidate(donor.path, donor.digest)}\n${validMappingBreak(donor.path, donor.digest).replaceAll("T2", "T1")}`;
		const result = run("--donor-set", donor.path, fixture(duplicate));

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("duplicate transfer attempt ID: T1");
	});

	test("requires the exact frozen DONOR SET for every transfer artifact", () => {
		const donor = frozenDonorSet();
		const packet = fixture(validTransferCandidate(donor.path, donor.digest));
		const omitted = run(packet);
		const wrongDigest = run(
			"--donor-set",
			donor.path,
			fixture(validTransferCandidate(donor.path, "f".repeat(64))),
		);
		const wrongPath = run(
			"--donor-set",
			donor.path,
			fixture(
				validTransferCandidate("research/other-donor-set.md", donor.digest),
			),
		);

		expect(omitted.exitCode).toBe(1);
		expect(omitted.stdout).toContain(
			"transfer artifacts require --donor-set <path>",
		);
		expect(wrongDigest.exitCode).toBe(1);
		expect(wrongDigest.stdout).toContain("DONOR SET SHA-256 does not match");
		expect(wrongPath.exitCode).toBe(1);
		expect(wrongPath.stdout).toContain("DONOR SET path does not match");
	});

	test("rejects donor IDs absent from the frozen DONOR SET", () => {
		const donor = frozenDonorSet();
		const invalid = validTransferCandidate(donor.path, donor.digest).replace(
			"Donor IDs: D1, D2",
			"Donor IDs: D1, D404",
		);
		const result = run("--donor-set", donor.path, fixture(invalid));

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain(
			"Donor ID D404 is absent from the frozen DONOR SET",
		);
	});

	test("rejects duplicate donor IDs and source-locator substitution", () => {
		const donor = frozenDonorSet();
		const duplicateIds = validTransferCandidate(
			donor.path,
			donor.digest,
		).replace("Donor IDs: D1, D2", "Donor IDs: D1, D1");
		const substitutedLocator = validTransferCandidate(
			donor.path,
			donor.digest,
		).replace(
			"D1:doi:10.1000/example-a, p. 4",
			"D1:doi:10.9999/unrelated, p. 1",
		);

		const duplicateResult = run(
			"--donor-set",
			donor.path,
			fixture(duplicateIds),
		);
		const substitutionResult = run(
			"--donor-set",
			donor.path,
			fixture(substitutedLocator),
		);

		expect(duplicateResult.exitCode).toBe(1);
		expect(duplicateResult.stdout).toContain("Donor IDs must be unique");
		expect(substitutionResult.exitCode).toBe(1);
		expect(substitutionResult.stdout).toContain(
			"does not carry the frozen source locator for Donor ID D1",
		);
	});

	test("rejects a frozen donor file that never passed the SoK DONOR SET contract", () => {
		const invalidDonorPath = fixture(
			donorSet.replace(/^- Transfer search question:.*$/m, ""),
		);
		const digest = createHash("sha256")
			.update(readFileSync(invalidDonorPath))
			.digest("hex");
		const result = run(
			"--donor-set",
			invalidDonorPath,
			fixture(validTransferCandidate(invalidDonorPath, digest)),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain(
			"frozen DONOR SET failed systematizing-knowledge check",
		);
		expect(result.stdout).toContain("Transfer search question");
	});

	test("rejects a multi-donor MAPPING-BREAK carrying a single-donor limit", () => {
		const donor = frozenDonorSet();
		const invalid = validMappingBreak(donor.path, donor.digest).replace(
			"- Donor IDs: D1\n",
			"- Donor IDs: D1, D2\n",
		);
		const result = run("--donor-set", donor.path, fixture(invalid));

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain(
			"SINGLE-DONOR LIMIT conflicts with multiple Donor IDs",
		);
	});

	test("requires a base source plus an exact anchor for a source relation", () => {
		const donor = frozenDonorSet();
		const invalid = validTransferCandidate(donor.path, donor.digest).replace(
			/- Source relation \/ locator:.*$/m,
			"- Source relation / locator: recoverability is described only at p. 4 without a base source identifier",
		);
		const result = run("--donor-set", donor.path, fixture(invalid));

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("needs an exact source locus");
	});

	test("does not borrow missing or duplicate fields from a later Markdown section", () => {
		const donor = frozenDonorSet();
		const duplicate = validTransferCandidate(donor.path, donor.digest).replace(
			"- Target-side evidence: UNTESTED",
			"- Target-side evidence: UNTESTED\n- Target-side evidence: UNTESTED",
		);
		const duplicateResult = run("--donor-set", donor.path, fixture(duplicate));

		for (const heading of ["##", "###", "####", "######"]) {
			const missing = `${validTransferCandidate(
				donor.path,
				donor.digest,
			).replace(
				/^- Target-side evidence:.*$/m,
				"",
			)}\n${heading} Notes\n- Target-side evidence: UNTESTED`;
			const missingResult = run("--donor-set", donor.path, fixture(missing));

			expect(missingResult.exitCode).toBe(1);
			expect(missingResult.stdout).toContain(
				"Target-side evidence: required for Operation TRANSFER",
			);
		}
		expect(duplicateResult.exitCode).toBe(1);
		expect(duplicateResult.stdout).toContain(
			"duplicate field in one candidate packet: Target-side evidence",
		);
	});

	test("treats a missing donor dependency as fatal and accepts a same-file symlink", () => {
		const missingPath = "/definitely/missing/donor-set.md";
		const missing = run(
			"--donor-set",
			missingPath,
			fixture(validTransferCandidate(missingPath, "a".repeat(64))),
		);
		const donor = frozenDonorSet();
		const alias = `${donor.path}.link`;
		symlinkSync(donor.path, alias);
		const aliasResult = run(
			"--donor-set",
			alias,
			fixture(validTransferCandidate(donor.path, donor.digest)),
		);

		expect(missing.exitCode).toBe(2);
		expect(missing.stderr).toContain("FATAL: DONOR SET not found");
		expect(aliasResult.exitCode).toBe(0);
	});

	test("treats a missing upstream DONOR SET validator as fatal", () => {
		const donor = frozenDonorSet();
		const directory = mkdtempSync(
			join(import.meta.dir, ".isolated-gate-check-"),
		);
		temporaryDirectories.push(directory);
		const isolatedScript = join(directory, "gate-check.ts");
		writeFileSync(isolatedScript, readFileSync(script));
		const result = Bun.spawnSync({
			cmd: [
				"bun",
				isolatedScript,
				"--donor-set",
				donor.path,
				fixture(validTransferCandidate(donor.path, donor.digest)),
			],
			stderr: "pipe",
			stdout: "pipe",
			timeout: 10_000,
		});

		expect(result.exitCode).toBe(2);
		expect(result.stderr.toString()).toContain("DONOR SET validator not found");
	});

	test("uses Cleye's strict unknown-flag failure", () => {
		const result = run("--unexpected");

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Unknown flag: --unexpected");
		expect(result.stdout).toBe("");
	});
});
