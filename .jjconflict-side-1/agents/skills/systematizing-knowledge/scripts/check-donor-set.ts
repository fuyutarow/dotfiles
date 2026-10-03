import { existsSync } from "node:fs";
import { cli } from "cleye";

// Consumer: agent/human verdict lines for target-agnostic DONOR SET artifacts.
// Mechanical floor only: this script cannot establish a useful schema or target fit.

type Severity = "PASS" | "WARN" | "FAIL" | "MISSING";

type DonorRecord = Readonly<{
	boundary: string;
	consequence: string;
	domain: string;
	id: string;
	locator: string;
	preconditions: string;
	relation: string;
	roles: string;
	scope: string;
}>;

const requiredColumns = [
	"Donor ID",
	"Source / locator",
	"Source domain",
	"Source scope",
	"Roles / entities",
	"Relation",
	"Preconditions",
	"Observable consequence",
	"Boundary / failure",
] satisfies readonly string[];

function rejectPrototypeFlag(
	type: "known-flag" | "unknown-flag" | "argument",
	flag: string,
): void {
	if (type === "unknown-flag" && flag === "__proto__") {
		throw new Error(`unknown option '--${flag}'`);
	}
}

function fieldPattern(label: string): RegExp {
	const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(
		String.raw`^\s*(?:[-*+]\s+|#{1,6}\s+)?(?:\*\*|__)?${escaped}(?:(?:\*\*|__)\s*[：:]|\s*[：:](?:\*\*|__)?)`,
		"i",
	);
}

function valueAfterColon(line: string): string {
	const normalized = line.replaceAll("：", ":");
	const index = normalized.indexOf(":");
	return index === -1
		? ""
		: normalized
				.slice(index + 1)
				.trim()
				.replace(/^(?:\*\*|__)\s*/, "");
}

function readField(
	lines: readonly string[],
	label: string,
): string | undefined {
	const pattern = fieldPattern(label);
	const line = lines.find((candidate) => pattern.test(candidate));
	return line === undefined ? undefined : valueAfterColon(line);
}

function sectionBody(
	lines: readonly string[],
	heading: string,
): Readonly<{ count: number; lines: readonly string[] }> {
	const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`^\\s*##\\s+${escaped}\\s*$`, "i");
	const indices = lines.flatMap((line, index) =>
		pattern.test(line) ? [index] : [],
	);
	const start = indices[0];
	if (start === undefined) return { count: 0, lines: [] };
	const relativeEnd = lines
		.slice(start + 1)
		.findIndex((line) => /^\s*#{1,6}\s+/.test(line));
	const end = relativeEnd === -1 ? lines.length : start + 1 + relativeEnd;
	return { count: indices.length, lines: lines.slice(start + 1, end) };
}

function placeholder(value: string): boolean {
	return (
		value.trim() === "" ||
		/\[\.\.\.\]|\[…\]|\[ *\]/.test(value) ||
		/^(?:TBD|N\/?A|NA|未定|未記入|-|—|\?+)$/i.test(value.trim())
	);
}

function tableCells(line: string): string[] {
	const trimmed = line.trim();
	if (!trimmed.startsWith("|")) return [];
	return trimmed
		.replace(/^\|/, "")
		.replace(/\|$/, "")
		.split("|")
		.map((cell) => cell.trim());
}

