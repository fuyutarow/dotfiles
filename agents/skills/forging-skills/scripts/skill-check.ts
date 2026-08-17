import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { cli } from "cleye";

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

let failures = 0;

/**
 * Per-skill listing cost, accumulated across every directory this run checked. The name and the
 * description are what the harness injects into EVERY turn, for every installed skill — so the
 * quantity a collection actually spends is this sum, and no per-skill cap can bound it. A cap
 * with no total is why 13 of this repo's descriptions sat within 12 chars of the 1500 limit:
 * everyone spends their full allowance. Reported always; gated only with --budget.
 */
const listingCost: { name: string; chars: number }[] = [];

function fail(directory: string, message: string): void {
  process.stdout.write(`FAIL ${directory}: ${message}\n`);
  failures += 1;
}

function warn(directory: string, message: string): void {
  process.stdout.write(`WARN ${directory}: ${message}\n`);
}

function frontmatter(lines: string[]): { lines: string[]; bodyStart: number } {
  if (lines[0]?.trim() !== "---") return { lines: [], bodyStart: 0 };
  const end = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---",
  );
  return end === -1
    ? { lines: [], bodyStart: 0 }
    : { lines: lines.slice(1, end), bodyStart: end + 1 };
}

function scalar(lines: string[], key: string): string | undefined {
  const index = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (index === -1) return undefined;
  const raw = lines[index]?.slice(key.length + 1).trim() ?? "";
  if (raw !== ">" && raw !== ">-" && raw !== "|" && raw !== "|-")
    return raw.replaceAll('"', "") || undefined;
  const folded: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (line !== "" && !/^\s/.test(line)) break;
    folded.push(line.trim());
  }
  return folded.join(" ").trim() || undefined;
}

function listedReferences(lines: string[]): string[] {
  const start = lines.findIndex((line) => line.startsWith("references:"));
  if (start === -1) return [];
  const refs: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^\s*-\s*(.+)$/);
    if (match?.[1] !== undefined) {
      refs.push(match[1].replaceAll('"', ""));
      continue;
    }
    if (/^\S/.test(line)) break;
  }
  return refs;
}

// --- PROSE-DEBT floor (WARN-tier only; measurement before enforcement) ---
// Applied to the SKILL.md BODY only. Code-fence interiors, table rows (lines starting
// with `|`), and bare-URL lines are excluded from prose scanning; blockquote markers
// (`> `) are stripped so blockquoted prose still counts. These three checks never FAIL —
// they measure technical-communication debt for later, deliberate enforcement.

const SENTENCE_TERMINATORS = /[。.！？]/;
const TABLE_SEPARATOR_ROW = /^\|[\s:|-]+\|?$/;
const VERSION_HEADER_START = /^>\s*\*\*Version\*\*/;
const URL_ONLY_LINE = /^[<(]?https?:\/\/\S+[)>.,;:]?$/;

function isFenceMarker(line: string): boolean {
  return line.trim().startsWith("```");
}

function stripBlockquoteMarker(line: string): string {
  return line.replace(/^\s*(?:>\s?)+/, "");
}

// Prose sentence length — paragraph-joins consecutive prose lines (broken by blank
// lines, table rows, and code fences) then splits on 。/./！/？, counting segments
// whose trimmed length exceeds 120 chars.
function countLongProseSentences(bodyLines: string[]): number {
  let inFence = false;
  let paragraph: string[] = [];
  let longCount = 0;

  const flush = (): void => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(" ");
    paragraph = [];
    for (const segment of text.split(SENTENCE_TERMINATORS)) {
      const trimmed = segment.trim();
      if (trimmed !== "" && [...trimmed].length > 120) longCount += 1;
    }
  };

  for (const raw of bodyLines) {
    if (isFenceMarker(raw)) {
      inFence = !inFence;
      flush();
      continue;
    }
    if (inFence) continue;
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("|")) {
      flush();
      continue;
    }
    const stripped = stripBlockquoteMarker(raw).trim();
    if (stripped === "" || URL_ONLY_LINE.test(stripped)) {
      flush();
      continue;
    }
    paragraph.push(stripped);
  }
  flush();
  return longCount;
}

/**
 * Prose debt across references/, aggregated. The per-file worst offender is named because that is
 * the actionable half — "this skill has 210 long sentences" tells an editor nothing about where to
 * start, and a rule an editor cannot act on is decoration.
 */
