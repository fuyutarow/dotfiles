import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../scripts/configuration-contract-check.ts");
const validFixture = resolve(import.meta.dir, "fixtures/valid-contract.md");
const temporaryDirectories: string[] = [];

type RunResult = Readonly<{
	exitCode: number;
	stderr: string;
	stdout: string;
}>;

function fixture(content: string): string {
	const directory = mkdtempSync(join(tmpdir(), "configuration-contract-"));
	temporaryDirectories.push(directory);
	const path = join(directory, "CONFIGURATION-CONTRACT.md");
	writeFileSync(path, content);
	return path;
}

function run(path: string): RunResult {
	const result = Bun.spawnSync({
		cmd: ["bun", script, path],
		stderr: "pipe",
		stdout: "pipe",
		timeout: 10_000,
	});
	return {
		exitCode: result.exitCode,
		stderr: result.stderr.toString(),
		stdout: result.stdout.toString(),
	};
}

function validContract(): string {
	return readFileSync(validFixture, "utf8");
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("configuration-contract-check", () => {
	test("accepts a complete multi-regime contract", () => {
		const result = run(validFixture);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("C1  PASS");
		expect(result.stdout).toContain("C2  PASS");
		expect(result.stdout).toContain("C3  PASS");
		expect(result.stdout).toContain("configuration contract: FAIL=0");
		expect(result.stderr).toBe("");
	});

	test("rejects signed-canonical without a named profile", () => {
		const result = run(
			fixture(
				validContract().replace(
					"Canonicalization profile: RFC 8785 JCS",
					"Canonicalization profile: n/a",
				),
			),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("signed-canonical requires a named canonicalization profile");
	});

	test("rejects strict JSON as a canonicalization profile", () => {
		const result = run(
			fixture(
				validContract().replace(
					"Canonicalization profile: RFC 8785 JCS",
					"Canonicalization profile: strict JSON",
				),
			),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("strict JSON is not a named canonicalization profile");
	});

	test("accepts a gated decision that explicitly forbids exceptions", () => {
		const result = run(
			fixture(
				validContract().replace(
					"Exception encoding: encoded: signed exception object with owner and expiry",
					"Exception encoding: none: target rejects every exception",
				),
			),
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("C3  PASS");
	});

	test("rejects unknown trust regimes", () => {
		const result = run(
			fixture(
				validContract().replace(
					"human-authored, generated, signed-canonical, gated-decision",
					"human-authored, eventual-policy",
				),
			),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("unknown trust regime: eventual-policy");
	});

	test("rejects a negated raw-byte boundary", () => {
		const result = run(
			fixture(
				validContract()
					.replace(
						"human-authored, generated, signed-canonical, gated-decision",
						"signed-raw",
					)
					.replace(
						"Signature / digest input: canonical: UTF-8 bytes emitted after JCS",
						"Signature / digest input: not raw bytes; sign the semantic object instead",
					),
			),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("signed-raw requires a raw-byte signature/digest input");
	});

	test("rejects a negated canonical boundary", () => {
		const result = run(
			fixture(
				validContract().replace(
					"Signature / digest input: canonical: UTF-8 bytes emitted after JCS",
					"Signature / digest input: not canonical bytes; hash source bytes instead",
				),
			),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("signed-canonical requires a canonical signature/digest input");
	});

	test("rejects a raw-byte boundary with an absent payload", () => {
		const result = run(
			fixture(
				validContract()
					.replace(
						"human-authored, generated, signed-canonical, gated-decision",
						"signed-raw",
					)
					.replace(
						"Signature / digest input: canonical: UTF-8 bytes emitted after JCS",
						"Signature / digest input: raw-byte: n/a",
					),
			),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("signed-raw requires a raw-byte signature/digest input");
	});

	test("rejects a canonical boundary with an absent payload", () => {
		const result = run(
			fixture(
				validContract().replace(
					"Signature / digest input: canonical: UTF-8 bytes emitted after JCS",
					"Signature / digest input: canonical: n/a",
				),
			),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("signed-canonical requires a canonical signature/digest input");
	});

	test("rejects an embedded template placeholder", () => {
		const result = run(
			fixture(
				validContract().replace(
					"Consumer: package installer and policy verifier",
					"Consumer: <human editor> (replace this)",
				),
			),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("placeholder value: Consumer");
	});

	test("ignores fields inside a Markdown code fence", () => {
		const fence = String.fromCharCode(96).repeat(3);
		const result = run(
			fixture(
				fence +
					"text\nConsumer: an example only\n" +
					fence +
					"\n\n" +
					validContract(),
			),
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("configuration contract: FAIL=0");
	});

	test("ignores fields inside a tilde Markdown code fence", () => {
		const result = run(
			fixture(
				"~~~~text\nConsumer: an example only\n~~~~\n\n" + validContract(),
			),
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("configuration contract: FAIL=0");
	});

	test("keeps a fence open when a would-be closing fence has trailing code", () => {
		const fence = String.fromCharCode(96).repeat(4);
		const result = run(
			fixture(
				fence +
					"text\n" +
					fence +
					" this remains code\nConsumer: illustrative only\n" +
					fence +
					"\n\n" +
					validContract(),
			),
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("configuration contract: FAIL=0");
	});

	test("ignores fields inside an indented Markdown code block", () => {
		const result = run(
			fixture("    Consumer: illustrative only\n\n" + validContract()),
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("configuration contract: FAIL=0");
	});

	test("parses a declaration after an inline HTML comment", () => {
		const result = run(
			fixture(
				validContract().replace(
					"- Consumer: package installer and policy verifier",
					"<!-- declared below --> - Consumer: package installer and policy verifier",
				),
			),
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("configuration contract: FAIL=0");
	});

	test("parses a declaration after a multiline HTML comment closes", () => {
		const result = run(
			fixture(
				validContract().replace(
					"- Consumer: package installer and policy verifier",
					"<!-- declaration follows\n--> - Consumer: package installer and policy verifier",
				),
			),
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("configuration contract: FAIL=0");
	});

	test("rejects an empty trust-regime entry", () => {
		const result = run(
			fixture(
				validContract().replace(
					"human-authored, generated, signed-canonical, gated-decision",
					"human-authored,, signed-canonical",
				),
			),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("trust regime contains an empty comma-separated entry");
	});

	test("rejects duplicate consumer fields", () => {
		const result = run(
			fixture(validContract() + "\n- Consumer: second reader\n"),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("duplicate field: Consumer");
	});

	test("rejects a missing precedence field", () => {
		const result = run(
			fixture(
				validContract().replace(
					"- Precedence / merge: project source overrides global defaults; rules arrays replace; conflicting scalar values reject\n",
					"",
				),
			),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("required field: Precedence / merge");
	});

	test("rejects a missing verification command", () => {
		const result = run(
			fixture(
				validContract().replace(
					"- Verification command: tool verify-policy --config dist/policy.json --signature dist/policy.jws\n",
					"",
				),
			),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("required field: Verification command");
	});

	test("rejects comment-only decision and exception dispositions", () => {
		const result = run(
			fixture(
				validContract()
					.replace(
						"Decision record: record: decisions/policy-rulings.jsonl",
						"Decision record: n/a (approval is in a code comment)",
					)
					.replace(
						"Exception encoding: encoded: signed exception object with owner and expiry",
						"Exception encoding: n/a (assume operators know exceptions)",
					),
			),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("gated-decision requires Decision record: record: or none:");
		expect(result.stdout).toContain("gated-decision requires Exception encoding: encoded: or none:");
	});
});
