/**
 * hypothesis-check — the greppable floor for a HYPOTHESIS packet.
 *
 * THIS IS NOT A SEMANTIC CHECK. It cannot tell you whether the foil was well chosen, whether the
 * closed-vocabulary attempt was serious, whether the hypothesis is any good, or whether the
 * discriminator is obtainable. It checks that each gate's ROW EXISTS, is well-formed, and that the
 * three branch rows agree. A packet that passes can still be worthless; one that fails is not yet
 * a packet.
 *
 * Deliberately NOT checked, and why: the skill's LAW says deciding whether a new term is NEEDED is
 * undecidable (references/gates.md, A3). A floor that tried to certify necessity would be
 * asserting what no procedure can compute. So SUCCEEDED, EXHAUSTED and NOT-EXHAUSTED are all
 * accepted here; which one is honest is a reader's call.
 *
 * Also deliberate: the branch checks are ASYMMETRIC. Claiming MORE than the rows support is caught
 * (LICENSED with nothing introduced, LICENSED on a route that SUCCEEDED). Claiming LESS is not — a
 * writer may self-declare NO-LICENSE on a fully-paid packet, because the reason to downgrade is a
 * judgement the floor cannot see. Forcing LICENSED would be the floor certifying necessity.
 *
 * Usage: bun scripts/hypothesis-check.ts <packet.md> [...]
 *        bun scripts/hypothesis-check.ts --self-test
 */

import { cli } from "cleye";

const ROWS = [
  "Anomaly", "Contrast", "Contrast source", "Supplied", "Closed route", "Hypothesis", "Hole type",
  "Introduction type", "Introduced terms", "Discriminator", "Kill condition",
  "Minimality claim", "Status", "Handoff",
] as const;

const CONTRAST_SOURCE = new Set(["OBSERVED", "PREDICTED-BY-ACCOUNT", "CHOSEN"]);
const HOLE_TYPE = new Set(["THEORY", "OBSERVATION", "UNDECIDED"]);
const INTRO_TYPE = new Set([
  "NONE", "COMMON-CAUSE", "TRANSFER", "NEW-PREDICATE", "EXPANSIVE-PARTITION",
]);
const MINIMALITY = new Set(["NONE", "LOCAL", "GLOBAL"]);
const STATUS = new Set(["CLOSED-VOCABULARY", "LICENSED", "NO-LICENSE"]);
const CLOSED_ROUTE = ["SUCCEEDED", "EXHAUSTED", "NOT-EXHAUSTED"];
// A contrast needs a foil, and a foil needs a marker a reader can see. Bilingual by design: the
// packet body is written in the user's language while the tokens stay fixed (SKILL.md § Language).
// The Japanese half is deliberately wide — a real contrast stated as 「Aでは落ちるが他は完走する」
// carries no 「ではなく」. A marker this floor misses reads as a bare P, which would reject a real
// contrast; erring lax is correct because judgement, not this script, owns whether the foil is good.
const FOIL_MARKERS =
  "expected | predicted | foil | rather than | instead of | unlike | whereas | while | but | only |" +
  " not | should have | vs | versus | ではなく | でなく | じゃなく | のに | はず | 想定 | 期待 | 予想 |" +
  " 本来 | 通常 | 一方 | 他方 | に対して | に対し | 他 | だけ | のみ | 残り";
const FOIL_MARKER =
  /\b(?:expected|predicted|foil|rather than|instead of|unlike|whereas|while|but|only|not|should have|vs\.?|versus)\b|ではなく|でなく|じゃなく|のに|はず|想定|期待|予想|本来|通常|一方|他方|に対して|に対し|他|だけ|のみ|残り/i;
// Structural fallback for A1. The contract asks for `P observed, Q expected` — a PAIR — so a row
// that IS a pair of substantial clauses passes even carrying none of the listed connectives. Two
// real contrasts were rejected without this: `the ARM build crashes at link time; the x86 build
// completes cleanly` and 「b7でハングし、6台では90秒で完了する」 (ledger §8). A false FAIL blocks a
// legitimate packet; a false PASS only fails to catch what a reader must judge anyway.
const CLAUSE_SPLIT = /[;；,，、]/;
const isClausePair = (v: string): boolean =>
  v.split(CLAUSE_SPLIT).filter((c) => c.trim().length >= 6).length >= 2;
