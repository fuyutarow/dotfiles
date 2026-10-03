import { existsSync } from "node:fs";
import { cli } from "cleye";

// Consumer: agent/human verdict lines.
// Mechanical structural floor only: this cannot prove semantics, target behavior, or receipt truth.

const headings = [
	"C0 CONSUMERS",
	"C1 INVOCATION",
	"C2 EFFECTS",
	"C3 CHANNELS",
	"C4 OUTCOMES",
	"C5 EVOLUTION",
] satisfies readonly string[];

const fieldLabels = [
	"Consumer regimes",
	"Parser profile",
	"Ambiguous / invalid cases",
	"Effects / recovery",
	"Machine mode",
	"Machine framing",
	"Machine compatibility",
	"Positive receipt",
	"Negative receipt",
] satisfies readonly string[];

const meaningfulFields = [
	["Parser profile", "C1"],
	["Ambiguous / invalid cases", "C1"],
	["Effects / recovery", "C2"],
	["Positive receipt", "C5"],
	["Negative receipt", "C5"],
] satisfies readonly (readonly [string, string])[];

const consumerRegimes = [
	"human-interactive",
	"shell-pipeline",
	"ci",
	"agent",
	"other-caller",
] satisfies readonly string[];

type ArgvType = "known-flag" | "unknown-flag" | "argument";
type Severity = "PASS" | "FAIL" | "MISSING";
type VisibleLine = Readonly<{ text: string; number: number }>;
type RegimeParse = Readonly<{ malformed: boolean; values: readonly string[] }>;

const backtick = String.fromCharCode(96);

function rejectPrototypeFlag(type: ArgvType, flag: string, _value?: string): void {
	if (type === "unknown-flag" && flag === "__proto__") {
		throw new Error("unknown option '--__proto__'");
	}
}

function markdownFence(line: string): Readonly<{ marker: string; suffix: string }> | undefined {
	const match = line.match(new RegExp("^(" + backtick + "{3,}|~{3,})(.*)$"));
	if (match?.[1] === undefined || match[2] === undefined) return undefined;
	return { marker: match[1], suffix: match[2] };
}

function visibleLines(text: string): readonly VisibleLine[] {
	const result: VisibleLine[] = [];
	let activeFence: string | undefined;
	let inComment = false;
	for (const [index, original] of text.split("\n").entries()) {
		let line = original;
		const marker = markdownFence(line.trim());
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
			const end = line.indexOf("-->");
			if (end === -1) continue;
			inComment = false;
			line = line.slice(end + 3);
		}
		const start = line.indexOf("<!--");
		if (start !== -1) {
			const end = line.indexOf("-->", start + 4);
			if (end === -1) {
				inComment = true;
				continue;
			}
			line = line.slice(0, start) + line.slice(end + 3);
		}
		if (/^(?: {4}|\t)/.test(line)) continue;
		result.push({ text: line, number: index + 1 });
	}
	return result;
}

function fieldValue(line: string, label: string): string | undefined {
	const normalized = line
		.trim()
		.replace(/^[-*+]\s+/, "")
		.replace(/^(?:\*\*|__)/, "")
		.replaceAll("：", ":");
	if (!normalized.toLowerCase().startsWith(label.toLowerCase())) return undefined;
	const suffix = normalized.slice(label.length).replace(/^(?:\*\*|__)/, "").trimStart();
	if (!suffix.startsWith(":")) return undefined;
	return suffix.slice(1).trim().replace(/^(?:\*\*|__)/, "").trim();
}

function fields(lines: readonly VisibleLine[]): ReadonlyMap<string, readonly string[]> {
	const result = new Map<string, string[]>();
	for (const line of lines) {
		for (const label of fieldLabels) {
			const value = fieldValue(line.text, label);
			if (value === undefined) continue;
			const values = result.get(label) ?? [];
			values.push(value);
			result.set(label, values);
		}
	}
	return result;
}

function isPlaceholder(value: string | undefined): boolean {
	if (value === undefined || value.trim() === "") return true;
	return /\{\{[^}]*\}\}|^(?:tbd|todo|unknown|unresolved|未定|未記入|\?+)$/i.test(value.trim());
}

