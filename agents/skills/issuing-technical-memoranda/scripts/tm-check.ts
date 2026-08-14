/**
 * tm-check — the mechanical floor for a technical memorandum's WRAPPER.
 *
 * THIS IS NOT A SEMANTIC CHECK. It cannot tell you the abstract is wrong, that `to:` is missing
 * the one person who needed it, that `authority: personal` was the wrong call, or that the body
 * is unfinished in a way that matters. It checks that the four regulated things (cover, authority,
 * addressee, release) are PRESENT and well-formed. Meaning stays with the gates in SKILL.md.
 *
 * Structural problems FAIL. Prose problems WARN — a floor that rewrites sentences deforms
 * documents, so the WARN tier is measurement and its enforcement moment is gate T1.
 *
 * Usage: bun scripts/tm-check.ts <file.md> [more.md ...]
 */

import { cli } from "cleye";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED = ["tm", "title", "date", "author", "authority", "release", "to"] as const;

type Front = Record<string, unknown>;

const asRecord = (v: unknown): Front | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Front) : null;

const splitFrontmatter = (text: string): [Front | null, string] => {
  if (!text.startsWith("---\n")) return [null, text];
  const end = text.indexOf("\n---", 3);
  if (end === -1) return [null, text];
  const body = text.slice(text.indexOf("\n", end + 1) + 1);
  try {
    return [asRecord(Bun.YAML.parse(text.slice(4, end + 1))), body];
  } catch {
    return [null, body];
  }
};

const nonEmpty = (v: unknown): boolean =>
  Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim().length > 0 : v != null;

/**
 * The fabrication guard, in greppable form (SKILL.md "NEVER"). A draft that calls some body
 * skeleton "the standard technical-memorandum format" is asserting a norm no primary source
 * establishes.
 *
 * Word ORDER is not required — an earlier version demanded qualifier→genre→noun and was evaded by
 * the natural Japanese order (テクニカルメモの標準形式) and by any attribution word outside its
 * five-word list. This version tests three independent signals on the same line, order-free.
 * Lines that explicitly DENY the standard, or that label the shape as the author's own choice,
 * are exempt — that is the correct way to talk about it.
 */
const GENRE =
  /\b(technical\s+memorand(um|a)|technical\s+memos?|\bTMs?\b)\b|テクニカルメモ|技術メモ|技術文書|社内文書|メモランダム|覚書/i;
const FORM =
  /\b(format|structure|template|sections?|layout|skeleton|outline)\b|形式|書式|様式|構成|テンプレート|章立て|節構成/i;
const ATTRIBUTION =
  /\b(standard|canonical|official|traditional|classic|conventional(ly)?|customar(y|ily)|typical(ly)?|usual(ly)?|always|invariably|historically|prescribed|mandated|the\s+norm|by\s+convention|follows?\s+the)\b|標準|正式|公式|伝統的|古典的|定番|通例|慣例|一般的|決まって|とされて/i;

/** The two section triads this genre is repeatedly and wrongly credited with. */
const RETRO_TRIAD = [
  /(background|背景)[^\n]{0,40}(hypothes[ei]s|仮説)[^\n]{0,40}(data|データ)[^\n]{0,40}(conclusion|結論)/i,
  /(observed\s+facts?|観察[^\n]{0,6}事実)[^\n]{0,50}(working\s+model|作業モデル)[^\n]{0,50}(speculation|推測)/i,
];

const EXEMPT =
  /no primary source|not a standard|isn't a standard|retro-attribut|my own call|my call for this|標準では?ない|一次資料は?(無|な)い|自分の判断|独自の/i;

// Argv goes through Cleye rather than being read raw: it is what gives this script `--help`,
// rejection of a typo'd flag before any file is opened, and the house floor's BG1 boundary.
// The parameter is declared as a SPREAD because extra positionals are the point here — every
// one of them is another memorandum to check, so there is no "excess" to refuse.
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

