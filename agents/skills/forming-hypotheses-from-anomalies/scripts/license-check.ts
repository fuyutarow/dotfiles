#!/usr/bin/env bun
// license-check — the greppable floor for an ABDUCTION LICENSE packet.
//
// THIS IS NOT A SEMANTIC CHECK. It cannot tell you whether the foil was well chosen, whether the
// closed-route attempt was serious, whether the introduced term is any good, or whether the
// discriminator is obtainable. It checks that each gate's ROW EXISTS and is well-formed. A packet
// that passes this script can still be worthless; a packet that fails it is not yet a packet.
//
// Deliberately NOT checked, and why: the skill's LAW says deciding whether a new term is NEEDED is
// undecidable (references/gates.md, A3). A floor that tried to certify necessity would be
// asserting what no procedure can compute. So EXHAUSTED and NOT-EXHAUSTED are both accepted here;
// which one is honest is a reader's call.
//
// Usage: bun scripts/license-check.ts <packet.md> [...]
//        bun scripts/license-check.ts --self-test   (proves the gate fires; see §5 of architecture)

const ROWS = [
  "Anomaly", "Contrast", "Contrast source", "Supplied", "Closed route", "Hole type",
  "Introduction type", "Introduced terms", "Discriminator", "Kill condition",
  "Minimality claim", "Status", "Handoff",
] as const;

const CONTRAST_SOURCE = new Set(["OBSERVED", "PREDICTED-BY-ACCOUNT", "CHOSEN"]);
const HOLE_TYPE = new Set(["THEORY", "OBSERVATION", "UNDECIDED"]);
const INTRO_TYPE = new Set([
  "NONE", "COMMON-CAUSE", "TRANSFER", "NEW-PREDICATE", "EXPANSIVE-PARTITION",
]);
const MINIMALITY = new Set(["NONE", "LOCAL", "GLOBAL"]);
const STATUS = new Set(["LICENSED", "NO-LICENSE"]);
// A contrast needs a foil, and a foil needs a marker a reader can see. Bilingual by design: the
// packet body is written in the user's language while the tokens stay fixed (SKILL.md § Language).
const FOIL_MARKER =
  /\b(?:expected|predicted|foil|rather than|instead of|not\b)|でなく|ではなく|のに|はず|想定|期待/i;
const PLACEHOLDER = /^\s*(?:\[[^\]]*\]|—|-|–|TBD|n\/a|なし|未定|\.\.\.)?\s*$/i;

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

  if (!/^##\s+ABDUCTION LICENSE\b/m.test(text))
    add("SHAPE", "no '## ABDUCTION LICENSE <ID>' heading — this is not a packet");

  for (const name of ROWS) {
    const v = r.get(name);
    if (v === undefined) add("SHAPE", `missing row: ${name}`);
    else if (PLACEHOLDER.test(v)) add("SHAPE", `row '${name}' is empty or still a template placeholder`);
  }

  const contrast = r.get("Contrast") ?? "";
  if (contrast && !PLACEHOLDER.test(contrast) && !FOIL_MARKER.test(contrast))
    add("A1", "Contrast names no foil — write 'P observed, Q expected'; a bare P is not a contrast");

  const cs = token(r.get("Contrast source") ?? "");
  if (cs && !CONTRAST_SOURCE.has(cs))
    add("A1", `Contrast source '${cs}' not one of ${[...CONTRAST_SOURCE].join(" | ")}`);

  const hole = token(r.get("Hole type") ?? "");
  if (hole && !HOLE_TYPE.has(hole))
    add("A1", `Hole type '${hole}' not one of ${[...HOLE_TYPE].join(" | ")}`);

  const closed = r.get("Closed route") ?? "";
  const closedTok = token(closed);
  if (closed && closedTok !== "EXHAUSTED" && closedTok !== "NOT-EXHAUSTED")
    add("A3", "Closed route must start with EXHAUSTED or NOT-EXHAUSTED");
  else if (closed && tail(closed).length < 12)
    add("A3", `Closed route is '${closedTok}' with no account of what was tried or why not`);

  const intro = r.get("Introduction type") ?? "";
  const introTok = token(intro);
  const isOther = /^OTHER\b/i.test(introTok);
  if (intro && !INTRO_TYPE.has(introTok) && !isOther)
    add("A2", `Introduction type '${introTok}' not one of ${[...INTRO_TYPE].join(" | ")} | OTHER — <named>`);
  if (isOther && tail(intro).length < 3)
    add("A2", "Introduction type OTHER must be named — an unnamed OTHER closes the open set by stealth");

  const introducing = introTok !== "" && introTok !== "NONE";
  if (introducing) {
    if (closedTok === "") add("A3", "a vocabulary-introducing packet with no Closed route row is NO-LICENSE");
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

  const st = token(r.get("Status") ?? "");
  if (st && !STATUS.has(st)) add("SHAPE", `Status '${st}' not one of ${[...STATUS].join(" | ")}`);
  if (st === "LICENSED" && f.some((x) => x.rung !== "SHAPE"))
    add("SHAPE", "Status LICENSED while a gate row is malformed — emit NO-LICENSE instead");

  return f;
}

const BAD = `## ABDUCTION LICENSE X1
- Anomaly: the run got slower
- Contrast: the run got slower
- Contrast source: GUESSED
- Supplied: [vocabulary / variables]
- Closed route: EXHAUSTED
- Hole type: THEORY
- Introduction type: OTHER
- Introduced terms: thermal coupling
- Discriminator:
- Kill condition: [what outcome retires this introduction]
- Minimality claim: GLOBAL
- Status: LICENSED
- Handoff: none
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "--self-test") {
    const found = checkPacket("<self-test>", BAD);
    const want = ["A1", "A2", "A3", "A4", "SHAPE"];
    const missing = want.filter((w) => !found.some((x) => x.rung === w));
    for (const x of found) console.log(`  ${x.rung}: ${x.detail}`);
    if (missing.length) {
      console.error(`SELF-TEST FAILED: the known-bad packet did not trip ${missing.join(", ")}`);
      process.exit(1);
    }
    console.log(`SELF-TEST OK — known-bad packet tripped ${found.length} findings across every rung`);
    return;
  }
  if (!args.length) {
    console.error("usage: bun scripts/license-check.ts <packet.md> [...]  |  --self-test");
    process.exit(2);
  }
  let bad = 0;
  for (const file of args) {
    const findings = checkPacket(file, await Bun.file(file).text());
    for (const x of findings) console.log(`FAIL [${x.rung}] ${x.file}: ${x.detail}`);
    bad += findings.length;
  }
  console.log(bad === 0 ? `PASS ${args.length} packet(s)` : `FAIL ${bad} finding(s)`);
  process.exit(bad === 0 ? 0 : 1);
}

if (import.meta.main) await main();