function isMeaningful(value: string | undefined): boolean {
	if (isPlaceholder(value)) return false;
	return !/^(?:n\/?a|none|not applicable|なし|不要)(?:\b|\s|[(:：])/i.test(value?.trim() ?? "");
}

function sectionHeading(line: string): string | undefined {
	const match = line.trim().match(/^#{1,6}\s+(C[0-5]\s+[A-Z]+)\s*$/);
	return match?.[1];
}

function sectionHasTable(lines: readonly VisibleLine[], heading: string): boolean {
	const start = lines.findIndex((line) => sectionHeading(line.text) === heading);
	if (start === -1) return false;
	const boundary = lines.findIndex((line, index) => index > start && sectionHeading(line.text) !== undefined);
	const end = boundary === -1 ? lines.length : boundary;
	const section = lines.slice(start + 1, end).map((line) => line.text.trim());
	const divider = section.findIndex((line) => /^\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|$/.test(line));
	if (divider === -1) return false;
	return section.slice(divider + 1).some((line) => /^\|.*\|$/.test(line));
}

function parseRegimes(value: string | undefined): RegimeParse {
	if (value === undefined) return { malformed: false, values: [] };
	const values = value.split(",").map((entry) => entry.trim().toLowerCase());
	return { malformed: values.some((entry) => entry === ""), values: values.filter((entry) => entry !== "") };
}

function inputPath(): string {
	const parsed = cli(
		{
			name: "cli-contract-check.ts",
			parameters: ["<contract>"],
			strictFlags: true,
			ignoreArgv: rejectPrototypeFlag,
		},
		undefined,
		Bun.argv.slice(2),
	);
	if (parsed._.length !== 1 || parsed._.contract === undefined) {
		throw new Error("cli-contract-check.ts requires exactly one contract path");
	}
	return parsed._.contract;
}

async function main(): Promise<void> {
	const path = inputPath();
	if (!existsSync(path)) throw new Error("contract file not found: " + path);
	const lines = visibleLines(await Bun.file(path).text());
	const declared = fields(lines);
	let failures = 0;
	const report = (gate: string, severity: Severity, message: string): void => {
		process.stdout.write(gate + "  " + severity.padEnd(7) + "  " + message + "\n");
		if (severity !== "PASS") failures += 1;
	};

	for (const heading of headings) {
		const occurrences = lines.filter((line) => sectionHeading(line.text) === heading).length;
		if (occurrences === 0) report(heading.slice(0, 2), "MISSING", "required section: " + heading);
		if (occurrences > 1) report(heading.slice(0, 2), "FAIL", "duplicate section: " + heading);
		if (occurrences === 1 && !sectionHasTable(lines, heading)) {
			report(heading.slice(0, 2), "FAIL", "nonempty Markdown table required in " + heading);
		}
	}

	for (const label of fieldLabels) {
		const values = declared.get(label) ?? [];
		if (values.length === 0) {
			report("C0", "MISSING", "required field: " + label);
			continue;
		}
		if (values.length > 1) {
			report("C0", "FAIL", "duplicate field: " + label);
			continue;
		}
		if (isPlaceholder(values[0])) report("C0", "MISSING", "placeholder value: " + label);
	}

	for (const line of lines) {
		if (/\{\{[^}]*\}\}/.test(line.text)) {
			report("C0", "FAIL", "visible placeholder at line " + line.number);
		}
	}

	for (const [label, gate] of meaningfulFields) {
		const values = declared.get(label) ?? [];
		if (values.length === 1 && !isMeaningful(values[0])) {
			report(gate, "FAIL", "meaningful value required: " + label);
		}
	}

	const parsedRegimes = parseRegimes(declared.get("Consumer regimes")?.[0]);
	const unknown = parsedRegimes.values.filter((regime) => !consumerRegimes.includes(regime));
	if (parsedRegimes.malformed) {
		report("C0", "FAIL", "consumer regimes contain an empty comma-separated entry");
	} else if (parsedRegimes.values.length === 0) {
		report("C0", "FAIL", "consumer regimes must name at least one known regime");
	} else if (unknown.length > 0) {
		report("C0", "FAIL", "unknown consumer regime: " + unknown.join(", "));
	} else {
		report("C0", "PASS", "consumer regimes: " + parsedRegimes.values.join(", "));
	}

	const machineMode = declared.get("Machine mode")?.[0];
	if (isMeaningful(machineMode)) {
		for (const label of ["Machine framing", "Machine compatibility"]) {
			if (!isMeaningful(declared.get(label)?.[0])) {
				report("C3", "FAIL", "machine mode requires a named " + label.toLowerCase());
			}
		}
	} else if (!/^none$/i.test(machineMode?.trim() ?? "")) {
		report("C3", "FAIL", "Machine mode must be none or a named mode");
	}

	process.stdout.write("----\n");
	process.stdout.write("CLI CONTRACT: FAIL=" + failures + " (structural floor only; does not prove semantics, target behavior, or receipt truth)\n");
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
	process.stderr.write("FATAL: " + (error instanceof Error ? error.message : String(error)) + "\n");
	process.exit(2);
});

