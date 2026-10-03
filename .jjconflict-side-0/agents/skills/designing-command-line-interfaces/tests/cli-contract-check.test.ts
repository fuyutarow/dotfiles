import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../scripts/cli-contract-check.ts");
const validFixture = resolve(import.meta.dir, "fixtures/valid-contract.md");
const temporaryDirectories: string[] = [];

type RunResult = Readonly<{ exitCode: number; stderr: string; stdout: string }>;

function fixture(content: string): string {
	const directory = mkdtempSync(join(tmpdir(), "cli-contract-"));
	temporaryDirectories.push(directory);
	const path = join(directory, "CLI-CONTRACT.md");
	writeFileSync(path, content);
	return path;
}

function validContract(): string {
	return readFileSync(validFixture, "utf8");
}

function run(path: string): RunResult {
	const result = Bun.spawnSync({
		cmd: ["bun", script, path],
		stderr: "pipe",
		stdout: "pipe",
		timeout: 10_000,
	});
	return { exitCode: result.exitCode, stderr: result.stderr.toString(), stdout: result.stdout.toString() };
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("cli-contract-check", () => {
	test("accepts a complete contract", () => {
		const result = run(validFixture);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("C0  PASS");
		expect(result.stdout).toContain("CLI CONTRACT: FAIL=0");
		expect(result.stderr).toBe("");
	});

	test("rejects a missing required receipt", () => {
		const result = run(fixture(validContract().replace(/- Negative receipt:.*\n/, "")));
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("required field: Negative receipt");
	});

	test("rejects duplicate fields", () => {
		const result = run(fixture(validContract() + "\n- Consumer regimes: ci\n"));
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("duplicate field: Consumer regimes");
	});

	test("rejects placeholders", () => {
		const result = run(fixture(validContract().replace("Parser profile: target parser rejects unknown flags and treats `--` as end of options.", "Parser profile: {{choose parser profile}}")));
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("placeholder value: Parser profile");
	});

	test("rejects a visible placeholder in a table cell", () => {
		const result = run(fixture(validContract().replace("inspect local state", "{{describe work}}")));
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("visible placeholder at line");
	});

	test("accepts a visible synopsis metavariable", () => {
		const result = run(fixture(validContract().replace("PATH...", "<path>")));
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("CLI CONTRACT: FAIL=0");
	});

	test("rejects a non-meaningful parser profile", () => {
		const result = run(fixture(validContract().replace("Parser profile: target parser rejects unknown flags and treats `--` as end of options.", "Parser profile: none")));
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("meaningful value required: Parser profile");
	});

	test("rejects non-meaningful effects and receipts", () => {
		const result = run(
			fixture(
				validContract()
					.replace("Effects / recovery: inspect reads local files only; apply writes selected records; dry-run predicts selected writes; force bypasses an existing-target guard; partial writes remain named; retry requires the same input snapshot; SIGINT stops future writes.", "Effects / recovery: none")
					.replace(/- Positive receipt:.*\n/, "- Positive receipt: none\n")
					.replace(/- Negative receipt:.*\n/, "- Negative receipt: none\n"),
			),
		);
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("meaningful value required: Effects / recovery");
		expect(result.stdout).toContain("meaningful value required: Positive receipt");
		expect(result.stdout).toContain("meaningful value required: Negative receipt");
	});

	test("rejects unknown consumer regimes", () => {
		const result = run(fixture(validContract().replace("human-interactive, shell-pipeline, ci, agent", "human-interactive, dashboard")));
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("unknown consumer regime: dashboard");
	});

	test("ignores fenced decoy fields", () => {
		const fence = String.fromCharCode(96).repeat(3);
		const result = run(fixture(fence + "\n- Consumer regimes: dashboard\n" + fence + "\n\n" + validContract()));
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("CLI CONTRACT: FAIL=0");
	});

	test("ignores indented and commented decoy fields", () => {
		const content = "    - Consumer regimes: dashboard\n<!-- - Consumer regimes: dashboard -->\n\n" + validContract();
		const result = run(fixture(content));
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("CLI CONTRACT: FAIL=0");
	});

	test("rejects a machine mode without framing or compatibility", () => {
		const result = run(
			fixture(
				validContract()
					.replace("Machine framing: one UTF-8 JSON object per line; no color or progress on stdout.", "Machine framing: none")
					.replace("Machine compatibility: `jsonl` v1 fields are additive-only; unknown fields may be ignored.", "Machine compatibility: none"),
			),
		);
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("machine mode requires a named machine framing");
		expect(result.stdout).toContain("machine mode requires a named machine compatibility");
	});

	test("known-bad input proves the red exit", () => {
		const result = run(fixture("# CLI CONTRACT\n\n## C0 CONSUMERS\n"));
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("required section: C5 EVOLUTION");
	});
});

