# Forge verification ledger — designing-interactions (F3 artifact)

Append on reforge; never overwrite. The fire/no-fire desk-check set lives inline in `SKILL.md`
("Fire / no-fire") — re-run it after any description edit. Source grades and forbidden citations
live in `references/evidence.md`, which is their SOLE home; this file records only the forge and
its verification.

## CURRENT STATE

**Invariants (live):**

- **LAW is medium-agnostic by construction.** The skill was re-scoped mid-forge (2026-07-28) after
  the owner rejected an agent-as-consumer spine: *"あくまで ux 一般論、実践論としての スキル蒸留…
  特段には domain/app agnostic であるべき."* Consequences that must survive any reforge: the agent
  regime is ONE row in `delegability.md` §5, never the spine; the U3 gate is **DELEGABILITY**, not
  the CLI-flavoured "drivability"; examples span GUI / touch / command / physical / API; no
  framework names in the body.
- **No universal runnable floor exists, and the skill says so.** The surface can be a physical
  dial. `scripts/captive-probe.ts` is deliberately labelled COMMAND-REGIME-ONLY in its own header;
  the four gates are passed by enumerated tables, which are the medium-agnostic artifacts.
- **The gates are conjunctive tests, not prohibitions.** Raskin's clause (2) alone is nearly
  universal, so "state-dependent ⇒ defect" is the predicted top misfire. The anti-dogma table sits
  in `SKILL.md`, not in a reference, so a model loading only the body meets the refutation before
  the doctrine.
- **F2 absence is grep-proved, not asserted.** At forge time the whole `agents/skills/` tree
  returned zero hits for `modeless`, `hickey`, `simple made easy`, `usability`; one hit for
  `affordance` (growing-oss-adoption, scoped to OSS retention); `mode error` and `captive` hits
  were unrelated homonyms (`strict-mode error flood`, `captive portal`); `\bundo\b` hits were all
  the Claude Code harness's own checkpoint mechanism. Re-run this sweep on reforge.

**Open defects:** none recorded.

**Retired decisions (do not resurrect):**

- *"An agent has no persistent locus of attention, therefore every stateful surface is maximally
  modal for an agent"* as the skill's SPINE — retired 2026-07-28 before drafting. The derivation
  itself is kept, graded **constructed**, in `evidence.md` §1; only its promotion to the organizing
  thesis was wrong.
- *"DRIVABILITY"* as the U3 gate name — retired 2026-07-28, same turn, same reason (CLI-flavoured;
  excluded assistive technology and API consumers from a gate that should own them).

## 2026-07-28 forge (v2607.1.0)

**Source.** A 15-agent survey run as one Workflow: 12 read-only harvest agents (one per source
surface — Hickey; the Tesler/Apple/OOUI modelessness lineage; Raskin; Norman; Gancarz/ESR; modern
CLI + agent-facing guidance; Nielsen/Shneiderman/Cooper/Hutchins/Victor; Tar Pit/Brooks/Ousterhout
+ cognitive load; the adversarial case FOR modes; undo/state mechanics; the local sibling audit;
agent-as-consumer), then 3 adversarial quote auditors instructed to **refute**, each independently
re-fetching primary sources for one risk cluster. 2.53M subagent tokens, 724 tool calls.

**Adversarial verification at forge — what the auditors killed.** 153 verbatim/author-confirmed
claims audited; 147 CONFIRMED-VERBATIM, 6 corrected or killed:

| Ruling | Claim | Resolution |
|---|---|---|
| CORRECTED | Raskin's mode definition submitted without "possible" in clause (2) | restored from four independent renderings of the book text; the harvester had treated the correct variant as an outlier |
| CORRECTED | a Norman mode-error quote ending "so the controls must do double duty" | not Norman's sentence; the cited page does not contain it. True 1988 wording substituted; the false one is now a forbidden row |
| UNRETRIEVABLE | Norman "We should eliminate the concept of error" | sentiment is his, sentence not located anywhere; demoted to paraphrase-by-title |
| CORRECTED | Gancarz TOC "1 Tenet 1" | actually "2.1 Tenet 1: Small is beautiful" |
| CORRECTED | Cooper's dialog-box line punctuation | book uses a semicolon; the popular period-form is drift |
| CORRECTED | local-first Table 1 read as ✗ for Google Docs on Fast/Offline | the paper's legend has three levels; only Privacy is a full miss |

**The single most consequential finding** was not a correction but a discovery: the corpus
**refutes** naive modelessness from inside itself — Apple retired Modelessness as a named principle
(~2017), Gentner & **Nielsen** attacked it in CACM 1996, Tesler personally carved out
metaphor-backed modes, the 1987 HIG already enumerated permitted mode categories, and Poller &
Garter (*Human Factors*, 1984) measured moded `vi` beating modeless `emacs` for experienced users.
The auditors also established that the vim/emacs "efficiency study" circulating as evidence is
**satire**. This inverted the skill's planned shape: the anti-dogma table became first-class SKILL.md
content rather than a caveat.