function separatorRow(cells: readonly string[]): boolean {
	return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function donorRecords(lines: readonly string[]): Readonly<{
	findings: string[];
	records: DonorRecord[];
}> {
	const findings: string[] = [];
	const headerIndex = lines.findIndex((line) => {
		const cells = tableCells(line);
		return cells[0]?.toLowerCase() === "donor id";
	});
	if (headerIndex === -1) {
		return {
			findings: ["Donor records table is missing"],
			records: [],
		};
	}

	const header = tableCells(lines[headerIndex] ?? "");
	if (
		header.length !== requiredColumns.length ||
		header.some((column, index) => column !== requiredColumns[index])
	) {
		findings.push(
			`Donor records columns must be exactly: ${requiredColumns.join(" | ")}`,
		);
	}

	const records: DonorRecord[] = [];
	for (const line of lines.slice(headerIndex + 1)) {
		if (/^\s*#{1,6}\s+/.test(line)) break;
		const cells = tableCells(line);
		if (cells.length === 0 || separatorRow(cells)) continue;
		if (cells.length !== requiredColumns.length) {
			findings.push(
				`Donor record has ${cells.length} cells; expected ${requiredColumns.length}`,
			);
			continue;
		}
		if (cells.some(placeholder)) {
			findings.push(
				"Every donor record cell must be non-empty and non-placeholder",
			);
			continue;
		}
		const [
			id,
			locator,
			domain,
			scope,
			roles,
			relation,
			preconditions,
			consequence,
			boundary,
		] = cells;
		if (
			id === undefined ||
			locator === undefined ||
			domain === undefined ||
			scope === undefined ||
			roles === undefined ||
			relation === undefined ||
			preconditions === undefined ||
			consequence === undefined ||
			boundary === undefined
		) {
			findings.push("Donor record parsing failed despite a complete row");
			continue;
		}
		records.push({
			boundary,
			consequence,
			domain,
			id,
			locator,
			preconditions,
			relation,
			roles,
			scope,
		});
	}
	if (records.length === 0)
		findings.push("DONOR SET requires at least one donor record");
	return { findings, records };
}

function located(value: string): boolean {
	const fileLine =
		/(?:^|\s)[\w./-]+\.(?:md|txt|json|csv|pdf):\d+(?:-\d+)?\b/i.test(value);
	if (fileLine) return true;

	const source = /\bdoi:\S+|https?:\/\/\S+/i.test(value);
	const localizer =
		/(?:\b(?:p{1,2}\.?\s*\d+(?:-\d+)?|pages?\s+\d+(?:-\d+)?|§\s*[A-Za-z0-9.-]+|section\s+[A-Za-z0-9.-]+|table\s+[A-Za-z0-9.-]+|figure\s+[A-Za-z0-9.-]+|fig\.\s*[A-Za-z0-9.-]+)\b|#[A-Za-z0-9._-]+)/i.test(
			value,
		);
	return source && localizer;
}

function stableDonorId(value: string): boolean {
	return /^[A-Za-z][A-Za-z0-9._-]*$/.test(value);
}

type TargetLeak = "mapping" | "prediction" | "support" | "thesis";

function positiveTargetLeaks(line: string): readonly TargetLeak[] {
	const value = line.replace(/[*_`]/g, " ").replace(/\s+/g, " ").trim();
	const leaks: TargetLeak[] = [];

	if (
		/(?:\btarget\s+(?:mapping|correspondence)\s*(?::|=)\s*(?!(?:no|none|missing|unassessed|untested|unverified|unknown)\b)\S|\btarget\s+(?:mapping|correspondence)\s+(?:is|was|has been)\s+(?:now\s+)?(?:valid|established|supported|confirmed|demonstrated)\b|\b(?:source|donor|role|relation)\b.{0,80}\bmaps?\s+(?:onto|to)\s+(?:the\s+)?target\b)/i.test(
			value,
		) ||
		/対象(?:への|の)?(?:対応付け|写像|マッピング).{0,80}(?:成立|妥当|支持|確認|実証)|(?:ソース|ドナー|役割|関係).{0,80}対象(?:へ|に)(?:対応付け|写像|マッピング)/.test(
			value,
		)
	) {
		leaks.push("mapping");
	}
	if (
		/(?:\btarget\s+prediction\s*(?::|=)\s*(?!(?:no|none|missing|unassessed|untested|unverified|unknown)\b)\S|\btarget\s+prediction\s+(?:is|was|has been)\s+(?:now\s+)?(?:supported|confirmed|validated|demonstrated)\b|\bpredicts?\b.{0,80}\btarget\b)/i.test(
			value,
		) ||
		/対象(?:への|の)?予測.{0,80}(?:示す|予測|成立|支持|確認)/.test(value)
	) {
		leaks.push("prediction");
	}
	if (
		/\b(?:target(?:-side)?\s+(?:support|evidence)|target\s+evidence)\s+(?:is|was|has been)\s+(?:now\s+)?(?:supported|established|demonstrated|confirmed|validated)\b|\b(?:target(?:-side)?\s+(?:support|evidence)|target\s+evidence)\s*(?::|=)\s*(?:SUPPORTED|ESTABLISHED|CONFIRMED|VALIDATED)\b/i.test(
			value,
		) ||
		/対象側(?:の)?(?:支持|証拠).{0,80}(?:支持|確立|実証|確認|検証)/.test(value)
	) {
		leaks.push("support");
	}
	if (
		/(?:\b(?:target\s+)?thesis(?:\s+claim)?\s*(?::|=)\s*(?!(?:no|none|missing|unassessed|untested|unverified|unknown)\b)\S|\b(?:target\s+)?thesis(?:\s+claim)?\s+(?:is|was|has been)\s+(?:now\s+)?(?:valid|established|supported|confirmed|demonstrated)\b|\b(?:target\s+)?thesis(?:\s+claim)?\s+(?:argues?|shows?|supports?|will)\b)/i.test(
			value,
		) ||
		/(?:対象(?:への|の)?仮説|仮説(?:主張)?).{0,80}(?:成立|主張|示す|支持|確認)/.test(
			value,
		)
	) {
		leaks.push("thesis");
	}
	return leaks;
}

async function input(): Promise<string> {
	const parsed = cli(
		{
			name: "check-donor-set.ts",
			parameters: ["[donorSet]"],
			strictFlags: true,
			ignoreArgv: rejectPrototypeFlag,
		},
		undefined,
		Bun.argv.slice(2),
	);
	if (parsed._.length > 1) {
		throw new Error("check-donor-set.ts accepts at most one donor-set path");
	}
	const path = parsed._.donorSet;
	if (path === undefined || path === "-") {
		return new Response(Bun.stdin.stream()).text();
	}
	if (!existsSync(path)) {
		throw new Error(`check-donor-set: file not found: ${path}`);
	}
	return Bun.file(path).text();
}

async function main(): Promise<void> {
	const text = await input();
	const documentLines = text.split(/\r?\n/);
	let failures = 0;
	let warnings = 0;
	const report = (id: string, severity: Severity, message: string): void => {
		process.stdout.write(`${id}  ${severity.padEnd(7)}  ${message}\n`);
		if (severity === "FAIL" || severity === "MISSING") failures += 1;
		if (severity === "WARN") warnings += 1;
	};

	const donorSetHeadings = documentLines.flatMap((line, index) =>
		/^\s*#\s+DONOR SET\s*$/i.test(line) ? [index] : [],
	);
	const headingIndex = donorSetHeadings[0];
	let lineOffset = 1;
	let lines: readonly string[] = [];
	if (headingIndex === undefined) {
		report("D0", "MISSING", "DONOR SET heading is required");
	} else {
		if (donorSetHeadings.length > 1) {
			report("D0", "FAIL", "DONOR SET heading must appear exactly once");
		} else {
			report("D0", "PASS", "DONOR SET heading present");
		}
		const relativeEnd = documentLines
			.slice(headingIndex + 1)
			.findIndex((line) => /^\s*#\s+/.test(line));
		const end =
			relativeEnd === -1
				? documentLines.length
				: headingIndex + 1 + relativeEnd;
		lines = documentLines.slice(headingIndex + 1, end);
		lineOffset = headingIndex + 2;
	}

	const firstSection = lines.findIndex((line) => /^\s*##\s+/.test(line));
	const preamble = firstSection === -1 ? lines : lines.slice(0, firstSection);
	const donorSection = sectionBody(lines, "Donor records");
	const comparisonSection = sectionBody(lines, "Comparison");
	const knowledgeSection = sectionBody(lines, "Knowledge state");
	const handoffSection = sectionBody(lines, "Handoff");
	for (const [heading, count] of [
		["Donor records", donorSection.count],
		["Comparison", comparisonSection.count],
		["Knowledge state", knowledgeSection.count],
		["Handoff", handoffSection.count],
	] satisfies ReadonlyArray<readonly [string, number]>) {
		if (count !== 1) {
			report(
				"D0",
				count === 0 ? "MISSING" : "FAIL",
				`${heading} section must appear exactly once`,
			);
		}
	}

	const requiredFields = [
		["Transfer search question", preamble],
		["Coverage contract", preamble],
		["Selection rule", preamble],
		["Common relational schema", comparisonSection.lines],
		["Non-common structure", comparisonSection.lines],
		["Retrieval-only cues", comparisonSection.lines],
		["Single-donor limit", comparisonSection.lines],
		["Known", knowledgeSection.lines],
		["Uncertain", knowledgeSection.lines],
		["Disputed", knowledgeSection.lines],
		["Missing", knowledgeSection.lines],
		["Handoff", handoffSection.lines],
	] satisfies ReadonlyArray<readonly [string, readonly string[]]>;
	const values = new Map<string, string>();
	for (const [index, [label, fieldLines]] of requiredFields.entries()) {
		const value = readField(fieldLines, label);
		const id = `D${index + 1}`;
		if (value === undefined) {
			report(id, "MISSING", `${label}: required field not found`);
		} else if (placeholder(value)) {
			report(id, "FAIL", `${label}: value is blank or a placeholder`);
		} else {
			values.set(label, value);
			report(id, "PASS", `${label}: present`);
		}
	}

	const selection = values.get("Selection rule") ?? "";
	if (
		!/(?:relation|relationship|constraint|関係|制約)/i.test(selection) ||
		!/(?:\bnot\b|rather than|reject|instead of|ではなく|除外|拒否)/i.test(
			selection,
		) ||
		!/(?:surface|object name|vocabular|terminology|distance|表層|名称|語彙|距離)/i.test(
			selection,
		)
	) {
		report(
			"D14",
			"FAIL",
			"selection rule must privilege relations and reject surface-only matching",
		);
	} else {
		report(
			"D14",
			"PASS",
			"selection rule separates retrieval cues from relation fit",
		);
	}

	const table = donorRecords(donorSection.lines);
	for (const finding of table.findings) report("D15", "FAIL", finding);
	if (table.findings.length === 0) {
		report("D15", "PASS", `${table.records.length} donor records parsed`);
	}

	const ids = new Set<string>();
	const evidenceUnits = new Set<string>();
	for (const record of table.records) {
		if (!stableDonorId(record.id)) {
			report(
				"D16",
				"FAIL",
				`Donor ID must be a stable identifier: ${record.id}`,
			);
		}
		if (ids.has(record.id)) {
			report("D16", "FAIL", `duplicate donor ID: ${record.id}`);
		}
		ids.add(record.id);
		const evidenceKey = record.locator.trim().toLowerCase();
		if (evidenceUnits.has(evidenceKey)) {
			report(
				"D17",
				"FAIL",
				"donor IDs must resolve to distinct donor evidence units",
			);
		}
		evidenceUnits.add(evidenceKey);
		if (!located(record.locator)) {
			report(
				"D18",
				"FAIL",
				`donor relation requires a source locator: ${record.id}`,
			);
		}
		if (
			record.relation.length < 16 ||
			record.scope.length < 8 ||
			record.preconditions.length < 8 ||
			record.boundary.length < 8
		) {
			report(
				"D19",
				"FAIL",
				`donor relation requires a source-located relation and scope: ${record.id}`,
			);
		}
	}
	if (table.records.length > 0 && ids.size === table.records.length) {
		report("D16", "PASS", "donor IDs are unique");
	}
	if (table.records.length > 0 && evidenceUnits.size === table.records.length) {
		report("D17", "PASS", "donor evidence units are distinct");
	}

	const singleLimit = values.get("Single-donor limit") ?? "";
	const commonSchema = values.get("Common relational schema") ?? "";
	if (table.records.length === 1) {
		const bounded =
			/^SINGLE-DONOR LIMIT\s*(?:—|–|:|\s-\s)/.test(singleLimit) &&
			/hypothesis seed/i.test(singleLimit) &&
			/no abstract schema|not (?:an? )?schema/i.test(singleLimit) &&
			/no(?: [^;,.]+)? target transport|target transport.*not established/i.test(
				singleLimit,
			) &&
			/^HYPOTHESIS SEED\s*(?:—|–|:|\s-\s)/.test(commonSchema);
		if (!bounded) {
			report(
				"D20",
				"FAIL",
				"single-donor DONOR SET requires an explicit non-generalization limit",
			);
		} else {
			report(
				"D20",
				"WARN",
				"single-donor limit retained; hypothesis seed only",
			);
		}
	} else if (
		table.records.length >= 2 &&
		!/^NONE\s*(?:—|–|:|\s-\s).*(?:two|2|distinct|compared|複数|比較)/i.test(
			singleLimit,
		)
	) {
		report(
			"D20",
			"FAIL",
			"multi-donor DONOR SET must state why the single-donor limit does not apply",
		);
	} else if (table.records.length >= 2) {
		report("D20", "PASS", "multiple donor evidence units compared");
	}

	const targetMappingField = lines.some(
		(line) =>
			fieldPattern("Target mapping").test(line) ||
			fieldPattern("Target relation").test(line) ||
			fieldPattern("Target correspondence").test(line) ||
			fieldPattern("Correspondence map").test(line) ||
			fieldPattern("Attempted correspondence").test(line) ||
			fieldPattern("Target prediction").test(line) ||
			fieldPattern("Target-side prediction").test(line) ||
			fieldPattern("Thesis claim").test(line) ||
			fieldPattern("Target thesis").test(line),
	);
	const targetLeaks = lines.flatMap((line, index) =>
		positiveTargetLeaks(line).map((kind) => ({
			kind,
			line: index + lineOffset,
		})),
	);
	const mappingLeak = targetLeaks.some(
		(leak) =>
			leak.kind === "mapping" ||
			leak.kind === "prediction" ||
			leak.kind === "thesis",
	);
	if (targetMappingField || mappingLeak) {
		const loci = targetLeaks
			.filter((leak) => leak.kind !== "support")
			.map((leak) => `${leak.kind}@line${leak.line}`)
			.join(", ");
		report(
			"D21",
			"FAIL",
			`DONOR SET ends at donor relation; target mapping belongs to forging-novel-theses, as do target prediction and thesis claims${loci === "" ? "" : ` (${loci})`}`,
		);
	} else {
		report(
			"D21",
			"PASS",
			"DONOR SET contains no target mapping, prediction, or thesis claim",
		);
	}

	const targetSupport = lines.some(
		(line) =>
			fieldPattern("Target support").test(line) ||
			fieldPattern("Target-side support").test(line) ||
			fieldPattern("Target-side evidence").test(line) ||
			fieldPattern("Target evidence").test(line),
	);
	const supportLeak = targetLeaks.some((leak) => leak.kind === "support");
	if (targetSupport || supportLeak) {
		report(
			"D22",
			"FAIL",
			"source-side success cannot establish target-side support",
		);
	} else {
		report("D22", "PASS", "target-side support is not asserted in DONOR SET");
	}

	const handoff = values.get("Handoff") ?? "";
	if (
		!/forging-novel-theses/i.test(handoff) ||
		!/no target mapping/i.test(handoff) ||
		!/no .*target prediction/i.test(handoff) ||
		!/no .*thesis/i.test(handoff) ||
		!/no .*test verdict/i.test(handoff)
	) {
		report(
			"D23",
			"FAIL",
			"handoff must stop before target mapping, prediction, thesis, and test verdict",
		);
	} else {
		report("D23", "PASS", "handoff stops at forging-novel-theses input");
	}

	process.stdout.write("----\n");
	process.stdout.write(
		`DONOR SET: FAIL=${failures} WARN=${warnings} donors=${table.records.length} (structural/mechanical floor only; does not establish schema quality or target fit)\n`,
	);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
	process.stderr.write(
		`FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exit(2);
});
