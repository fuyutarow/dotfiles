import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { cli } from "cleye";
import { jsonText, z } from "../../../hooks/zod.ts";

const BudgetSchema = z.object({ maxListingChars: z.unknown() });

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

let failures = 0;

/**
 * Static name-plus-description character footprint across the directories checked here.
 * This is a conservative collection proxy, not measured per-turn tokens: host selection,
 * truncation, invocation policy and tokenizer behavior can change actual context cost.
 * Reported for collections; gated only with --budget. F4 owns the membership decision.
 */
const listingCost: { name: string; chars: number }[] = [];

function fail(directory: string, message: string): void {
  process.stdout.write(`FAIL ${directory}: ${message}\n`);
  failures += 1;
}

/**
 * --quiet counts readability review signals rather than printing every warning.
 * Warnings are not automatic F1 failures or evidence of bad runtime behavior.
 * The aggregate avoids burying structural failures; FAILs always print.
 * Run without --quiet on a skill to inspect the specific review candidates.
 */
let quiet = false;
const warnedDirs = new Set<string>();
let warnCount = 0;

function warn(directory: string, message: string): void {
  warnCount += 1;
  warnedDirs.add(directory);
  if (!quiet) process.stdout.write(`WARN ${directory}: ${message}\n`);
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
  if (raw !== ">" && raw !== ">-" && raw !== "|" && raw !== "|-") {
    const scalarText = raw.replaceAll('"', "");
    return scalarText === "" ? undefined : scalarText;
  }
  const folded: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (line !== "" && !/^\s/u.test(line)) break;
    folded.push(line.trim());
  }
  const foldedText = folded.join(" ").trim();
  return foldedText === "" ? undefined : foldedText;
}

function listedReferences(lines: string[]): string[] {
  const start = lines.findIndex((line) => line.startsWith("references:"));
  if (start === -1) return [];
  const refs: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^\s*-\s*(.+)$/u);
    if (match?.[1] !== undefined) {
      refs.push(match[1].replaceAll('"', ""));
      continue;
    }
    if (/^\S/u.test(line)) break;
  }
  return refs;
}

// --- PROSE-DEBT floor (WARN-tier only; measurement before enforcement) ---
// Applied to the SKILL.md BODY only. Code-fence interiors, table rows (lines starting
// with `|`), and bare-URL lines are excluded from prose scanning; blockquote markers
// (`> `) are stripped so blockquoted prose still counts. These three checks never FAIL —
// they measure technical-communication debt for later, deliberate enforcement.

const SENTENCE_TERMINATORS = /[。.！？]/u;
const TABLE_SEPARATOR_ROW = /^\|[\s:|-]+\|?$/u;
const VERSION_HEADER_START = /^>\s*\*\*Version\*\*/u;
const URL_ONLY_LINE = /^[<(]?https?:\/\/\S+[)>.,;:]?$/u;

function isFenceMarker(line: string): boolean {
  return line.trim().startsWith("```");
}

function stripBlockquoteMarker(line: string): string {
  return line.replace(/^\s*(?:>\s?)+/u, "");
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
      if (trimmed !== "" && Array.from(trimmed).length > 120) longCount += 1;
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
    // No try/catch (audited *.ts ban): Promise.try turns an unreadable-file throw into a
    // rejection this `.then` maps to `undefined`, same as the old catch's `continue`.
    const text: string | null = await Promise.try(() =>
      Bun.file(path).text(),
    ).then(
      (ok) => ok,
      () => null,
    );
    if (text === null) continue; // a directory entry or unreadable file — the mention check already covers absence
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
      "Review clarity and selective loading; use a table when the decision is a keyed lookup",
  );
}

// Version header length — the contiguous block starting at a `> **Version**` line plus
// its continuation lines starting with `>`.
function versionHeaderBlockLengths(bodyLines: string[]): number[] {
  const blocks: number[] = [];
  let index = 0;
  while (index < bodyLines.length) {
    if (!VERSION_HEADER_START.test(bodyLines[index]?.trim() ?? "")) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (
      end < bodyLines.length &&
      bodyLines[end]?.trim().startsWith(">") === true
    )
      end += 1;
    blocks.push(end - index);
    index = end;
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
    longCells += cells.filter(
      (cell) => Array.from(cell.trim()).length > 400,
    ).length;
  }
  return longCells;
}

