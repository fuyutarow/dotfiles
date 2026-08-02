import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const donorCheck = resolve(
	import.meta.dir,
	"../../systematizing-knowledge/scripts/check-donor-set.ts",
);
const candidateCheck = resolve(
	import.meta.dir,
	"../../forging-novel-theses/scripts/gate-check.ts",
);
const researchCheck = resolve(import.meta.dir, "../scripts/research-check.ts");
const temporaryDirectories: string[] = [];

type RunResult = Readonly<{
	exitCode: number;
	stderr: string;
	stdout: string;
}>;

const normalize = (text: string): string => `${text.trim()}\n`;

const fixtureSet = (): Readonly<{
	directory: string;
	donorPath: string;
	transferPath: string;
	judgmentPath: string;
}> => {
	const directory = mkdtempSync(join(tmpdir(), "transfer-chain-"));
	temporaryDirectories.push(directory);
	return {
		directory,
		donorPath: join(directory, "donor-set.md"),
		judgmentPath: join(directory, "judgment.md"),
		transferPath: join(directory, "transfer-bundle.md"),
	};
};

const write = (path: string, text: string): void => {
	writeFileSync(path, normalize(text));
};

const sha256 = (path: string): string =>
	createHash("sha256").update(readFileSync(path)).digest("hex");

