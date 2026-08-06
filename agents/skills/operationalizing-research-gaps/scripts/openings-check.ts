/**
 * openings-check.ts — mechanical floor over an OPENINGS SHEET.
 *
 * THIS IS NOT A SEMANTIC CHECK. It verifies shape only: required header tokens, row typing,
 * presence of the cells each row type must carry, ISO expiry dates, the tail cap, and the absence
 * of ranking fields. It CANNOT tell whether a RETIRED-BY observation is actually discriminating,
 * whether an anchor really resolves, whether a referee is sequestered, whether a NON-ADJACENCY row
 * smuggles a relation into its prose, or whether the burial declaration is honest. Those are the
 * semantic gates O1-O5 in SKILL.md and they are the editor's, not this script's.
 *
 * Usage: bun scripts/openings-check.ts <sheet.md> [more.md ...]
 * Exit 0 = shape floor passed. Exit 1 = at least one FAIL. Exit 2 = usage/environment failure.
 */

import { cli } from "cleye";

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

const ROW_TYPES = new Set(["GAP", "CONTRADICTION", "NON-ADJACENCY", "TASK"]);
const REASONS = new Set(["INSUFFICIENT", "INCONSISTENT", "BIASED", "WRONG-QUESTION"]);
const HEADER_TOKENS = [
  "SOURCE POSITION:",
  "COVERAGE:",
  "AUTHORITY: NONE",
  "CYCLE:",
  "RETIREMENT THRESHOLD:",
  "BURIED:",
];
const FORBIDDEN_KEYS = ["PRIORITY", "RANK", "SCORE", "WEIGHT"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Row = { id: string; type: string; line: number; cells: Map<string, string> };

function parseRows(text: string): { rows: Row[]; headerText: string } {
  const lines = text.split("\n");
  const rows: Row[] = [];
  let current: Row | null = null;
  let currentKey: string | null = null;
  let headerEnd = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const rowHeader = /^###\s+(\S+)\s+[·|]\s+(.+?)\s*$/.exec(line);
    if (rowHeader) {
      if (headerEnd === lines.length) headerEnd = i;
      current = { id: rowHeader[1]!, type: rowHeader[2]!, line: i + 1, cells: new Map() };
      currentKey = null;
      rows.push(current);
      continue;
    }
    if (/^##\s/.test(line)) {
      current = null;
      currentKey = null;
      continue;
    }
    if (!current) continue;
    const cell = /^([A-Z][A-Z0-9-]*(?:\s[A-Z][A-Z0-9-]*)*):\s*(.*)$/.exec(line);
    if (cell) {
      currentKey = cell[1]!;
      current.cells.set(currentKey, (cell[2] ?? "").trim());
      continue;
    }
    if (currentKey && /^\s+\S/.test(line)) {
      const prev = current.cells.get(currentKey) ?? "";
      current.cells.set(currentKey, `${prev} ${line.trim()}`.trim());
    }
  }
  return { rows, headerText: lines.slice(0, headerEnd).join("\n") };
}

function checkFile(path: string, text: string): string[] {
  const findings: string[] = [];
  const fail = (msg: string) => findings.push(`FAIL ${path}: ${msg}`);
  const { rows, headerText } = parseRows(text);

  for (const token of HEADER_TOKENS) {
    if (!headerText.includes(token)) fail(`sheet header is missing the literal token "${token}"`);
  }

  for (const key of FORBIDDEN_KEYS) {
    const re = new RegExp(`^\\s*${key}:`, "m");
    if (re.test(text)) fail(`forbidden ranking field "${key}:" — openings are never ranked or scored`);
  }

  if (rows.length === 0) fail("no rows found; a row header looks like '### OPN-001 · GAP'");

  const counts: Record<string, number> = { GAP: 0, CONTRADICTION: 0, "NON-ADJACENCY": 0, TASK: 0 };
  const seen = new Set<string>();

  for (const row of rows) {
    const at = `row ${row.id} (line ${row.line})`;
    if (seen.has(row.id)) fail(`${at}: duplicate row id`);
    seen.add(row.id);

    if (!ROW_TYPES.has(row.type)) {
      fail(`${at}: type "${row.type}" is not one of ${[...ROW_TYPES].join(", ")}`);
      continue;
    }
    counts[row.type] = (counts[row.type] ?? 0) + 1;

    for (const required of ["ANCHOR", "BODY", "RETIRED-BY", "TO", "EXPIRES"]) {
      if (!(row.cells.get(required) ?? "")) fail(`${at}: missing or empty ${required}:`);
    }

    const expires = row.cells.get("EXPIRES") ?? "";
    if (expires && !ISO_DATE.test(expires)) fail(`${at}: EXPIRES "${expires}" is not an ISO date`);

    if (row.type === "NON-ADJACENCY") {
      if (!(row.cells.get("MECHANISM") ?? "")) fail(`${at}: NON-ADJACENCY needs MECHANISM:`);
      if (row.cells.has("RELATION")) {
        fail(`${at}: NON-ADJACENCY must not carry RELATION: — a relation is a thesis, not an opening`);
      }
    } else {
      const reason = row.cells.get("REASON") ?? "";
      if (!reason) fail(`${at}: missing REASON:`);
      else if (!REASONS.has(reason)) fail(`${at}: REASON "${reason}" not in ${[...REASONS].join(", ")}`);
    }

    if (row.type === "TASK") {
      const referee = row.cells.get("REFEREE") ?? "";
      if (!referee) fail(`${at}: TASK needs REFEREE:`);
      else if (!referee.includes("threshold=")) fail(`${at}: REFEREE has no fixed "threshold="`);
    }
  }

  const tail = counts["NON-ADJACENCY"] ?? 0;
  const core = (counts.GAP ?? 0) + (counts.TASK ?? 0);
  if (tail > core) {
    fail(`tail cap: ${tail} NON-ADJACENCY rows exceed ${core} GAP+TASK rows — bind more observations`);
  }
  return findings;
}

// Spread positional: several sheets in one pass is the deliberate shape (a cycle reviews the
// whole set), so excess arguments are accepted rather than refused.
const main = async (): Promise<void> => {
  const parsed = cli(
    {
      name: "openings-check.ts",
      parameters: ["<sheet>", "[moreSheets...]"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  const paths = [parsed._.sheet, ...parsed._.moreSheets];

  let failed = false;
  for (const path of paths) {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      process.stderr.write(`FAIL ${path}: file not found\n`);
      failed = true;
      continue;
    }
    const findings = checkFile(path, await file.text());
    for (const finding of findings) process.stderr.write(`${finding}\n`);
    if (findings.length > 0) failed = true;
  }

  process.stdout.write(
    failed ? "RESULT: FAIL\n" : `RESULT: PASS sheets=${paths.length}\n`,
  );
  process.exitCode = failed ? 1 : 0;
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`FATAL: openings-check: ${message}\n`);
  process.exitCode = 2;
});