const PLACEHOLDER = /^\s*(?:\[[^\]]*\]|—|-|–|TBD|n\/a|なし|未定|\.\.\.)?\s*$/i;
const norm = (s: string): string => s.toLowerCase().replace(/[\s、。,.]/g, "");
/** Latin words of 4+ chars, used to ask whether two rows talk about the same thing at all. */
const wordsOf = (v: string): string[] =>
  (v.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []);

type Finding = { file: string; rung: string; detail: string };

function rowsOf(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split("\n")) {
    const m = /^\s*[-*]\s*([A-Z][A-Za-z ]*?)\s*:\s*(.*)$/.exec(line);
    if (m) out.set(m[1].trim(), m[2].trim());
  }
  return out;
}

// A value may be `TOKEN` or `TOKEN — free text`; take the leading token only.
const token = (v: string): string => (v.split(/\s+—|\s+--|\s*\|/)[0] ?? "").trim().toUpperCase();
const tail = (v: string): string => v.slice(token(v).length).replace(/^[\s—-]+/, "").trim();

export function checkPacket(file: string, text: string): Finding[] {
  const f: Finding[] = [];
  const add = (rung: string, detail: string) => f.push({ file, rung, detail });
  const r = rowsOf(text);

  if (!/^##\s+HYPOTHESIS\b/m.test(text))
    add("SHAPE", "no '## HYPOTHESIS <ID>' heading — this is not a packet");

  for (const name of ROWS) {
    const v = r.get(name);
    if (v === undefined) add("SHAPE", `missing row: ${name}`);
    else if (PLACEHOLDER.test(v)) add("SHAPE", `row '${name}' is empty or still a template placeholder`);
  }

  const contrast = r.get("Contrast") ?? "";
  if (
    contrast && !PLACEHOLDER.test(contrast) &&
    !FOIL_MARKER.test(contrast) && !isClausePair(contrast)
  )
    add(
      "A1",
      "Contrast names no foil — write it as the pair 'P observed, Q expected', or use one of these " +
        `markers: ${FOIL_MARKERS}`,
    );

  const cs = token(r.get("Contrast source") ?? "");
  if (cs && !CONTRAST_SOURCE.has(cs))
    add("A1", `Contrast source '${cs}' not one of ${[...CONTRAST_SOURCE].join(" | ")}`);

  const hole = token(r.get("Hole type") ?? "");
  if (hole && !HOLE_TYPE.has(hole))
    add("A1", `Hole type '${hole}' not one of ${[...HOLE_TYPE].join(" | ")}`);

  const closed = r.get("Closed route") ?? "";
  const closedTok = token(closed);
  if (closed && !CLOSED_ROUTE.includes(closedTok))
    add("A3", `Closed route must start with ${CLOSED_ROUTE.join(" or ")}`);
  else if (closed && tail(closed).length < 12)
    add("A3", `Closed route is '${closedTok}' with no account of what it produced, what was tried, or why not`);

  const intro = r.get("Introduction type") ?? "";
  const introTok = token(intro);
  const isOther = /^OTHER\b/i.test(introTok);
  if (intro && !INTRO_TYPE.has(introTok) && !isOther)
    add("A2", `Introduction type '${introTok}' not one of ${[...INTRO_TYPE].join(" | ")} | OTHER — <named>`);
  if (isOther && tail(intro).length < 3)
    add("A2", "Introduction type OTHER must be named — an unnamed OTHER closes the open set by stealth");

  const st = token(r.get("Status") ?? "");
  if (st && !STATUS.has(st)) add("SHAPE", `Status '${st}' not one of ${[...STATUS].join(" | ")}`);

  // The hypothesis is the product, so it gets its own rung: it must say something, and it must say
  // something OTHER than the anomaly. Restating the observation is the rename failure A4 names,
  // and it is the one form of that failure a script can actually see.
  const hyp = r.get("Hypothesis") ?? "";
  if (hyp && !PLACEHOLDER.test(hyp)) {
    if (hyp.length < 12) add("A4", "Hypothesis row is too short to be a claim about what is happening");
    else if (norm(hyp) === norm(r.get("Anomaly") ?? " "))
      add("A4", "Hypothesis restates the Anomaly verbatim — that is the observation, not an explanation of it");
    else if (norm(hyp) === norm(tail(r.get("Closed route") ?? " ")))
      add("A4", "Hypothesis restates the Closed route account verbatim — say what is happening, not what you tried");
  }

  // Branch agreement. The three rows Closed route / Introduction type / Status describe one
  // decision from three sides; disagreement between them is the packet lying about its own branch.
  const introducing = introTok !== "" && introTok !== "NONE";
  if (closedTok === "SUCCEEDED") {
    if (introducing)
      add("A3", `Closed route SUCCEEDED but Introduction type is ${introTok} — a route that worked introduced nothing`);
    if (st && st !== "CLOSED-VOCABULARY")
      add("A3", `Closed route SUCCEEDED but Status is ${st} — the closed-vocabulary branch ends at CLOSED-VOCABULARY`);
  }
  if (st === "CLOSED-VOCABULARY") {
    if (introducing) add("A3", `Status CLOSED-VOCABULARY with Introduction type ${introTok} — pick one`);
    if (closedTok && closedTok !== "SUCCEEDED")
      add("A3", `Status CLOSED-VOCABULARY but Closed route is ${closedTok} — nothing explained the contrast`);
  }
  if (st === "LICENSED" && intro && !introducing)
    add("A3", "Status LICENSED with Introduction type NONE — nothing was introduced, so nothing was licensed");
  if (introducing) {
    if (closedTok === "") add("A3", "a vocabulary-introducing packet with no Closed route row is NO-LICENSE");
    const terms = r.get("Introduced terms") ?? "";
    if (token(terms) === "NONE")
      add("A2", `Introduction type is ${introTok} but Introduced terms is NONE — name the words, or the type is NONE`);
    else if (terms && !PLACEHOLDER.test(terms) && hyp && !PLACEHOLDER.test(hyp)) {
      // The introduced terms and the claim must be about the same thing. Word-level, not
      // phrase-level: a term is normally inflected or expanded when it reaches the sentence.
      const tw = wordsOf(terms);
      const shares = tw.length
        ? tw.some((w) => hyp.toLowerCase().includes(w))
        : norm(hyp).includes(norm(terms));
      if (!shares)
        add("A4", "Introduced terms share no word with the Hypothesis row — one of the two rows is about something else");
    }
    for (const need of ["Discriminator", "Kill condition"] as const) {
      const v = r.get(need) ?? "";
      if (PLACEHOLDER.test(v))
        add("A4", `Introduction type is ${introTok} but ${need} is empty — the term buys no observation`);
    }
  }

  const min = token(r.get("Minimality claim") ?? "");
  if (min && !MINIMALITY.has(min))
    add("A4", `Minimality claim '${min}' not one of ${[...MINIMALITY].join(" | ")}`);
  if (min === "GLOBAL" && tail(r.get("Minimality claim") ?? "").length < 12)
    add("A4", "a GLOBAL minimality claim needs its own argument — 'nothing smaller works' is not 'no element is removable'");

  if ((st === "LICENSED" || st === "CLOSED-VOCABULARY") && f.some((x) => x.rung !== "SHAPE"))
    add("SHAPE", `Status ${st} while a gate row is malformed — emit NO-LICENSE instead`);

  return f;
}

const BAD = `## HYPOTHESIS X1
- Anomaly: the run got slower
- Contrast: the run got slower
- Contrast source: GUESSED
- Supplied: [vocabulary / variables]
- Closed route: EXHAUSTED
- Hypothesis: the run got slower
- Hole type: THEORY
- Introduction type: OTHER
- Introduced terms: NONE
- Discriminator:
- Kill condition: [what outcome retires this introduction]
- Minimality claim: GLOBAL
- Status: LICENSED
- Handoff: none
`;

// The branch the first forge could not express at all: the closed route worked. Here it is stated
// INCOHERENTLY — a succeeded route that still claims an introduction — and every disagreement must
// be caught. See tests/forge-verification-ledger.md, 2026-09-05 reorganization.
const BAD_BRANCH = `## HYPOTHESIS X2
- Anomaly: pytest hangs on runner-b7
- Contrast: b7 でハングし、他の 6 台では 90 秒で完了する
- Contrast source: OBSERVED
- Supplied: the pytest fixture graph and the runner image manifest
- Closed route: SUCCEEDED — b7 alone pins the old image, whose fixture teardown blocks on a socket
- Hypothesis: b7 runs the pre-rebuild image, so teardown waits on a socket the new image closes
- Hole type: THEORY
- Introduction type: NEW-PREDICATE
- Introduced terms: submission/completion imbalance
- Discriminator: rebuild b7 and rerun
- Kill condition: the hang survives a rebuild
- Minimality claim: LOCAL
- Status: LICENSED
- Handoff: none
`;

// Two packets that must produce ZERO findings — one per branch. The first forge had no such case,
// which is exactly why an unrepresentable CLOSED-VOCABULARY branch shipped unnoticed.
const GOOD_CLOSED = `## HYPOTHESIS G1
- Anomaly: pytest hangs on runner-b7
- Contrast: b7でハングし、6台では90秒で完了する
- Contrast source: OBSERVED
- Supplied: the pytest fixture graph and the runner image manifest
- Closed route: SUCCEEDED — the image manifest alone separates b7 from the six that finish
- Hypothesis: b7 runs the pre-rebuild image, so teardown waits on a socket the new image closes
- Hole type: THEORY
- Introduction type: NONE
- Introduced terms: NONE
- Discriminator: rebuild b7 from the current manifest and rerun the suite
- Kill condition: the hang survives a rebuild
- Minimality claim: LOCAL
- Status: CLOSED-VOCABULARY
- Handoff: none
`;

const GOOD_LICENSED = `## HYPOTHESIS G2
- Anomaly: throughput collapses above 12 writers
- Contrast: 12 writers で 40% 落ちるのに、11 writers では線形に伸びる
- Contrast source: OBSERVED
- Supplied: the queue-depth model, the per-writer latency histogram, the lock ledger
- Closed route: EXHAUSTED — lock contention, GC pauses and disk saturation each measured flat across the boundary
- Hypothesis: above 12 writers submission and completion become separately rate-limited, so the queue stalls while neither full nor empty
- Hole type: THEORY
- Introduction type: NEW-PREDICATE
- Introduced terms: submission/completion imbalance
- Discriminator: a stall with the queue neither full nor empty, which the queue-depth model cannot state
- Kill condition: the collapse tracks queue depth alone under a forced imbalance
- Minimality claim: LOCAL — neither half of the pair is removable without losing the boundary
- Status: LICENSED
- Handoff: acting-on-hypotheses if one costly bet
`;

// Argv goes through Cleye rather than being read raw: that is what gives this script `--help`,
// rejection of a typo'd flag before any file is opened, and the house floor's BG1 boundary.
// `[files...]` is a SPREAD because extra positionals are the point — each one is another packet.
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

// A usage error is not a packet defect, so it exits 2: a caller can tell "you invoked me wrong"
// from "the packet failed the floor" (exit 1).
function parseArgv() {
  try {
    return cli(
      {
        name: "hypothesis-check.ts",
        strictFlags: true,
        ignoreArgv: rejectPrototypeFlag,
        parameters: ["[files...]"],
        flags: {
          selfTest: {
            type: Boolean,
            default: false,
            description: "Prove the floor fires on known-bad packets and spares well-formed ones",
          },
        },
        help: {
          description:
            "Structural floor for a HYPOTHESIS packet: gate rows, their forms, and branch agreement.",
        },
      },
      undefined,
      Bun.argv.slice(2),
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}

// A license claimed over nothing: EXHAUSTED route, Introduction type NONE, Status LICENSED. This
// passed the floor clean until the 2026-09-05 fleet built it (ledger §8).
const BAD_LICENSE = `## HYPOTHESIS X3
- Anomaly: throughput collapses above 12 writers
- Contrast: 12 writers で 40% 落ちるのに、11 writers では線形に伸びる
- Contrast source: OBSERVED
- Supplied: the queue-depth model and the lock ledger
- Closed route: NOT-EXHAUSTED — the lock ledger has not been read yet
- Hypothesis: the writers contend on a single lock once the pool exceeds the core count
- Hole type: THEORY
- Introduction type: NONE
- Introduced terms: NONE
- Discriminator: per-writer lock wait time above and below the boundary
- Kill condition: lock wait stays flat across the boundary
- Minimality claim: LOCAL
- Status: LICENSED
- Handoff: none
`;

// A well-formed packet whose Contrast carries NO connective from FOIL_MARKERS in either language.
// It is a pair of clauses, which is exactly what the contract asks for, so it must pass.
const GOOD_PLAIN = `## HYPOTHESIS G3
- Anomaly: the ARM build fails at link time
- Contrast: the ARM build crashes at link time; the x86 build completes cleanly from the same commit
- Contrast source: OBSERVED
- Supplied: the toolchain manifest, the linker invocation, and the per-arch feature flags
- Closed route: SUCCEEDED — the manifest pins a linker that predates the arch's relocation type
- Hypothesis: the pinned linker cannot emit the relocation the ARM object files require
- Hole type: THEORY
- Introduction type: NONE
- Introduced terms: NONE
- Discriminator: rerun the link with the current linker and keep every other flag fixed
- Kill condition: the crash survives the newer linker
- Minimality claim: LOCAL
- Status: CLOSED-VOCABULARY
- Handoff: none
`;

async function main(): Promise<void> {
  const argv = parseArgv();
  if (argv.flags.selfTest) {
    let failed = false;
    const badBranch = checkPacket("<bad-branch>", BAD_BRANCH);
    const badLicense = checkPacket("<bad-license>", BAD_LICENSE);
    const found = [...checkPacket("<bad>", BAD), ...badBranch, ...badLicense];
    const want = ["A1", "A2", "A3", "A4", "SHAPE"];
    const missing = want.filter((w) => !found.some((x) => x.rung === w));
    for (const x of found) console.log(`  ${x.file} ${x.rung}: ${x.detail}`);
    if (missing.length) {
      console.error(`SELF-TEST FAILED: the known-bad packets did not trip ${missing.join(", ")}`);
      failed = true;
    }
    if (!badBranch.length) {
      console.error("SELF-TEST FAILED: an incoherent SUCCEEDED/NEW-PREDICATE packet passed");
      failed = true;
    }
    if (!badLicense.length) {
      console.error("SELF-TEST FAILED: a LICENSED packet that introduced nothing passed");
      failed = true;
    }
    const goods = [
      ["closed-vocabulary", GOOD_CLOSED],
      ["licensed", GOOD_LICENSED],
      ["marker-free contrast", GOOD_PLAIN],
    ] as const;
    for (const [name, good] of goods) {
      const noise = checkPacket(`<good-${name}>`, good);
      for (const x of noise) console.error(`  FALSE POSITIVE ${x.file} ${x.rung}: ${x.detail}`);
      if (noise.length) {
        console.error(`SELF-TEST FAILED: the good ${name} packet tripped ${noise.length} finding(s)`);
        failed = true;
      }
    }
    if (failed) process.exit(1);
    console.log(`SELF-TEST OK — bad packets tripped ${found.length} findings across every rung; all ${goods.length} good packets clean`);
    return;
  }
  const files: string[] = argv._.files;
  if (!files.length) {
    console.error("usage: bun scripts/hypothesis-check.ts <packet.md> [...]  |  --self-test");
    process.exit(2);
  }
  let bad = 0;
  for (const file of files) {
    const findings = checkPacket(file, await Bun.file(file).text());
    for (const x of findings) console.log(`FAIL [${x.rung}] ${x.file}: ${x.detail}`);
    bad += findings.length;
  }
  console.log(bad === 0 ? `PASS ${files.length} packet(s)` : `FAIL ${bad} finding(s)`);
  process.exit(bad === 0 ? 0 : 1);
}

if (import.meta.main) await main();
