import { existsSync } from "node:fs";
import { cli } from "cleye";

// Consumer: agent/human verdict lines.
// Mechanical floor only: this script cannot prove a registry, parser, or range resolver behaves as claimed.

const requiredFields = [
	"Consumer",
	"Comparator",
	"Compatibility contract",
	"Scheme name",
	"Grammar",
	"SemVer claim",
	"Compatibility signal",
	"Chronology signal",
	"Release-order signal",
	"First release",
	"Compatible feature",
	"Compatible bug fix",
	"Breaking change",
	"Same-period second release",
	"Period rollover",
	"Pre-release / build metadata",
	"Range behavior",
	"Parser verification",
	"Positive receipt",
	"Negative receipt",
] satisfies readonly string[];

const semverClaims = ["conformant", "syntax-only", "not-claimed"] as const;

type ArgvType = "known-flag" | "unknown-flag" | "argument";
type Severity = "PASS" | "FAIL" | "MISSING";

function rejectPrototypeFlag(type: ArgvType, flag: string): void {
	if (type === "unknown-flag" && flag === "__proto__") {
		throw new Error("unknown option '--__proto__'");
	}
}

function inputPath(): string {
	const parsed = cli(
		{
			name: "versioning-contract-check.ts",
			parameters: ["<contract>"],
			strictFlags: true,
			ignoreArgv: rejectPrototypeFlag,
		},
		undefined,
		Bun.argv.slice(2),
	);
	if (parsed._.length !== 1 || parsed._.contract === undefined) {
		throw new Error("versioning-contract-check.ts requires exactly one contract path");
	}
	return parsed._.contract;
}

function fieldValue(line: string, label: string): string | undefined {
	const normalized = line
		.trim()
		.replace(/^[-*+]\s+/u, "")
		.replace(/^(?:\*\*|__)/u, "")
		.replaceAll("：", ":");
	if (!normalized.toLowerCase().startsWith(label.toLowerCase())) return undefined;
	const suffix = normalized
		.slice(label.length)
		.replace(/^(?:\*\*|__)/u, "")
		.trimStart();
	if (!suffix.startsWith(":")) return undefined;
	return suffix.slice(1).trim().replace(/^(?:\*\*|__)/u, "").trim();
}

function isPlaceholder(value: string | undefined): boolean {
	if (value === undefined || value.trim() === "") return true;
	return (
		/<[^>]*>/u.test(value) ||
		/^(?:tbd|todo|unknown|unresolved|undecided|未定|未記入|要決定|\?+)$/iu.test(
			value.trim(),
		)
	);
}

function extractFields(text: string): ReadonlyMap<string, readonly string[]> {
	const fields = new Map<string, string[]>();
	let activeFence: string | undefined;
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		const marker = trimmed.match(/^(?:`{3,}|~{3,})/u)?.[0];
		if (activeFence !== undefined) {
			activeFence = marker === activeFence && trimmed === marker ? undefined : activeFence;
			continue;
		}
		if (marker !== undefined) {
			activeFence = marker;
			continue;
		}
		if (/^(?: {4}|\t)/u.test(line)) continue;
		collectLineFields(line, fields);
	}
	return fields;
}

function collectLineFields(line: string, fields: Map<string, string[]>): void {
	for (const label of requiredFields) {
		const value = fieldValue(line, label);
		if (value === undefined) continue;
		const values = fields.get(label) ?? [];
		values.push(value);
		fields.set(label, values);
	}
}

async function main(): Promise<void> {
	const path = inputPath();
	if (!existsSync(path)) throw new Error("contract file not found: " + path);

	const fields = extractFields(await Bun.file(path).text());
	let failures = 0;
	const report = (id: string, severity: Severity, message: string): void => {
		process.stdout.write(id + "  " + severity.padEnd(7) + "  " + message + "\n");
		if (severity !== "PASS") failures += 1;
	};

	for (const label of requiredFields) {
		const values = fields.get(label) ?? [];
		if (values.length === 0) {
			report("V0", "MISSING", "required field: " + label);
			continue;
		}
		if (values.length > 1) {
			report("V0", "FAIL", "duplicate field: " + label);
			continue;
		}
		if (isPlaceholder(values[0])) {
			report("V0", "MISSING", "placeholder value: " + label);
		}
	}

	const semverClaim = fields.get("SemVer claim")?.[0];
	const rawClaim = semverClaim?.match(/^([a-z-]+)/iu)?.[1]?.toLowerCase();
	const claim = semverClaims.find((candidate) => candidate === rawClaim);
	if (claim === undefined) {
		report("V3", "FAIL", "SemVer claim must begin conformant, syntax-only, or not-claimed");
	} else {
		report("V3", "PASS", "SemVer claim: " + claim);
	}

	const comparator = fields.get("Comparator")?.[0] ?? "";
	const parserVerification = fields.get("Parser verification")?.[0] ?? "";
	if (/^(?:none|n\/?a|not applicable|なし|不要)(?:\b|\s|[(:：])/iu.test(comparator)) {
		report("V2", "FAIL", "a named comparator is required");
	}
	if (/^(?:none|n\/?a|not applicable|なし|不要)(?:\b|\s|[(:：])/iu.test(parserVerification)) {
		report("V4", "FAIL", "a parser verification path is required");
	}

	process.stdout.write("versioning contract: FAIL=" + failures + "\n");
	if (failures > 0) process.exitCode = 1;
}

await main().catch((error: unknown) => {
	process.stderr.write("FATAL: " + String(error) + "\n");
	process.exitCode = 2;
});
