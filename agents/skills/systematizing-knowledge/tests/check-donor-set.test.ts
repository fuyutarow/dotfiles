import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../scripts/check-donor-set.ts");
const temporaryDirectories: string[] = [];

type RunResult = Readonly<{
	exitCode: number;
	stderr: string;
	stdout: string;
}>;

const run = (arguments_: readonly string[], stdin?: string): RunResult => {
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

const fixture = (content: string): string => {
	const directory = mkdtempSync(join(tmpdir(), "donor-set-"));
	temporaryDirectories.push(directory);
	const path = join(directory, "donor-set.md");
	writeFileSync(path, `${content.trim()}\n`);
	return path;
};

const twoDonors = `
# DONOR SET

- Transfer search question: Which source relations preserve recoverability after information is aggregated?
- Coverage contract: bounded comparison of the two supplied primary sources; no completeness claim
- Selection rule: select by explicit relation and preconditions, not shared object names, vocabulary, or domain distance

## Donor records

| Donor ID | Source / locator | Source domain | Source scope | Roles / entities | Relation | Preconditions | Observable consequence | Boundary / failure |
|---|---|---|---|---|---|---|---|---|
| D1 | doi:10.1000/example-a, p. 4 | distributed logs | retained ordered event histories | event; ordered log; replay | replay preserves recoverable order before aggregation | events remain ordered and retained | distinct histories can be reconstructed | compaction removes the required order |
| D2 | sources/control.md:18 | control theory | observable dynamical systems | latent state; observations; smoother | backward smoothing recovers state relations from ordered observations | the system is observable and dynamics are specified | different latent trajectories remain distinguishable | unobservable modes collapse to one record |

## Comparison

- Common relational schema: preserving ordered intermediate relations permits recovery that endpoint aggregation destroys
- Non-common structure: D1 assumes discrete lossless events; D2 permits noisy continuous observations
- Retrieval-only cues: shared words such as log, state, and recovery located candidates but do not justify transfer
- Single-donor limit: NONE — two distinct donor evidence units were compared

## Knowledge state

- Known: both located sources describe a recoverability relation under explicit preconditions
- Uncertain: whether the common schema survives outside their stated scopes
- Disputed: none found within the bounded supplied corpus
- Missing: target-side correspondence and evidence, intentionally not assessed here

## Handoff

- Handoff: forging-novel-theses — donor IDs D1,D2 plus source relations and boundaries; no target mapping, target prediction, thesis, or test verdict
`;

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("check-donor-set", () => {
	test("accepts a target-agnostic two-source DONOR SET by path and stdin", () => {
		const byPath = run([fixture(twoDonors)]);
		const byStdin = run(["-"], twoDonors);

		expect(byPath.exitCode).toBe(0);
		expect(byPath.stdout).toContain("DONOR SET: FAIL=0");
		expect(byStdin.exitCode).toBe(0);
		expect(byStdin.stdout).toContain("donors=2");
	});

	test("accepts one donor only as a non-generalized hypothesis seed", () => {
		const oneDonor = twoDonors
			.replace(
				"preserving ordered intermediate relations permits recovery that endpoint aggregation destroys",
				"HYPOTHESIS SEED — one located relation; no abstract schema established",
			)
			.replace(
				"NONE — two distinct donor evidence units were compared",
				"SINGLE-DONOR LIMIT — hypothesis seed only; no abstract schema established; no target transport established",
			)
			.replace(/\| D2 \|.*\n/, "")
			.replace("donor IDs D1,D2", "donor ID D1");
		const result = run([fixture(oneDonor)]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("single-donor limit retained");
	});

	test("rejects one donor promoted to an established schema", () => {
		const invalid = twoDonors
			.replace(/\| D2 \|.*\n/, "")
			.replace("donor IDs D1,D2", "donor ID D1");
		const result = run([fixture(invalid)]);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain(
			"single-donor DONOR SET requires an explicit non-generalization limit",
		);
	});

	test("rejects duplicate donor evidence disguised as two donors", () => {
		const invalid = twoDonors.replace(
			"sources/control.md:18",
			"doi:10.1000/example-a, p. 4",
		);
		const result = run([fixture(invalid)]);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain(
			"donor IDs must resolve to distinct donor evidence units",
		);
	});

	test("requires a file:line or a DOI/URL paired with an exact localizer", () => {
		for (const locator of [
			"a paper somewhere",
			"p. 4",
			"doi:10.1000/example-a",
		]) {
			const invalid = twoDonors.replace("doi:10.1000/example-a, p. 4", locator);
			const result = run([fixture(invalid)]);

			expect(result.exitCode).toBe(1);
			expect(result.stdout).toContain(
				"donor relation requires a source locator",
			);
		}
	});

	test("rejects target mapping or target-side support inside DONOR SET", () => {
		const mapping = twoDonors.replace(
			"- Known: both located sources describe a recoverability relation under explicit preconditions",
			"- Target mapping: source replay maps to the target assay\n- Known: both located sources describe a recoverability relation under explicit preconditions",
		);
		const support = twoDonors.replace(
			"- Missing: target-side correspondence and evidence, intentionally not assessed here",
			"- Target support: SUPPORTED because both donor systems succeeded",
		);
		const targetSideSupport = twoDonors.replace(
			"- Missing: target-side correspondence and evidence, intentionally not assessed here",
			"- Target-side support: UNTESTED",
		);
		const correspondenceMap = twoDonors.replace(
			"- Known: both located sources describe a recoverability relation under explicit preconditions",
			"- Correspondence map: source replay=target assay transition; source log=target history\n- Known: both located sources describe a recoverability relation under explicit preconditions",
		);

		const mappingResult = run([fixture(mapping)]);
		const supportResult = run([fixture(support)]);
		const targetSideSupportResult = run([fixture(targetSideSupport)]);
		const correspondenceMapResult = run([fixture(correspondenceMap)]);

		expect(mappingResult.exitCode).toBe(1);
		expect(mappingResult.stdout).toContain(
			"target mapping belongs to forging-novel-theses",
		);
		expect(supportResult.exitCode).toBe(1);
		expect(supportResult.stdout).toContain(
			"source-side success cannot establish target-side support",
		);
		expect(targetSideSupportResult.exitCode).toBe(1);
		expect(targetSideSupportResult.stdout).toContain(
			"source-side success cannot establish target-side support",
		);
		expect(correspondenceMapResult.exitCode).toBe(1);
		expect(correspondenceMapResult.stdout).toContain(
			"target mapping belongs to forging-novel-theses",
		);
	});

	test("does not borrow fields or donor tables from a later Notes section", () => {
		const misplacedField = `${twoDonors.replace(
			/^- Transfer search question:.*$/m,
			"",
		)}\n## Notes\n- Transfer search question: Which source relations preserve recoverability after aggregation?`;
		const donorTable = twoDonors.match(/^\| Donor ID[\s\S]*?^\| D2 .*$/m)?.[0];
		expect(donorTable).toBeDefined();
		const misplacedTable = `${twoDonors.replace(donorTable ?? "", "")}\n## Notes\n${donorTable ?? ""}`;

		const fieldResult = run([fixture(misplacedField)]);
		const tableResult = run([fixture(misplacedTable)]);

		expect(fieldResult.exitCode).toBe(1);
		expect(fieldResult.stdout).toContain(
			"Transfer search question: required field not found",
		);
		expect(tableResult.exitCode).toBe(1);
		expect(tableResult.stdout).toContain("Donor records table is missing");
	});

	test("does not borrow Comparison fields from nested Notes headings", () => {
		for (const heading of ["##", "###", "####", "######"]) {
			const invalid = twoDonors
				.replace(/^- Single-donor limit:.*$/m, "")
				.replace(
					"\n## Knowledge state",
					`\n${heading} Notes\n- Single-donor limit: NONE — borrowed from a nested section\n\n## Knowledge state`,
				);
			const result = run([fixture(invalid)]);

			expect(result.exitCode).toBe(1);
			expect(result.stdout).toContain(
				"Single-donor limit: required field not found",
			);
		}
	});

	test("rejects positive target leakage hidden in Known or donor-record prose", () => {
		const knownMapping = twoDonors.replace(
			"- Known: both located sources describe a recoverability relation under explicit preconditions",
			"- Known: source replay maps to the target assay transition and establishes target correspondence",
		);
		const knownSupport = twoDonors.replace(
			"- Known: both located sources describe a recoverability relation under explicit preconditions",
			"- Known: target-side support is established because both donor systems succeeded",
		);
		const tablePrediction = twoDonors.replace(
			"replay preserves recoverable order before aggregation",
			"target prediction: ordered target traces will recover hidden assay histories",
		);

		for (const invalid of [knownMapping, knownSupport, tablePrediction]) {
			const result = run([fixture(invalid)]);
			expect(result.exitCode).toBe(1);
		}
	});

	test("allows Missing and Handoff boundary sentences that prohibit target claims", () => {
		const bounded = twoDonors
			.replace(
				"- Missing: target-side correspondence and evidence, intentionally not assessed here",
				"- Missing: no target mapping, target support, target prediction, or thesis claim is assessed here",
			)
			.replace(
				"no target mapping, target prediction, thesis, or test verdict",
				"no target mapping, target support, target prediction, thesis claim, or test verdict",
			);
		const result = run([fixture(bounded)]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("DONOR SET: FAIL=0");
	});

	test("does not let a negative boundary field hide a positive target claim", () => {
		const mixed = twoDonors.replace(
			"- Missing: target-side correspondence and evidence, intentionally not assessed here",
			"- Missing: no target mapping is assessed here; target-side support is established because both donors succeeded",
		);
		const result = run([fixture(mixed)]);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain(
			"source-side success cannot establish target-side support",
		);
	});

	test("requires stable donor IDs", () => {
		const invalid = twoDonors.replace("| D1 |", "| D 1 |");
		const result = run([fixture(invalid)]);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("Donor ID must be a stable identifier");
	});

	test("rejects a surface-similarity selection rule", () => {
		const invalid = twoDonors.replace(
			"select by explicit relation and preconditions, not shared object names, vocabulary, or domain distance",
			"select sources that use similar terminology",
		);
		const result = run([fixture(invalid)]);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain(
			"selection rule must privilege relations and reject surface-only matching",
		);
	});

	test("uses Cleye's strict unknown-flag failure", () => {
		const result = run(["--unexpected"]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Unknown flag: --unexpected");
	});
});