// Only argv parsing can throw here, and a usage error is not a memorandum defect: it exits 2, so
// a caller can tell "you invoked me wrong" from "the document failed the floor" (exit 1).
// Cleye handles an ordinary unknown flag itself, exiting 1 from inside the framework.
function parseArgv() {
  try {
    return cli(
      {
        name: "tm-check.ts",
        strictFlags: true,
        ignoreArgv: rejectPrototypeFlag,
        parameters: ["[files...]"],
        help: {
          description:
            "Structural floor for a technical memorandum's wrapper: cover, authority, addressee, release.",
        },
      },
      undefined,
      Bun.argv.slice(2),
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(2);
  }
}

const files: string[] = parseArgv()._.files;
if (!files.length) {
  console.error("usage: bun scripts/tm-check.ts <file.md> [...]");
  process.exit(2);
}

let fails = 0;
let warns = 0;
const say = (kind: "FAIL" | "WARN", where: string, msg: string) => {
  if (kind === "FAIL") fails++;
  else warns++;
  console.log(`${kind} [${where}] ${msg}`);
};

for (const path of files) {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    say("FAIL", path, "no such file");
    continue;
  }
  const text = await file.text();
  const [front, body] = splitFrontmatter(text);

  // ---------------------------------------------------------------- T1 COVER
  if (!front) {
    say("FAIL", path, "no parseable cover block; a memorandum opens with YAML front matter (T1)");
    continue;
  }
  for (const key of REQUIRED) {
    if (!nonEmpty(front[key]))
      say("FAIL", path, `cover key '${key}' is missing or empty (T1)`);
  }
  if (typeof front.date === "string" && !ISO_DATE.test(front.date))
    say("FAIL", path, `date '${front.date}' is not YYYY-MM-DD (T1)`);
  if (typeof front.tm === "string" && /\s/.test(front.tm))
    say("FAIL", path, "the stable id 'tm' must not contain whitespace; it is a citation key (T1)");

  // author must carry a reachable contact, not just a name
  if (typeof front.author === "string" && !/[@\/]|ext\.?\s*\d|#[\w-]/i.test(front.author))
    say("WARN", path, "'author' carries no reachable contact (mail, handle, channel, extension) (T1)");

  if (!nonEmpty(front.size))
    say("WARN", path, "'size' absent: the reader's cost estimate is missing. Fill it or drop the key deliberately (T1)");

  // ------------------------------------------------------------ T2 AUTHORITY
  const authority = String(front.authority ?? "");
  if (authority && !/^personal$/.test(authority) && !/^organizational:\s*\S/.test(authority))
    say(
      "FAIL",
      path,
      `authority '${authority}' is neither 'personal' nor 'organizational:<named signer>' (T2)`,
    );

  // ------------------------------------------------ T3 ADDRESSEE and RELEASE
  const release = String(front.release ?? "");
  if (release && !/^internal$/.test(release) && !/^cleared:\s*\S+\/\S+\/\d{4}-\d{2}-\d{2}$/.test(release))
    say(
      "FAIL",
      path,
      `release '${release}' is neither 'internal' nor 'cleared:<scope>/<approver>/<YYYY-MM-DD>' (T3)`,
    );

  // cover-only recipients need a stated pull path, or they are a dead end
  if (nonEmpty(front.cc) && !/\bcc\b[^\n]*full text|full text[^\n]*\b(request|ask|reply|link)/i.test(body))
    say("WARN", path, "'cc' lists cover-only recipients but the body states no path to the full text (T3)");

  // ------------------------------------------------------------ abstract
  // `$(?![\s\S])` is end-of-input under the `m` flag, where a bare `$` would only mean end-of-line.
  const abstract = /^##\s+Abstract\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/im.exec(body);
  if (!abstract || !abstract[1] || abstract[1].trim().length === 0)
    say("FAIL", path, "no non-empty '## Abstract' section; the cover must be readable alone (T1)");
  else if (abstract[1].trim().split(/\s+/).length > 220)
    say("WARN", path, "abstract exceeds ~220 words; it is a scanning surface, not a summary (T1)");

  // ------------------------------------------------- the fabrication guard
  body.split("\n").forEach((line, i) => {
    if (EXEMPT.test(line)) return;
    if (GENRE.test(line) && FORM.test(line) && ATTRIBUTION.test(line))
      say(
        "WARN",
        `${path}:${i + 1}`,
        "asserts a standard body format for this genre; no primary source defines one (SKILL.md NEVER)",
      );
    else if (RETRO_TRIAD.some((re) => re.test(line)))
      say(
        "WARN",
        `${path}:${i + 1}`,
        "uses a section triad this genre is retro-credited with; label it as your own choice (SKILL.md NEVER)",
      );
  });
}

console.log(`\nFAIL=${fails} WARN=${warns}`);
process.exit(fails ? 1 : 0);
