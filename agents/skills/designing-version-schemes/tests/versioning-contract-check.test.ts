import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../scripts/versioning-contract-check.ts");
const validFixture = resolve(import.meta.dir, "fixtures/valid-contract.md");
const temporaryDirectories: string[] = [];

function run(content: string): Readonly<{ exitCode: number; stdout: string }> {
	const directory = mkdtempSync(join(tmpdir(), "versioning-contract-"));
	temporaryDirectories.push(directory);
	const fixture = join(directory, "VERSIONING-CONTRACT.md");
	writeFileSync(fixture, content);
	const result = Bun.spawnSync({
		cmd: ["bun", script, fixture],
		stderr: "pipe",
		stdout: "pipe",
		timeout: 10_000,
	});
	return { exitCode: result.exitCode, stdout: result.stdout.toString() };
}

function clearTemporaryDirectories(): void {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
}

afterEach(clearTemporaryDirectories);

function validContract(): string {
	return readFileSync(validFixture, "utf8");
}

describe("versioning-contract-check", () => {
	test("accepts a complete custom calendar contract", () => {
		const result = Bun.spawnSync({
			cmd: ["bun", script, validFixture],
			stderr: "pipe",
			stdout: "pipe",
			timeout: 10_000,
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("V3  PASS");
		expect(result.stdout.toString()).toContain("versioning contract: FAIL=0");
	});

	test("rejects an undecided SemVer claim", () => {
		const result = run(validContract().replace("syntax-only:", "undecided:"));
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("SemVer claim must begin");
	});

	test("rejects an unnamed comparator", () => {
		const result = run(validContract().replace("Comparator: target SemVer parser and deployment tag sorter", "Comparator: none"));
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("a named comparator is required");
	});

	test("rejects missing transition fields", () => {
		const result = run(validContract().replace("- Same-period second release: increment REVISION even when the release contains a feature\n", ""));
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("required field: Same-period second release");
	});
});
