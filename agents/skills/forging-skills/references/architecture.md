# Architecture — file topology and structural invariants (pipeline step 3)

> **Scope**: HOW a skill's content is laid out across `SKILL.md` / `references/` / `scripts/` /
> `assets/` — the SHAPE decisions. Stated once, for this whole file: **ALL numeric budgets and
> loading mechanics — the three disclosure stages, the description-listing character cap, the
> SKILL.md body line budget, compaction carry-over — are OWNED by `operating-the-harness`
> (`references/commands-and-skills.md`). Read that first; every budget here is a pointer there,
> and a hardcoded budget number in this file is a bug.** What content EARNS a line is distillation
> (step 2); what the harness DOES with the files is `operating-the-harness`. This file decides only
> WHERE each earned line lives and what structure makes the topology survive maintenance.

## 1. Progressive disclosure as a design act, not a mechanic

The harness loads in stages (mechanics: see the owner above). Architecture is deciding what
DESERVES each stage:

| Layer | Carries | Admission test |
|---|---|---|
| `SKILL.md` body | ONLY the precedence-setting core: LAW, gates, pipeline, MUST-NOT-FIRE + routing, execution-model summary, the reference index | would skipping this line at invoke time cause a wrong action? NO → exile it |
| `references/*.md` | everything ARGUED — rationale, technique, schemas, case ledgers; one topic per file, one level deep (nested chains get half-read) | does it load only when its pipeline step runs? |
| `scripts/` | TWO admitted classes: deterministic floors (owned in §5) — run, never read into context; and task executables, bundled when the same code would otherwise be rewritten per invocation (the Codex default's `rotate_pdf.py` example; the plugin's repeated-work signal — every test subagent writing the same helper script is the bundle signal) | deterministic AND reused across invocations? |
| `assets/` / templates | files the skill SHIPS into deliverables | copied out, never loaded |

- The index at the end of SKILL.md is a lazy-loading contract: `| File | Covers | Read when |`,
  Covers at section level so the model routes without opening the file.
- Taxonomy + exclusion rule absorbed from the Codex default skill-creator (`$CODEX`):
  `scripts/` / `references/` / `assets/`, and **no README, CHANGELOG, INSTALL, or QUICK_REFERENCE
  inside a skill dir** — a skill's only readers are the model and the interpreter; meta-docs are
  dead weight at every load.
- Inversion test, run both ways: a reference the model would read on EVERY invocation is core —
  inline it; a SKILL.md section read on only SOME invocations is argued — exile it.

## 2. ONE HOME PER CONCEPT — the load-bearing invariant

Every rule has exactly ONE arguing home; every other occurrence is a one-line pointer. This is THE
drift-prevention mechanism of the collection — apply it within the skill AND across siblings.

- **Declare ownership in the section header**, using the word SOLE/owner, so a maintainer landing
  mid-file knows whether they may edit substance or only the pointer. Precedents:
  raising-resolution ("§C.6 is the SOLE home" of source-grading; "§C.7 (SOLE owner)"),
  acting-on-hypotheses' verb-seam files, and systematizing-knowledge's SOLE-owner reference
  headers.
- **The "restated for completeness" trap.** A convenience mirror of another section's rule WILL
  drift — the next edit updates one copy. Only two legal states: make it a pointer, or sync it in
  the SAME edit and mark it a deliberate seam. There is no third state.
- **Reciprocal pointers + seam contract.** Where two files (or two skills) share a boundary: both
  sides name each other; the cut's canonical phrasing has ONE owner; and the seam carries a
  maintenance note — *agrees in SUBSTANCE, do NOT diff for byte-identity; re-diff only if either
  side's question clause changes* (the raising-resolution §C.7 pattern). This blocks drift AND the
  opposite failure: a cleanup pass "deduplicating" a deliberate seam.