const run = (script: string, arguments_: readonly string[]): RunResult => {
	const result = Bun.spawnSync({
		cmd: ["bun", script, ...arguments_],
		stderr: "pipe",
		stdout: "pipe",
		timeout: 10_000,
	});
	return {
		exitCode: result.exitCode,
		stderr: result.stderr.toString(),
		stdout: result.stdout.toString(),
	};
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
| D2 | sources/control.md:18 | dynamical systems | observable systems | state; observation; smoother | smoothing recovers state relations from ordered observations | dynamics are specified and observable | latent trajectories remain distinguishable | unobservable modes collapse |

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

const transferBundle = (path: string, digest: string): string => `
## Candidate C1

- Input problem/frame: Endpoint aggregation hides order-dependent target histories.
- Generation recipe (optional): structural transfer
- Seed provenance: ANALOGY — frozen DONOR SET D1,D2 with source-located relations
- Transformation target: RELATION
- Operation: TRANSFER
- Transfer attempt ID: T1
- Donor set: path=${path}; sha256=${digest}
- Donor IDs: D1, D2
- Source comparison: compared D1 and D2 to extract a common relation while rejecting surface labels
- Source relation / locator: ordered intermediate relations preserve recoverability; D1:doi:10.1000/example-a, p. 4; D2:sources/control.md:18
- Target relation before transfer: target endpoints aggregate transitions before reconstruction
- Correspondence map: source event=target transition; source replay=target reconstruction; source order=target temporal order
- Preserved relation: recoverability depends on retaining ordered intermediate relations before aggregation
- Non-correspondence: source events are discrete and lossless while target observations are noisy and partially observed
- Transfer boundary: mapping breaks when target transition order is unidentifiable or order-invariant
- Precision loss: exact source replay becomes probabilistic target reconstruction
- Target-side evidence: UNTESTED
- Target-side counterexample: distinct target event orders yield indistinguishable reconstructions under matched endpoints
- Premise challenged: Endpoint state is sufficient for target reconstruction.
- Transformation trace: endpoint aggregation -> TRANSFER ordered recovery relation -> target transition reconstruction
- Thesis claim: Ordered target traces recover histories that matched endpoint summaries cannot identify.
- New testable prediction: Matched endpoints with different transition order produce different recoverable target histories.
- New discriminator: The transfer account predicts order-dependent recovery whereas the endpoint account predicts equivalence.
- Nearest prior / novelty delta: UNVERIFIED — nearest-prior search remains pending before selection.
- Frame update flag: YES — the explanatory object changes from endpoints to ordered transitions.
- Status: CANDIDATE

## MAPPING-BREAK T2

- Transfer attempt ID: T2
- Input problem/frame: Endpoint aggregation hides order-dependent target histories.
- Donor set: path=${path}; sha256=${digest}
- Donor IDs: D1
- Source comparison: SINGLE-DONOR LIMIT — hypothesis seed only; no abstract schema established; no target transport established
- Source relation / locator: replay restores a prior ordered state; D1:doi:10.1000/example-a, p. 4
- Target relation before transfer: target observations are irreversible aggregate summaries
- Attempted correspondence: source replay=target recovery; source prior state=target pre-aggregation state
- Non-correspondence axis: RELATION — the target has no inverse transition that identifies a prior state
- Failed invariant: recovery requires an invertible transition but target aggregation is many-to-one
- Transfer boundary: mapping breaks when every admissible target observation remains non-invertible
- Evidence / locator: target mismatch at research/target-frame.md:27 and source relation at doi:10.1000/example-a, p. 4
- Handoff: directing-research — preserve T2 in the TRANSFER DISPOSITION denominator
- Status: MAPPING-BREAK
`;

const judgment = (path: string, digest: string): string => `
# RESEARCH JUDGMENT SPEC

- Stage diagnosis: candidate-selection
- Blind-spot packet: locus=research/blind-spots.md; load-bearing premise=A1; open-set residual=OPEN; stop reason=no additional answer changes the frame
- Exploration allocation: Blind-spot packet=research/blind-spots.md; excavation=SBS Search budget; cross-frame probe cap=2 frames × 2 candidates
- Problem-frame slate: Frame A [CONTROL; slot=RELATION; holds premise A1; discriminator=order invariance]; Frame B [PREMISE-BREAK; slot=OBJECT; breaks premise A1; discriminator=unit split]; Frame C [ORTHOGONAL; slot=OBSERVATION; breaks premise A2; discriminator=proxy reversal]
- Selection axes: consequence=high; discriminability=one observation separates frames; feasibility=one-day probe; novelty=delta against nearest prior; bounded loss=one day
- Cheap victory: improve the endpoint proxy while the held-out target claim remains false
- Optimize/trust firewall: optimize the development metric; trust only an untouched held-out witness
- Diversity-collapse rule: after semantic dedup/collapse, if premise, target, or discriminator is shared, send exactly one coverage-gap regeneration to forging-novel-theses; final stop after that pass
- Prediction-registry policy: write every prediction to research/prediction-ledger.md before observing its result
- Denominator policy: record every candidate, mapping break, run, and failure
- Independent-audit requirement: generator and auditor remain separate; evidence surface=frozen transfer bundle; acceptance condition=reject unresolved provenance; actor assignment=orchestrating-agents
- Portfolio update: Bet A proceeds to target test; Bet B remains shelved pending a new target relation
- Reopen rule: an unexpected result may reopen the problem frame and update the diagnosed stage

## TRANSFER DISPOSITION

- Transfer bundle: path=${path}; sha256=${digest}
- Attempt denominator: T1, T2
- Candidate disposition: T1=TEST
- Preserved MAPPING-BREAK IDs: T2
- Basis / scope: admit T1 only for a bounded target-side contrast; retain T2 as a failed correspondence
- Target-side test or result locus: UNTESTED — prediction registry=research/predictions.md; handoff=target-domain owner
- Integration / retirement action: keep T1 at CANDIDATE and preserve T2; no adoption before target evidence
- Reopen trigger: reopen donor search or the target frame if the target contrast is non-discriminating
`;

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("frozen transfer artifact chain", () => {
	test("passes DONOR SET -> transfer bundle -> TRANSFER DISPOSITION end to end", () => {
		const paths = fixtureSet();
		write(paths.donorPath, donorSet);
		const donorDigest = sha256(paths.donorPath);
		write(paths.transferPath, transferBundle(paths.donorPath, donorDigest));
		const transferDigest = sha256(paths.transferPath);
		write(paths.judgmentPath, judgment(paths.transferPath, transferDigest));

		const donorResult = run(donorCheck, [paths.donorPath]);
		const candidateResult = run(candidateCheck, [
			"--donor-set",
			paths.donorPath,
			paths.transferPath,
		]);
		const judgmentResult = run(researchCheck, [
			"--donor-set",
			paths.donorPath,
			"--transfer-bundle",
			paths.transferPath,
			paths.judgmentPath,
		]);

		expect(donorResult.exitCode).toBe(0);
		expect(candidateResult.exitCode).toBe(0);
		expect(candidateResult.stdout).toContain("frozen DONOR SET verified");
		expect(judgmentResult.exitCode).toBe(0);
		expect(judgmentResult.stdout).toContain(
			"TRANSFER DISPOSITION attempts=2 mapping-breaks=1",
		);
	});

	test("rejects donor or transfer mutation after its digest was frozen", () => {
		const paths = fixtureSet();
		write(paths.donorPath, donorSet);
		const donorDigest = sha256(paths.donorPath);
		write(paths.transferPath, transferBundle(paths.donorPath, donorDigest));
		const transferDigest = sha256(paths.transferPath);
		write(paths.judgmentPath, judgment(paths.transferPath, transferDigest));

		write(
			paths.donorPath,
			`${donorSet}\n- Later mutation: changed after freeze`,
		);
		const donorMutation = run(candidateCheck, [
			"--donor-set",
			paths.donorPath,
			paths.transferPath,
		]);
		expect(donorMutation.exitCode).toBe(1);
		expect(donorMutation.stdout).toContain("DONOR SET SHA-256 does not match");

		write(paths.donorPath, donorSet);
		write(
			paths.transferPath,
			`${transferBundle(paths.donorPath, donorDigest)}\n- Later mutation: changed after disposition`,
		);
		const transferMutation = run(researchCheck, [
			"--donor-set",
			paths.donorPath,
			"--transfer-bundle",
			paths.transferPath,
			paths.judgmentPath,
		]);
		expect(transferMutation.exitCode).toBe(1);
		expect(transferMutation.stdout).toContain(
			"transfer bundle SHA-256 does not match",
		);
	});
});
