# Distilling — SOURCE → operational rules (pipeline steps 1–2)

> **Scope**: steps 1–2 of the parent SKILL.md pipeline — pick the ENGINE for the source (step 1),
> then turn its content into graded, calibrated, operational rules (step 2). This file owns the
> source taxonomy, the distillation cut, PROVENANCE GRADING, the CALIBRATION INVERSION, and the
> degrees-of-freedom choice. What the rules become structurally (LAW / gates / artifacts), where
> each fact lives, sibling cuts, and verification are later pipeline steps — owned by their own
> references, pointed at from the parent SKILL.md, never re-argued here.

## 1. Source taxonomy — one engine per source class

Classify the source FIRST; the engine is not interchangeable. Mixed sources are graded rule-by-rule
(§3), not skill-by-dominant-source.

| Source class | Engine | Worked precedent |
|---|---|---|
| **BOOK / deck** (one author's framework) | **Deck-grounding**: no claim becomes a rule until verified against the author's own materials (deck, digest, book text); separate *verbatim* from *paraphrase* at capture time — a strong slogan you cannot quote is labeled paraphrase, never presented as the author's words | raising-resolution and acting-on-hypotheses (the 馬田 decks); quote-vs-paraphrase discipline at raising-resolution §C.3 |
| **SURVEY / corpus** (many cases or papers) | Do NOT distill from the raw corpus. Run method-fit synthesis FIRST — coverage contract, claim ledger, applicable appraisal, and reconciliation are owned by systematizing-knowledge — then distill THE RESULT, not the raw papers | growing-oss-adoption: 90-agent adversarial survey → reconciled mechanisms → skill |
| **Live SESSION** (operational failures just observed — or a workflow just performed: 「このセッションを skill 化して」) | **Highest-grade source** — the failure (or the working sequence) arrives already operational. Capture the exact trigger, the wrong action, and the correction WHILE the transcript exists; a just-performed workflow is mined the same way (transcript engine shared with TACIT/ELICITED below); no fleet needed for what you watched happen | the 2026-07 reforging: the fabricated-bibliography quarantine (systematizing-knowledge) and the whole of recovering-poisoned-context entered as observed production failures, not literature |
| **Official DOCS** (vendor / spec pages) | Fetch at build time and **cite with URLs**; tag [verbatim] vs [paraphrase]; **re-verify every URL on reforge** — docs move (docs.claude.com → platform.claude.com is a live redirect). Fast-moving facts go under a dated heading, not the durable body (proving-theorems' durability contract is the exemplar) | operating-the-harness lineage line: "re-verify against the docs" |
| **TACIT / ELICITED** (no artifact exists — the source is the user's head or the live conversation) | **Intent capture.** Workflow just performed in-session → mine the transcript FIRST: tools used, step sequence, the corrections the user made (credit: anthropic-skills:skill-creator, "Capture Intent"). Nothing to mine → the compact interview: functionality; 2–3 concrete example asks; the trigger phrasings a user would actually type; output format; edge cases/dependencies (credit: the Codex default's Step 1) — capped at the questions that actually BLOCK generation, never a questionnaire | the plugin's "turn this into a skill" path; the Codex default's image-editor interview (`.system:skill-creator`, Step 1) |

## 2. The distillation cut — what earns a line

Three tests; a candidate rule survives only if it passes all that apply.

1. **The command test** (house origin: raising-resolution §C.2 #6 — "Every retained line must
   change a tool call"). Ask per line: *does this make the agent run a different command, or make
   a different decision?* No → cut, or compress into the rule it was justifying. A line that only
   explains is source residue.
2. **Resolution on load-bearing claims.** Any claim a rule leans on states mechanism + magnitude +
   regime, anchored to the specific result — the bar is owned by systematizing-knowledge's
   source-claim and claim-type appraisal grammar, not restated here. "X improves quality" is not yet distilled; "X cuts
   failure mode Y in regime Z because M" is.
3. **The 既視感 kill** (pattern owned by raising-resolution §C.5). State explicitly what the
   source SUBSUMES (classic tools in a fresh metaphor) vs what is GENUINELY NEW — and claim the
   skill's own delta (the agent-specific operationalization) as skill-supplied, never attributed
   to the source. Marketing subsumed tools as novelty is laundering in both directions.

FORM-vs-CONTENT carve-out (2026-07-24): the three tests judge CONTENT lines. FORM rules — the
dual-reader prose bar — are enforced by the floor script at forge exit (`architecture.md` §5),
never distilled as content rules; a readability rule is not "cut" for changing no tool call.

## 3. PROVENANCE GRADING — the source-grade table

Canonical instance: raising-resolution §C.6 — declared the SOLE grade table for that entire skill.
Reproduce the pattern, not the content: **one table per skill, one home, every distilled rule
graded at capture time** (grading after writing invites laundering).

| Grade | Meaning | Handling |
|---|---|---|
| **author-confirmed** | verified against the author's own materials (verbatim, or sense confirmed) | may be stated in the source's voice |
| **needs-verification** | named in the source; exact content or wording not retrieved | label it; **DO-NOT-FABRICATE** — ship the named SLOT, never invent the items (an N-item list you cannot retrieve ships by function, with no normative numbering) |
| **skill-supplied** | THIS skill's operationalization; not the source's category | never present in the author's voice |
| **third-party** | non-author commentary, criteria, critique | name the party |
| **constructed** | engineered by the forger (e.g., a failure-mode list synthesized from the framework's own guardrails), found in no source | say so: "engineered, not measured" |

**Reflexive corollary** (§C.6): the skill's own claims are held to the skill's own gate — a skill
that demands citations from the agent while carrying ungraded claims fails its own LAW. Where a
claim is single-sourced or unverified, label it in the grade table and do not launder it upward.
This skill eats its own rule: its grade table lives in `tests/forge-verification-ledger.md`.

## 4. CALIBRATION INVERSION — step 2's non-optional question

Every source was written to correct SOMEONE's failure mode. Before freezing any rule, answer two
questions in writing:

1. **Whose failure was the source correcting?** (usually a human audience's)
2. **Does a capable model fail in the SAME direction — or the INVERSE?**

The answer decides **PROMINENCE**: what goes first-class in SKILL.md vs appendix. When over-firing
is the model's risk, the **MUST-NOT-FIRE list is first-class** — not an afterthought. Fill this
template for every source-distilled skill (shape from raising-resolution §C.4, the canonical
statement):

| | Source's audience | This skill's agent consumer |
|---|---|---|
| dominant error | ___ (the failure the source corrects) | ___ (SAME or INVERSE — argue it, don't assume) |
| corrective bias | ___ (the source's push) | ___ (the skill's push — often the reverse) |
| what to make prominent | ___ (the source's 型) | ___ (MUST-NOT-FIRE first-class when the model over-fires) |

Worked instances across the collection — the inversion is tuned to the consumer's evidence type,
not a mechanical flip:

| Skill | Source corrected | Model's failure | Prominence decision |
|---|---|---|---|
| raising-resolution | human under-deepening | INVERSE: over-elaboration, ritual application | MUST-NOT-FIRE first-class |
| acting-on-hypotheses | human freeze / collect-until-certain | INVERSE: be-bold THEATER | STEP 0 over-firing guard + a dual under-firing guard ("fire even at felt confidence") |
| growing-oss-adoption | author optimism | SAME axis, new form: reciting mechanisms as causes | mechanisms demoted to table-stakes; regime classification first |
| forging-novel-theses | idea-books' missing control loop | evidence-type inversion: a consensus estimator judging 合意非依存 theses | agent consensus = ANTI-signal; advocates forbidden |
| linting-prose | human blindness to LLM-ish prose | the audit skill ITSELF over-flags at machine speed | "name the slots, never the sins" anti-priming |

Both directions can need guards (acting-on-hypotheses keeps both); the table forces you to argue
which is DOMINANT and give it the first-class slot.

## 5. Degrees of freedom — how tightly to specify each rule

Absorbed, with credit, from the Codex default skill-creator (`$CODEX/SKILL.md`, "Degrees of
Freedom"; paths defined once in SKILL.md's routing table):

| Freedom | Form | When |
|---|---|---|
| **High** | prose — goals + constraints; the model picks the path | many valid approaches; judgment is reliable; contexts vary |
| **Medium** | pseudocode or a parameterized script | a preferred pattern exists; deviations are costly |
| **Low** | exact script, "do not modify" | fragile operation, one right answer, errors hard to recover |

Match specificity to fragility: a narrow bridge with cliffs needs guardrails; an open field needs
a direction. The ceiling over all three: **"Default assumption: Claude is already very smart"** —
only add context the model doesn't have
(https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices). Operational
form: per candidate rule ask *"would a frontier model do this right WITHOUT the line?"* — yes →
cut. This test and the command test (§2.1) kill from opposite ends: was it already going to
happen / does it change anything.

## 6. Anti-patterns (TELL → fix)

| Anti-pattern | Observable TELL | Fix |
|---|---|---|
| **Book-summary skill** | lines inform but change no command; section order mirrors the source's chapters | run §2.1 per line; reorganize by DECISION, not by chapter |
| **Unverified-claim laundering** | rules in the author's voice with no grade tag; no source-grade table anywhere | build the §3 table; label paraphrase vs verbatim; DO-NOT-FABRICATE unretrievable lists |
| **Calibration copied unexamined** | the skill exhorts the model in the same direction the source exhorted humans, no inversion table | fill the §4 template; re-decide prominence |
| **10個を並べる static list** | N parallel tips; no gate blocks, nothing loops, nothing can fail | convert to gates + a loop edge — the gate/artifact machinery is a later pipeline step (parent SKILL.md), but the flat list dies HERE, at distillation |
| **Source-worship** | lineage recited ("distilled from X…") while the body executes none of X; provenance as decoration | the lineage line stays only if every body rule traces to a graded source claim; else cut the recitation |