async function checkDirectory(input: string): Promise<void> {
  const directory = input.replace(/\/$/u, "");
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
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(name)) {
    fail(directory, `name '${name}' violates ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`);
  }
  if (Array.from(name).length > 64)
    fail(
      directory,
      `name '${name}' exceeds 64 chars (${Array.from(name).length})`,
    );
  if (name.includes("--"))
    fail(directory, `name '${name}' has consecutive hyphens`);
  if (/(claude|anthropic)/iu.test(name) && name !== "driving-claude") {
    fail(
      directory,
      `name '${name}' contains a reserved word (claude/anthropic)`,
    );
  }

  const description = scalar(metadata.lines, "description");
  const descriptionLine =
    metadata.lines.find((line) => line.startsWith("description:")) ?? "";
  if (/^description:\s*[^>|'"\s]/u.test(descriptionLine)) {
    warn(
      directory,
      "plain-scalar description — any ': ' inside will break YAML parsing (observed 2026-07-02); use >-",
    );
  }
  if (description !== undefined) {
    listingCost.push({
      name,
      chars: Array.from(name).length + Array.from(description).length,
    });
  }
  if (description === undefined) {
    fail(directory, "description: missing or empty");
  } else if (Array.from(description).length > 1500) {
    warn(
      directory,
      `description ${Array.from(description).length} chars > 1500 (local review threshold; target-host limits owned by operating-the-harness)`,
    );
  }

  const body = lines.slice(metadata.bodyStart).join("\n");
  const referencesDirectory = join(directory, "references");
  if (existsSync(referencesDirectory)) {
    (await readdir(referencesDirectory))
      .filter((entry) => entry.endsWith(".md") && !body.includes(entry))
      .forEach((entry) => {
        fail(
          directory,
          `references/${entry} exists but is never mentioned in SKILL.md`,
        );
      });
  }
  for (const reference of listedReferences(metadata.lines)) {
    const candidates = [
      join(directory, reference),
      join(referencesDirectory, reference),
      join(referencesDirectory, `${reference}.md`),
    ];
    if (!candidates.some((candidate) => existsSync(candidate)))
      fail(
        directory,
        `frontmatter references '${reference}' has no file (references/${reference}.md missing)`,
      );
  }
  const bodyLines =
    metadata.bodyStart === 0 ? 0 : lines.length - metadata.bodyStart;
  if (bodyLines > 500)
    warn(directory, `SKILL.md body ${bodyLines} lines > 500`);

  // Scan references as well as the core so selective-loading detail is not invisible.
  // Report one aggregate warning per skill, naming the largest review candidate.
  // Sentence length is a heuristic; F1 requires review of the useful decision, not zero WARNs.
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
async function reportListingBudget(
  budgetPath: string | undefined,
): Promise<void> {
  if (listingCost.length < 2) return; // a single-skill forge has no collection to weigh
  const total = listingCost.reduce((sum, s) => sum + s.chars, 0);
  process.stdout.write(
    `LISTING ${listingCost.length} skills, ${total} name+description chars (static proxy)\n`,
  );
  if (budgetPath === undefined) return;
  if (!existsSync(budgetPath)) {
    process.stdout.write(`FAIL listing budget: ${budgetPath} does not exist\n`);
    failures += 1;
    return;
  }
  // No try/catch (audited *.ts ban): Promise.try turns a read throw into a rejection this
  // `.then` maps to a tagged error; a JSON syntax error comes back from jsonText as an issue.
  const parsed = await Promise.try(async () => {
    const text = await Bun.file(budgetPath).text();
    const raw = jsonText.safeParse(text);
    if (!raw.success) {
      return { ok: false as const, error: raw.error.issues[0]?.message };
    }
    const budget = BudgetSchema.safeParse(raw.data);
    return {
      ok: true as const,
      value: budget.success ? budget.data.maxListingChars : undefined,
    };
  }).then(
    (ok) => ok,
    (error: unknown) => ({ ok: false as const, error }),
  );
  if (!parsed.ok) {
    process.stdout.write(
      `FAIL listing budget: ${budgetPath} is not readable JSON — ${parsed.error instanceof Error ? parsed.error.message : String(parsed.error)}\n`,
    );
    failures += 1;
    return;
  }
  const max: unknown = parsed.value;
  if (typeof max !== "number") {
    process.stdout.write(
      `FAIL listing budget: ${budgetPath} has no numeric maxListingChars\n`,
    );
    failures += 1;
    return;
  }
  if (total > max) {
    const worst = [...listingCost]
      .toSorted((a, b) => b.chars - a.chars)
      .slice(0, 3);
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
      flags: {
        budget: { type: String },
        quiet: {
          type: Boolean,
          description:
            "count WARNs instead of printing them; FAILs always print",
        },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  quiet = parsed.flags.quiet === true;
  const directories = parsed._;
  for (const directory of directories.length === 0
    ? [process.cwd()]
    : directories)
    await checkDirectory(directory);
  await reportListingBudget(parsed.flags.budget);
  if (quiet && warnCount > 0) {
    process.stdout.write(
      `WARN ${warnCount} prose-debt warning(s) across ${warnedDirs.size} skill(s), not listed (--quiet); ` +
        `run skill-check.ts on one skill to see its list\n`,
    );
  }
  process.exit(failures === 0 ? 0 : 1);
}

await main().catch((error) => {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
});
