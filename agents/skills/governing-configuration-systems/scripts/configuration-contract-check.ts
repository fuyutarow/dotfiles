import { existsSync } from "node:fs";
import { cli } from "cleye";

// Consumer: agent/human verdict lines.
// Mechanical floor only: this script cannot validate a target schema, signature, or deployment.

const requiredFields = [
	"Consumer",
	"Authority / writer",
	"Effective configuration",
	"Source representation",
	"Trust regime",
	"Signature / digest input",
	"Canonicalization profile",
	"Schema / version",
	"Duplicate-key policy",
	"Number / Unicode policy",
	"Precedence / merge",
	"Decision record",
	"Exception encoding",
	"Verification command",
	"Positive case",
	"Negative case",
] satisfies readonly string[];

const meaningfulFields = [
	"Consumer",
	"Authority / writer",
	"Effective configuration",
	"Source representation",
	"Trust regime",
	"Schema / version",
	"Duplicate-key policy",
	"Number / Unicode policy",
	"Precedence / merge",
	"Verification command",
	"Positive case",
	"Negative case",
] satisfies readonly string[];

const trustRegimes = [
	"human-authored",
	"generated",
	"signed-raw",
	"signed-canonical",
	"gated-decision",
] satisfies readonly string[];

type ArgvType = "known-flag" | "unknown-flag" | "argument";
type Severity = "PASS" | "FAIL" | "MISSING";
type RegimeParse = Readonly<{
	malformed: boolean;
	values: readonly string[];
}>;

const backtick = String.fromCharCode(96);

function rejectPrototypeFlag(
	type: ArgvType,
	flag: string,
	_flagValue?: string,
): void {
	if (type === "unknown-flag" && flag === "__proto__") {
		throw new Error("unknown option '--__proto__'");
	}
}

function fieldValue(line: string, label: string): string | undefined {
	const normalized = line
		.trim()
		.replace(/^[-*+]\s+/, "")
		.replace(/^(?:\*\*|__)/, "")
		.replaceAll("：", ":");
	if (!normalized.toLowerCase().startsWith(label.toLowerCase())) {
		return undefined;
	}
	const suffix = normalized
		.slice(label.length)
		.replace(/^(?:\*\*|__)/, "")
		.trimStart();
	if (!suffix.startsWith(":")) return undefined;
	return suffix.slice(1).trim().replace(/^(?:\*\*|__)/, "").trim();
}

function isPlaceholder(value: string | undefined): boolean {
	if (value === undefined || value.trim() === "") return true;
	const normalized = value.trim();
	return (
		/<[^>]*>/.test(normalized) ||
		/^(?:tbd|todo|unknown|unresolved|未定|未記入|\?+)$/i.test(normalized)
	);
}