**F2 PLACEMENT.** Typed cuts written against 12 siblings from verbatim frontmatter reads, each with
a co-fire order. Highest-collision case: `frontend-design` (plugin) — resolved PURPOSE: it owns
palette / type / layout / motion / microcopy and has **zero** doctrine on modes, undo, or
recoverability; this skill owns interaction-logic correctness. Second: `dataviz`, which claims
"laying out a dashboard" in its own description — resolved CARDINALITY/PURPOSE (data-encoding object
vs page-level flow), page structure first, encoding second. Reciprocal edits into sibling
descriptions are **DEFERRED** — see below.

**F1 OPERATIONALITY.** Four gates, each demanding an enumerated artifact (gesture ledger, absorber
ledger, delegation table, action classification) rather than prose. One runnable check, regime-scoped.

**F3 SELF-VERIFICATION.** Build-order one-liner in the header; 7 fire / 7 near-miss no-fire rows
inline in `SKILL.md`; this ledger. `skill-check.ts` and the gate-fires-red proof recorded below.

### Verification runs (2026-07-28)

- `forging-skills/scripts/skill-check.ts` over the new skill: **FAIL 0, WARN 0.** Reached only
  after two clearing passes — description trimmed 1554 → 1441 chars, and 23 over-long prose
  sentences rewritten (the house "touch it, clear it" rule). Frontmatter also strict-YAML parsed
  (pyyaml): `description` round-trips as a single 1441-char string.
- `writing-bun-scripts/scripts/script-check.ts` over the shipped scripts: **FAIL 0**, WARN 5 —
  all five are the sanctioned fixture case (shebang + exec bit on binary-substituted fixtures).
- `bun test tests` — **11 pass / 0 fail**, fixture-binary pattern: five real executables
  (`hangs`, `prompts`, `decorated`, `quiet-failure`, `clean`) spawned as genuine processes.
- **Proof of fire.** Injected `if (false)` over the F1 HANG branch → the suite went 10 pass /
  1 fail; reverted → 11 pass. A gate never seen red is decoration.

### The probe's own forge — two wrong diagnoses, recorded

The first `captive-probe.ts` shipped with two defects. Both were caught by the red-test, and
**both of my first-pass diagnoses were also wrong** — the failure worth encoding is the
diagnostic flailing, not the bugs.

| Symptom | My wrong diagnosis | What was actually true |
|---|---|---|
| `sleep 30` at `--timeout 1000` reported CLEAN | "`killedBySignal` is the wrong property" → switched to `child.signalCode` | `killedBySignal` was indeed wrong (it is a spawn *option*), but `signalCode` is **also** wrong: `writing-bun-scripts` BG2 states from measurement that `signalCode` cannot separate our own timeout from an external kill. Correct form: pass `signal: AbortSignal.timeout(ms)` and read `sig.aborted` |
| `-- sh -c '…'` exited 2 with "Unknown option '-c'" | "Bun consumes the `--` before the script sees it" → hand-rolled an argv splitter with a `VALUE_OPTIONS` set | **Half true, wrongly generalized — twice.** Measured on bun 1.3.14: a `--` sitting *directly after the script path* IS consumed; a `--` anywhere later survives. So `probe.ts -- cmd` arrives as `["cmd"]` while `probe.ts --json -- cmd` keeps the separator. I first over-generalized "bun eats it" from the leading case, then over-generalized "bun delivers it" from the later case — and the hand-rolled splitter was still unnecessary either way. Both `parseArgs` and `type-flag` handle `--` natively; the runtime quirk needs exactly one normalization line |

Owner intervention (「argparse くらいまともにやれよ」) routed the script through
`writing-bun-scripts`, whose BG1/BG2 contract it was violating on five further counts: a shebang
on a non-fixture, no `main().catch` → `FATAL`/exit 2 entry, no declared consumer, `await
child.exited` outside the drain `Promise.all`, and an unbounded relay. All corrected. **Standing
lesson for this skill's own maintenance: probe the runtime before diagnosing it** — the second
wrong diagnosis cost a whole rewrite that a two-line `Bun.argv` probe would have prevented.

### Deferred / owed on next reforge

| Item | Owner | Why deferred |
|---|---|---|
| Reciprocal cut lines in `frontend-design` and `dataviz` descriptions | those skills | both are **marketplace-managed plugin skills, read-only** — the cut is one-directional by necessity and is declared here, per the same precedent `forging-skills` records for the default skill-creators |
| Reciprocal rows in local siblings' routing tables (`linting-prose`, `structuring-documents`, `implementing-and-debugging`, `refactoring-code`, `growing-oss-adoption`, `web-perf`, `writing-bun-scripts`) | this repo | not landed in the forge commit; the cuts are stated one-directionally in this skill's description. First reforge should land the reciprocal side or record why not |
| Re-fetch Apple HIG (modality, sheets, undo, principles) | `evidence.md` §4 | living document; the *Undo and redo* page was client-rendered and unreadable at forge time |
| Read Poller & Garter (1984) in full | `evidence.md` §4 | the single most load-bearing empirical counter-result in the skill currently rests on a citation-level read |
