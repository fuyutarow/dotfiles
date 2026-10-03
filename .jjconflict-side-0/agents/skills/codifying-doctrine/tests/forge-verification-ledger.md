# Forge verification ledger — codifying-doctrine (F3 artifact)

Append on reforge; never overwrite. The fire/no-fire desk-check set lives in `triggers.md`.

## CURRENT STATE

**Invariants (live):**

- **Function map (signed by this skill's craft owner, `forging-skills`):**
  `a recurring conflict between two defended values, resolved differently by different actors who
  cannot confer` → **CODIFY** → `a doctrine whose every rule names its SACRIFICE, REGIME, FORM,
  grounding case, BINDING SURFACE, deviation path, and RETIREMENT TRIGGER` → `actors decide alike
  under partition; deviation is visible; the doctrine is revisable`.
  Stop condition: D1–D6 artifacts exist and D7 (DIVERGENCE PROBE) has been RUN, with its result
  stated including "no divergence found on N dilemmas — untested beyond these."
- **Ownership void confirmed at forge.** No house skill owned the trade-off-ordering artifact.
  `operating-the-harness` owns where a rule installs; `forging-skills` owns the task manual;
  `practicing-tiger-style` is a doctrine INSTANCE, not the craft. Nine typed cuts are written into
  SKILL.md's routing table and the description.
- **Calibration inversion (the reason MUST-NOT-FIRE is first-class).** The source corpus corrects
  human organizations that write costless-virtue values documents. A capable model fails in the
  SAME direction on trade-off erasure, but INVERSELY on two axes: it manufactures a doctrine where
  a single decision or an existing SOP would do (→ STEP 0 and the MUST-NOT-FIRE table are
  first-class), and it INVENTS the trade-off from taste rather than eliciting it from decided
  cases (→ D4 GROUNDING, and `deriving.md` §2's anti-invention rule).
- **Evidence archetype: DIVERGENCE-PROBE (a sixth archetype, declared here as new).** Evidence is
  DISAGREEMENT. The asymmetry is load-bearing and is stated in SKILL.md: divergence found is a
  hard signal; no divergence found is weak, because agents drawn from one model are correlated
  readers whose agreement overstates what humans reach. The choice of WHICH value to sacrifice is
  a HUMAN row on the stage map — a model that picks it has invented the organization's preferences.
- **Durability contract.** `references/canon.md` is the ONLY file carrying dated external facts,
  product names, and quotations. A quotation or vendor name in SKILL.md or the other three
  references is a bug.

**Open defects:**

- **No effectiveness evidence exists, and the skill says so** (`canon.md` §6). No study was found
  that measures divergence across independent actors, nor the relation between rule count and
  agreement, nor the effect of a deviation log. Every claim is about FORM and BINDING SURFACE.
  This is a real limit, recorded rather than papered over.
- **Eight surfaces unswept**, declared in `canon.md` §5: legal doctrine proper (which contains a
  THIRD coordination pattern the skill does not model — persistent tolerated disagreement resolved
  by an intermittent authority), GRADE, HRO/Weick, religious dogma, OSS governance, Boyd, central-
  bank forward guidance, and worldbuilding. Highest-value next harvest: OSS governance (status
  tiers and binding vetoes are the closest existing implementation of D6's advance declaration)
  and GRADE (the only mature system separating evidence confidence from recommendation strength —
  this skill collapses both into one axis).
- **The ~7 rule cap is `constructed`**, a memory argument and not a measurement. Labeled as such
  in `deriving.md` §6, `canon.md` §2, and in the floor script's own WARN text.

**Retired decisions (do not resurrect):**

- Splitting REGIME and EXPIRY into two gates (D2 and D8). Merged at forge: naming the environment
  a rule holds in and naming the observable that ends that environment are one authoring act with
  one artifact. Eight gates was also over the body's budget for no gain.

## 2026-08-08 forge (v2608.1.0)

**Sources.** A 13-lens read-only survey (two workflows, 14 agents, ~1.56M subagent tokens):
military doctrine primary publications · doctrine theory (Posen / Høiback / Kier / Rosen) ·
doctrinal failure and myths · rules-vs-standards and commitment theory · coordination without a
coordinator · civilian operating principles · the pathology of written principles ·
machine-executable specs · retrievable written doctrine documents · self-managing organizations ·
research-lab doctrine · a 14-claim audit of user-supplied material · an adversarial completeness
critic. Source grades live in `references/canon.md`, per this skill's own reflexive rule.

**Provenance events worth recording:**

- **Cross-lens contradiction, adjudicated by the editor.** One lens reported retrieving Kelly
  Johnson's 14 Rules verbatim from Lockheed Martin's own PDF; another reported the PDF was
  unextractable and that circulating lists disagree rule-by-rule. The editor ran the check
  directly: HTTP 200, `pdftotext` yielded 14 paragraphs. The second report was wrong. Rules 3, 10,
  and 14 in `canon.md` §3 rest on that retrieval, graded PUBLISHER_PRIMARY (issuer's current
  publication, not the 1954 original; rule numbers live in the PDF's graphic layer).
  **Lesson encoded:** disagreement between agent reports is itself the signal, and the correct
  response was to run the cheap check personally rather than take a majority.
- **Myth quarantine.** Eleven widely-repeated claims were caught and are carried WITH their
  corrections in `canon.md` §4 rather than dropped, because a doctrine that cites a myth for
  authority inherits it. The largest class is NAME-WITHOUT-A-DOCUMENT (Gerasimov, Blitzkrieg,
  Powell), which became a first-class rule in THE LAW.
- **Sibling-corpus reuse.** The house's own `~/.claude/CLAUDE.md` is cited in `deriving.md` §2 as
  the live worked example: five hook-enforced rules, each stating a value trade with a named
  enforcement mechanism. This is a real instance, not a synthetic illustration.

**Verification at forge (editor-run, recorded):**

- `bun scripts/doctrine-check.ts` — **proved RED then GREEN.** A known-bad fixture (bare "we value
  quality", a "both speed and safety" row, empty defeated and surface cells, no custodian, no
  review-by, no retirement trigger) produced 10 FAILs and exit 1. A conforming fixture produced no
  output and exit 0.
- `bun test tests/doctrine-check.test.ts` — 9 pass, 0 fail, 20 assertions. The suite pins the red
  path for D1 (no trade form, "both", empty defeated), D5 (empty surface), and D2 (missing
  custodian / review-by / retirement trigger), plus the WARN-not-FAIL behavior for set size and a
  missing divergence probe.
- Build-order verify one-liner — clean; every indexed reference, the script, and both test
  artifacts exist in the same commit.
- Trigger desk-check — `tests/triggers.md`, 10 fire / 11 near-miss no-fire / 6 co-fire rows.
  The two rows judged most likely to regress (N5 "explain what military doctrine is", N10 "what
  does the Powell Doctrine say") are named there with the intended fix.

**Not done at forge (honest gaps in this skill's own verification):**

- **No live installed-skill invocation test.** The desk-check is author-run, not a fresh-context
  measurement. The order of proof this skill's own craft owner requires — floor → desk-check →
  live eval on contested rows → one real installed session — stopped after the desk-check.
- **No comparative judge run.** There is no incumbent to beat (the void was confirmed), so the
  old-vs-new comparison was skipped rather than failed.
- **No adversarial verification fleet was run over the forged files.** Design, distillation, and
  the cuts were solo; the hostile read-only lenses (self-contradiction, architecture, sibling cuts,
  bloat) have not run. This is the largest open item and the first thing a reforge should do.

## Maintenance triggers — any ONE forces a reforge

| Trigger | Note |
|---|---|
| A new house skill claims doctrine, principles, or trade-off territory | re-run the sibling-cut lens across the whole family |
| `operating-the-harness` or `forging-skills` changes its cut wording | both are reciprocal seams; agrees in SUBSTANCE, do NOT diff for byte-identity |
| Any `canon.md` row's source moves, is retracted, or is superseded | re-verify every URL and quotation on reforge; the Model Spec and the constitution are explicitly revisable documents |
| One of the eight unswept surfaces is harvested | `canon.md` §5 shrinks; the gate set may need to absorb what the surface teaches (GRADE's evidence/recommendation split is the most likely to force a change) |
| A real doctrine authored with this skill fails in production | the highest-grade source a skill can acquire — encode the failure |
| Someone measures divergence across independent actors | `canon.md` §6 is currently a declared absence; a real measurement would change D7 from a protocol into a calibrated instrument |