function isMeaningful(value: string | undefined): boolean {
	if (isPlaceholder(value)) return false;
	return !/^(?:n\/?a|none|not applicable|なし|不要)(?:\b|\s|[(:：])/i.test(
		value?.trim() ?? "",
	);
}

function boundaryPayload(
	value: string | undefined,
	kind: "canonical" | "raw-byte",
): string | undefined {
	const match = value?.match(new RegExp("^" + kind + ":\\s*(.+)$", "i"));
	const payload = match?.[1]?.trim();
	return isMeaningful(payload) ? payload : undefined;
}

function disposition(
	value: string | undefined,
	allowed: readonly string[],
): string | undefined {
	const match = value?.match(/^([a-z-]+):\s*(.+)$/i);
	const kind = match?.[1]?.toLowerCase();
	const payload = match?.[2]?.trim();
	if (kind === undefined || payload === undefined || !allowed.includes(kind)) {
		return undefined;
	}
	return isMeaningful(payload) ? kind : undefined;
}

function markdownFence(
	line: string,
): Readonly<{ marker: string; suffix: string }> | undefined {
	const match = line.match(
		new RegExp("^(" + backtick + "{3,}|~{3,})(.*)$"),
	);
	if (match?.[1] === undefined || match[2] === undefined) return undefined;
	return { marker: match[1], suffix: match[2] };
}

function extractFields(text: string): ReadonlyMap<string, readonly string[]> {
	const fields = new Map<string, string[]>();
	let inComment = false;
	let activeFence: string | undefined;
	for (const original of text.split("\n")) {
		let line = original;
		let trimmed = line.trim();
		const marker = markdownFence(trimmed);
		if (activeFence !== undefined) {
			if (
				marker !== undefined &&
				marker.marker[0] === activeFence[0] &&
				marker.marker.length >= activeFence.length &&
				marker.suffix.trim() === ""
			) {
				activeFence = undefined;
			}
			continue;
		}
		if (marker !== undefined) {
			activeFence = marker.marker;
			continue;
		}
		if (inComment) {
			const commentEnd = line.indexOf("-->");
			if (commentEnd === -1) continue;
			inComment = false;
			line = line.slice(commentEnd + 3);
			trimmed = line.trim();
		}
		const commentStart = line.indexOf("<!--");
		if (commentStart !== -1) {
			const commentEnd = line.indexOf("-->", commentStart + 4);
			if (commentEnd === -1) {
				inComment = true;
				continue;
			}
			line = line.slice(0, commentStart) + line.slice(commentEnd + 3);
		}
		if (/^(?: {4}|\t)/.test(line)) continue;
		for (const label of requiredFields) {
			const value = fieldValue(line, label);
			if (value === undefined) continue;
			const values = fields.get(label) ?? [];
			values.push(value);
			fields.set(label, values);
		}
	}
	return fields;
}

function regimes(value: string | undefined): RegimeParse {
	if (value === undefined) return { malformed: false, values: [] };
	const entries = value.split(",").map((entry) => entry.trim().toLowerCase());
	return {
		malformed: entries.some((entry) => entry === ""),
		values: entries.filter((entry) => entry !== ""),
	};
}

function inputPath(): string {
	const parsed = cli(
		{
			name: "configuration-contract-check.ts",
			parameters: ["<contract>"],
			strictFlags: true,
			ignoreArgv: rejectPrototypeFlag,
		},
		undefined,
		Bun.argv.slice(2),
	);
	if (parsed._.length !== 1 || parsed._.contract === undefined) {
		throw new Error("configuration-contract-check.ts requires exactly one contract path");
	}
	return parsed._.contract;
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
			report("C0", "MISSING", "required field: " + label);
			continue;
		}
		if (values.length > 1) {
			report("C0", "FAIL", "duplicate field: " + label);
			continue;
		}
		if (isPlaceholder(values[0])) {
			report("C0", "MISSING", "placeholder value: " + label);
		}
	}

	for (const label of meaningfulFields) {
		const value = fields.get(label)?.[0];
		if (!isMeaningful(value)) {
			report("C1", "FAIL", "meaningful value required: " + label);
		}
	}

	const parsedRegimes = regimes(fields.get("Trust regime")?.[0]);
	const selectedRegimes = parsedRegimes.values;
	const unknownRegimes = selectedRegimes.filter(
		(regime) => !trustRegimes.includes(regime),
	);
	if (parsedRegimes.malformed) {
		report("C1", "FAIL", "trust regime contains an empty comma-separated entry");
	} else if (selectedRegimes.length === 0) {
		report("C1", "FAIL", "trust regime must name at least one known regime");
	} else if (unknownRegimes.length > 0) {
		report("C1", "FAIL", "unknown trust regime: " + unknownRegimes.join(", "));
	} else {
		report("C1", "PASS", "trust regimes: " + selectedRegimes.join(", "));
	}

	const signatureInput = fields.get("Signature / digest input")?.[0];
	const canonicalization = fields.get("Canonicalization profile")?.[0];
	if (selectedRegimes.includes("signed-raw")) {
		if (boundaryPayload(signatureInput, "raw-byte") === undefined) {
			report("C2", "FAIL", "signed-raw requires a raw-byte signature/digest input");
		} else {
			report("C2", "PASS", "raw-byte boundary named");
		}
	}
	if (selectedRegimes.includes("signed-canonical")) {
		if (!isMeaningful(canonicalization)) {
			report("C2", "FAIL", "signed-canonical requires a named canonicalization profile");
		} else if (/^strict\s+json(?:\s|$)/i.test(canonicalization?.trim() ?? "")) {
			report("C2", "FAIL", "strict JSON is not a named canonicalization profile");
		} else {
			report("C2", "PASS", "canonicalization profile: " + canonicalization);
		}
		if (boundaryPayload(signatureInput, "canonical") === undefined) {
			report("C2", "FAIL", "signed-canonical requires a canonical signature/digest input");
		}
	}
	if (selectedRegimes.includes("gated-decision")) {
		const decision = disposition(fields.get("Decision record")?.[0], [
			"none",
			"record",
		]);
		const exception = disposition(fields.get("Exception encoding")?.[0], [
			"encoded",
			"none",
		]);
		if (decision === undefined) {
			report("C3", "FAIL", "gated-decision requires Decision record: record: or none:");
		}
		if (exception === undefined) {
			report("C3", "FAIL", "gated-decision requires Exception encoding: encoded: or none:");
		}
		if (decision !== undefined && exception !== undefined) {
			report("C3", "PASS", "decision and exception dispositions are explicit");
		}
	}

	process.stdout.write("----\n");
	process.stdout.write(
		"configuration contract: FAIL=" +
			failures +
			" (mechanical floor only; does not validate target semantics, signatures, or deployment)\n",
	);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
	process.stderr.write(
		"FATAL: " + (error instanceof Error ? error.message : String(error)) + "\n",
	);
	process.exit(2);
});