async function reportReferenceProse(directory: string): Promise<void> {
  const dir = join(directory, "references");
  if (!existsSync(dir)) return;
  let total = 0;
  let worstFile = "";
  let worstCount = 0;
  let files = 0;
  for (const entry of await readdir(dir, { recursive: true })) {
    if (!entry.endsWith(".md")) continue;
    const path = join(dir, entry);
    let text: string;
    try {
      text = await Bun.file(path).text();
    } catch {
      continue; // a directory entry or unreadable file — the mention check already covers absence
    }
    files += 1;
    const count = countLongProseSentences(text.split("\n"));
    total += count;
    if (count > worstCount) {
      worstCount = count;
      worstFile = entry;
    }
  }
  if (total === 0) return;
  warn(
    directory,
    `references: ${total} prose sentences >120 chars across ${files} file(s) — worst ${worstFile} (${worstCount}). ` +
      "A decision keyed on 2+ inputs belongs in a table; the argument for it belongs in the ledger",
  );
}

// Version header length — the contiguous block starting at a `> **Version**` line plus
// its continuation lines starting with `>`.
function versionHeaderBlockLengths(bodyLines: string[]): number[] {
  const blocks: number[] = [];
  let index = 0;
  while (index < bodyLines.length) {
    if (VERSION_HEADER_START.test(bodyLines[index]?.trim() ?? "")) {
      let end = index + 1;
      while (end < bodyLines.length && bodyLines[end]?.trim().startsWith(">"))
        end += 1;
      blocks.push(end - index);
      index = end;
    } else {
      index += 1;
    }
  }
  return blocks;
}