- Cross-skill pointers go by SKILL NAME, never by path into another skill's dir. Sole exception:
  the external default skill-creator machinery, addressed via the `$PLUGIN` / `$CODEX` roots
  (defined once in SKILL.md's routing table; references point).

## 3. Atomic build order — no dangling pointer, ever

- SKILL.md, every reference it indexes, and every script it invokes ship in **ONE commit**. A
  pointer that resolves tomorrow is a lie today.
- The SKILL.md header carries a **literal shell verify one-liner** — every house skill has one,
  in a code fence adjacent to (not inside) the version blockquote (§5 dual-reader bar).
  Shape (adapt names):
  `for f in a b c; do test -f references/$f.md || echo MISSING $f; done; test -x scripts/check.sh || echo MISSING check.sh`
- Add **negative checks** for deliberately retired/consolidated files — raising-resolution's
  anti-resurrection form: `test -f references/action-loop.md && echo STALE-FILE || echo OK`. A
  retired file that silently reappears re-creates a second arguing home (§2).
- The frontmatter `references:` list (acting-on-hypotheses / forging-novel-theses) is a HOUSE
  extension — the key is absent from the official allowed set, so `quick_validate.py` flags it as
  an error. Treat that one failure as expected on those two skills, or omit the key entirely
  (this skill omits it). The canonical dangling-pointer checks are the build-order one-liner
  above plus `scripts/skill-check.ts` — never the frontmatter list.

## 4. Durability contracts — quarantine what rots

- Time-sensitive facts — model names, benchmark numbers, version-pinned features, tool SOTA —
  live in **ONE dated reference file**, and the SKILL.md header BANS them everywhere else ("a
  hardcoded model name/benchmark in the body is a bug"). Precedents: proving-theorems' durability
  contract (body names NO model, all fast-moving facts under one dated heading);
  designing-presentations' quarantined-numbers split (contested numbers + named studies in
  references with citations; body stays durable).
- Version header `> **Version**: v{yymm}.y.z (date)` whenever the skill was verified against a
  dated external state and will be reforged — the scheme is OWNED by `grenza-doc-discipline`.
  Book-distilled skills carry a lineage line instead; durability-contract skills date the
  snapshot file, not the body.

## 5. Floor scripts vs semantic gates

- Anything greppable gets a `scripts/` floor check that runs **FIRST**, before any semantic audit,
  and declares "THIS IS NOT A SEMANTIC CHECK" in its own header — stating what it cannot catch
  (precedents: forging-novel-theses `gate-check.ts`; this skill's `scripts/skill-check.ts`). The
  script owns the floor, judgment owns the ceiling, and the skill states the boundary between them.
- **Never spawn an agent to run a regex** — script-over-agent is precedence
  (`linting-prose`); agents add noise, not coverage.
- **Prove the gate fires** (absorbed from `linting-prose`): inject a known-bad
  input, watch the script FAIL, revert. Once at build, again after any script edit. A gate never
  seen red is decoration, and a green from it is theater.

**The dual-reader prose bar** (SOLE home; added 2026-07-24 after the two-sided void — ledger).
A skill has two readers: the executor model and the human auditor. The mechanical floor is
`scripts/skill-check.ts`'s prose-debt WARNs (>120-char prose sentences ×3+, version header >3
lines, table cells >400 chars — WARN tier, measurement; enforcement moment = forge exit, F1).

- SCOPE (measured, pilot 2026-07-24 — over-generalizing is the anti-pattern): full atomization
  (one clause per rule row + artifact + dated 出自 pointer; narratives exiled to the ledger)
  is INDICATED for SKILL.md gate/LAW/rule tables showing accretion pathology (append-only
  version chains, narrative-in-cell). It is NOT applied to: references' argued prose;
  ≥3-way shared-object seam cells; index/Covers rows; mature EN bodies without accretion.
- The header verify one-liner lives in a code fence BELOW the version blockquote (a `>` block
  stays ≤3 lines; §3's mandate is satisfied by adjacency, not embedding).
- "Touch it, clear it": ANY commit that edits a skill's SKILL.md leaves that skill at
  prose-debt WARNs 0, or writes a dated PROSE-DEBT waiver + queue position in its ledger
  (a 2-line waiver is cheap; the loophole of "it was only a seam edit" is not). Distinct
  from F3's solo-tier waiver. Corpus-wide sweeps are NOT mandated.

## 6. Language architecture

- English body; Japanese trigger doublets in the description (the user prompts in Japanese and
  description matching is lexical — WHICH doublets is a triggering decision, owned by that
  pipeline step, not here).
- When the skill defines vocabulary, add a `## Language` section pinning the **stable tokens**
  that stay fixed even inside Japanese prose (LAW, gate, fire/no-fire, solo/fan-out/barrier,
  skill-defined terms) — systematizing-knowledge / acting-on-hypotheses precedent. Tokens are
  identifiers, not prose; translating one forks the concept.
- Deliberately bilingual sections (e.g. Japanese gate names in an English file) get a one-line
  style note declaring the mixing intentional — so a later cleanup pass doesn't "fix" the seam
  into monolingual drift.

## 7. Anti-patterns (architecture-scoped)

| Anti-pattern | Tell | Fix |
|---|---|---|
| **Two arguing homes** | the same rule argued (not pointed) in two files — drift guaranteed | ONE owner with a SOLE declaration; demote the twin to a pointer; deliberate seams get the do-not-diff note (§2) |
| **Dangling reference** | index or `references:` names a file that does not exist | atomic build order + verify one-liner (§3) |
| **Kitchen-sink SKILL.md** | everything inline; every invocation pays for every rule | body = precedence-setting core only; exile argued content to `references/` (§1) |
| **Orphan reference** | file on disk the index never names — it will never load | every file gets an index row with a Read-when cell, or is deleted |
| **Resurrected file** | a retired/consolidated file reappears in a later edit — a second home reborn | negative STALE-FILE check in the verify line (§3) |
| **Config-as-prose** | "always run X before commit" written as skill prose | hard enforcement lives in hooks/settings (`operating-the-harness`); the skill may point at the hook, never substitute for it |