// Rule-cell narrative — table cells (text between `|` delimiters, separator rows
// excluded) longer than 400 chars.
function countLongTableCells(bodyLines: string[]): number {
  let inFence = false;
  let longCells = 0;
  for (const raw of bodyLines) {
    if (isFenceMarker(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const trimmed = raw.trim();
    if (!trimmed.startsWith("|") || TABLE_SEPARATOR_ROW.test(trimmed)) continue;
    let cells = trimmed.split("|");
    if (trimmed.startsWith("|")) cells = cells.slice(1);
    if (trimmed.endsWith("|")) cells = cells.slice(0, -1);
    for (const cell of cells) {
      if ([...cell.trim()].length > 400) longCells += 1;
    }
  }
  return longCells;
}

async function checkDirectory(input: string): Promise<void> {
  const directory = input.replace(/\/$/, "");
  const skillPath = join(directory, "SKILL.md");
  if (!existsSync(skillPath)) {
    fail(directory, "SKILL.md missing");
    return;
  }
  const source = await Bun.file(skillPath).text();
  const lines = source.split("\n");
  const metadata = frontmatter(lines);
  if (metadata.lines.length === 0)
    warn(directory, "no YAML frontmatter (body loads with empty metadata)");

  const directoryName = basename(resolve(directory));
  const name = scalar(metadata.lines, "name") ?? directoryName;
  if (name !== directoryName && scalar(metadata.lines, "name") !== undefined) {
    fail(
      directory,
      `frontmatter name '${name}' != dir basename '${directoryName}'`,
    );
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)) {
    fail(directory, `name '${name}' violates ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`);
  }
  if ([...name].length > 64)
    fail(directory, `name '${name}' exceeds 64 chars (${[...name].length})`);
  if (name.includes("--"))
    fail(directory, `name '${name}' has consecutive hyphens`);
  if (/(claude|anthropic)/i.test(name) && name !== "driving-claude") {
    fail(
      directory,
      `name '${name}' contains a reserved word (claude/anthropic)`,
    );
  }

  const description = scalar(metadata.lines, "description");
  const descriptionLine =
    metadata.lines.find((line) => line.startsWith("description:")) ?? "";
  if (/^description:\s*[^>|\s]/.test(descriptionLine)) {
    warn(
      directory,
      "plain-scalar description — any ': ' inside will break YAML parsing (observed 2026-07-02); use >-",
    );
  }
  if (description !== undefined) {
    listingCost.push({
      name,
      chars: [...name].length + [...description].length,
    });
  }
  if (description === undefined) {
    fail(directory, "description: missing or empty");
  } else if ([...description].length > 1500) {
    warn(
      directory,
      `description ${[...description].length} chars > 1500 (platform hard cap 1024 for API skills; listing cap owned by operating-the-harness)`,
    );
  }

  const body = lines.slice(metadata.bodyStart).join("\n");
  const referencesDirectory = join(directory, "references");
  if (existsSync(referencesDirectory)) {
    for (const entry of await readdir(referencesDirectory)) {
      if (entry.endsWith(".md") && !body.includes(entry))
        fail(
          directory,
          `references/${entry} exists but is never mentioned in SKILL.md`,
        );
    }
  }
  for (const reference of listedReferences(metadata.lines)) {
    const candidates = [
      join(directory, reference),
      join(referencesDirectory, reference),
      join(referencesDirectory, `${reference}.md`),
    ];
    if (!candidates.some(existsSync))
      fail(
        directory,
        `frontmatter references '${reference}' has no file (references/${reference}.md missing)`,
      );
  }
  const bodyLines =
    metadata.bodyStart === 0 ? 0 : lines.length - metadata.bodyStart;
  if (bodyLines > 500)
    warn(directory, `SKILL.md body ${bodyLines} lines > 500`);

  // References were UNMEASURED until 2026-08-17: this function only ever read SKILL.md, while
  // 80% of the corpus by character count lives under references/ (3.34M vs 853K chars over 60
  // skills). F1's exit condition is "prose-debt WARNs 0", so a skill could pass it with
  // unreadable references — and one did, which is how a 27-line argument shipped where a 4-row
  // lookup table belonged. Reported as ONE aggregate line per skill naming the worst file, not
  // per sentence: sixty readable lines beat a flood nobody reads, which is the same failure this
  // check exists to catch.
  await reportReferenceProse(directory);

  const bodyContentLines = lines.slice(metadata.bodyStart);

  const longSentences = countLongProseSentences(bodyContentLines);
  if (longSentences >= 3) {
    warn(
      directory,
      `${longSentences} prose sentences >120 chars (technical-communication debt)`,
    );
  }

  for (const blockLength of versionHeaderBlockLengths(bodyContentLines)) {
    if (blockLength > 3) {
      warn(
        directory,
        `version header ${blockLength} lines >3 — history belongs in the ledger`,
      );
    }
  }

  const longTableCells = countLongTableCells(bodyContentLines);
  if (longTableCells > 0) {
    warn(
      directory,
      `${longTableCells} table cells >400 chars — inline narratives belong in the ledger (pointer + date in the cell)`,
    );
  }
}

/**
 * F4 STANDING, mechanical half. Reports what the checked collection charges every turn, and — only
 * when a budget file is named — refuses growth past the declared ceiling.
 *
 * The ceiling is a RATCHET, not an estimate of what the platform can afford: nobody here has a
 * verified number for that. Its whole job is to make growth a deliberate, reviewable act instead
 * of a sum nobody watches. Lowering it costs nothing. Raising it means editing the declared number
 * in the same commit as the skill that needed the room, which puts the trade in the diff where a
 * human sees it. The judgment the number cannot make — retire, merge, or pay — belongs to the
 * skill, not here. No budget file → report only, so the check stays portable to other repos.
 */
async function reportListingBudget(budgetPath: string | undefined): Promise<void> {
  if (listingCost.length < 2) return; // a single-skill forge has no collection to weigh
  const total = listingCost.reduce((sum, s) => sum + s.chars, 0);
  process.stdout.write(
    `LISTING ${listingCost.length} skills, ${total} chars charged per turn\n`,
  );
  if (budgetPath === undefined) return;
  if (!existsSync(budgetPath)) {
    process.stdout.write(`FAIL listing budget: ${budgetPath} does not exist\n`);
    failures += 1;
    return;
  }
  let max: unknown;
  try {
    max = JSON.parse(await Bun.file(budgetPath).text())?.maxListingChars;
  } catch (error) {
    process.stdout.write(
      `FAIL listing budget: ${budgetPath} is not readable JSON — ${error instanceof Error ? error.message : String(error)}\n`,
    );
    failures += 1;
    return;
  }
  if (typeof max !== "number") {
    process.stdout.write(
      `FAIL listing budget: ${budgetPath} has no numeric maxListingChars\n`,
    );
    failures += 1;
    return;
  }
  if (total > max) {
    const worst = [...listingCost].sort((a, b) => b.chars - a.chars).slice(0, 3);
    process.stdout.write(
      `FAIL listing budget: ${total} chars > ${max} declared in ${budgetPath}. ` +
        "Retire a skill, merge two, shorten a description, or raise the ceiling in this same " +
        `commit and say why. Largest: ${worst.map((s) => `${s.name} ${s.chars}`).join(", ")}\n`,
    );
    failures += 1;
  }
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "skill-check.ts",
      parameters: ["[directories...]"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      flags: { budget: { type: String } },
    },
    undefined,
    Bun.argv.slice(2),
  );
  const directories = parsed._;
  for (const directory of directories.length === 0
    ? [process.cwd()]
    : directories)
    await checkDirectory(directory);
  await reportListingBudget(parsed.flags.budget);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
});
