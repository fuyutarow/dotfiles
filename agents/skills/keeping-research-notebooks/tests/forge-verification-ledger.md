# Keeping research notebooks — forge verification ledger

Date: 2026-10-01. Target: `keeping-research-notebooks` v2610.1.0 (first forge).
Editor-signed spec: eraw, 2026-10-01 (session scratchpad `nbskill/SPEC.md`). Forged by a dispatched Opus executor.

## §0 Function map and existence gate

| Input state | Verb | Owned artifact | Next state |
|---|---|---|---|
| research repo + an act (decide, code, run, record, land) | route the act to its one HOME and one ENTRY | homes/entry tables bound to the repo's own declarations | the act lands where the gate accepts it |
| model code change | edition/revision decision + acceptance gates | ledger line (revision, digest incl. shared-library closure) + green acceptance rows on the measured path | a revision that may be measured |

Ownership void (sibling harvest `012f34.md` §2, voids 2–8): edition/revision discipline; the launcher verb as sole run entry;
the single-committer protocol under jj; the repo-level directory convention; the scratchpad/agent-state ban;
the retention-home map; the run-landing commit ledger. Void 1 (record taxonomy, store operation) belongs to `driving-polysearch`.
The sibling sweep was lexical (`repo-retrieve literal`); no ccc concept battery ran over `agents/skills`. Residual: a void may be
partially covered by a sibling's prose that a lexical sweep missed. The two verifier lenses (§5) read the siblings' boundary text.

EXTEND was rejected: `driving-jujutsu` is SOLO-per-workspace command semantics; `wiring-repositories` stops at wiring;
`validating-experimental-evidence` forbids owning stores; `writing-julia` is language-scoped. Each is cut by PURPOSE / BY ARTIFACT.

Placement (operating-the-harness P3): the skill is repo-agnostic. Repo bindings are discovered (SKILL.md § Bindings).
A repo-local skill for one repo's literal bindings remains possible; it is not part of this forge.

## §1 Sources and grades

| Source | Class | Grade | Used for |
|---|---|---|---|
| `nbskill/c64da2.md` — repo conventions, topology, homes, lifecycle, mechanical vs prose | live repo harvest with loci | author-confirmed (repo files) | homes, path classes, launcher, committer, ids |
| `nbskill/596f8b.md` — edition/revision/shared-library/benchmark checklists | live repo harvest with loci | author-confirmed (repo files) | editions.md §2–§5 |
| `nbskill/012f34.md` — sibling scope map, voids, collisions, budget | sibling SKILL.md reads | author-confirmed for read lines; lexical-only for absence | cuts, voids, budget |
| `nbskill/18a531.md` — polysearch harvest | owned by `driving-polysearch` | pointer only | nothing restated |
| 2026-10-01 incidents (§2) | live session failures | highest grade (observed) | N3, N4, N5 predicates |
| Generic shape of N1–N5 | spec | skill-supplied | gate structure |
| §5 recovery rows for snapshot cap, divergent change | jj semantics per `driving-jujutsu` | third-party (sibling skill) | launch-and-land §5 |

## §2 Incidents (2026-10-01, firedancer) — the evidence the gates encode

| Incident | Cost | Gate |
|---|---|---|
| An edition was rewritten instead of revised; it fell below lineage (parity 1.0 → 0.487; A5 C.14 l4 1.0 → 0.008). | 30–120 min critical path | N5 §1, §4 (b) |
| Conformance ran on fixtures only; a label at every position made it a different task from the official one. | same | N5 §4 (a) |
| An edition was registered in 4 of 5 files; `models.toml` missed; the first official run crashed; launcher dry-run printed `modelCode:null` and exited 0. | same | N3 §2, N5 §2 |
| 21 shared kernels were re-implemented although the shared library had them. | same | N2, editions §5 table |
| Two writers edited one file; agent-side VCS writes raced the committer. | same | N4 |
| Run dirs were committed while in flight; landing was not atomic. | same | N4 §3 step 5 |
| Code lived in the scratchpad and was landed as an external code dir. | same | N1, homes §4 |

## §3 Calibration inversion

| | Source audience (the repo owner's rulings) | Agent consumer |
|---|---|---|
| dominant error | agents scatter artifacts and bypass entry points | SAME direction: the model creates a convenient new home, trusts exit 0, commits its own work |
| corrective bias | one home, one entry, single committer | same push, made mechanical: each gate names an artifact and a deny |
| prominence | rulings in memory | gates N1–N5, the deny column, and MUST-NOT-FIRE for repos without a gate |

Over-firing risk: any commit or any "where does this go" in a plain repo. Guard: MUST-NOT-FIRE row 1 (no gate, no store, no launcher).

## §4 Floor checks

| Check | Result |
|---|---|
| `skill-check.ts <skill dir>` (after fixes) | exit 0; 0 FAIL; 0 WARN (SKILL.md and references prose-debt 0) |
| Proof the prose floor fires on this skill | after the first fix pass, one 121+-char reference sentence produced `references: 1 prose sentences >120 chars`; split, then 0 |
| Build-order verify one-liner | prints nothing missing |
| Description length | 744 chars; name+description charge 770 |
| Spec deviation: description length | spec asks about 600. The desk-check failed fire rows F5 and F8 without `shared checkout` and `conformance / acceptance` tokens; trigger correctness outranks the target. Decided by the forger, recorded here |

## §5 Verification fleet

Two read-only Sonnet verifiers, refutation-first, disjoint lenses. Static review only; no live trigger eval and no forward test ran.

| Lens | Result | Resolution |
|---|---|---|
| Spec fidelity + repo-agnostic + self-contradiction | 0 blocker, 5 major, 15 minor | all applied, except as noted below |
| Trigger desk-check + sibling cuts | 21 rows: 18 hold, 3 fail (F5, F8, CF2); 4 major, 5 minor | all applied; rows re-desk-checked by the editor after the description edit |

Major findings and fixes:

| Finding | Fix |
|---|---|
| N5 row dropped registration completeness, rows (a)–(d), diagnostics rule, `--worktree` | N5 cell now carries them |
| Dry-run table invented fields (`status`, digest, commit, cause) | reduced to `ok`, `modelCode`, slug, revision; others "if printed" |
| "cause id resolves to a hypothesis" stated as a launcher check (unverified in the harvest) | "launcher exit status if it checks; else read by hand" |
| Partial firedancer edition-name ban list | replaced by "obey the repo registry header's list" |
| N1 "inside a declared path" contradicts records, memory, large bytes | N1 predicate per class |
| No cut against `driving-git` on shared-checkout commits (F5 lost to it) | routing row added; description token `agents committing to a shared checkout` |
| LINEAGE collided with validating EV4 and the LAW claimed "regression" | token renamed PREDECESSOR ROW (acceptance guard); LAW defers the claim to EV4; eligibility per EV1–EV3 |
| N5(a) overlapped EV0/EV2; F8 fired validating only | description token `conformance / acceptance rows`; cut row splits existence/green (here) from what rows assert (there); F8 is a co-fire |
| `driving-polysearch` teaches `run --exec` directly, racing N3 | cut row: `run --exec` is the primitive a launcher wraps; use the launcher where one exists |

Minor fixes: memory is never a claim; teeth folded into each row; N4 "only" and cadence restored; crashed-commit row checks divergence first;
staged-set check marked unverified under jj; retention-homes binding rows added; "SOLE home" labels changed to "detail";
acceptance runs need a resource envelope; launcher-specific behaviors phrased conditionally; "models" removed from minted ids;
`repo-retrieve` fallback; incident numbers removed from triggers.md; blob row dropped; size-cap row softened; task-state "no declared home";
narrative lines removed; documents row added to homes; governing cut covers negative results; validating reciprocal row narrowed.

Open items (owner-named deferrals):

| Item | Owner |
|---|---|
| `driving-git` has no reciprocal row; brief limited edits to five siblings | dotfiles editor |
| `wiring-mise-tasks` has no reciprocal row; same reason | dotfiles editor |
| `driving-polysearch` should say the launcher wraps `run --exec` (its function map, P3 row, and a trigger row) | polysearch-rs session |
| jj-era equivalent of a staged-diff check before landing is unverified | the commit task's owner |
| The launcher exits 0 with `modelCode:null` on an unknown slug; fix plus negative test | the repo's launcher owner |
| F3 solo-tier waiver does not apply; but no live `run_eval` or installed-session trigger test ran | next reforge |

## §6 Ship receipts and F4 budget

| Step | Receipt |
|---|---|
| Collection before admission | `LISTING 74 skills, 64906 chars`; ceiling 65242; headroom 336 |
| Collection after admission | `LISTING 75 skills, 65676 chars`; growth 770 = this skill's charge; pointer rows charge 0 |
| F4 answer | raise ceiling 65242 → 66012 by exactly the growth; `raises[]` entry dated 2026-10-01 names voids 2–8 and the incidents |
| `skill-check.ts --budget … agents/skills/*/` | exit 0; collection WARN count unchanged at 107 across 57 skills |
| Sibling floors after pointer rows | wiring-repositories, driving-jujutsu, validating-experimental-evidence: 0 WARN; writing-julia and governing-research-documentation: pre-existing WARNs unchanged, dated PROSE-DEBT waivers in their ledgers |
| `mise -C /home/fuyu/dotfiles run link:skills` | exit 0 |
| `~/.claude/skills/keeping-research-notebooks` | symlink to the dotfiles dir; `SKILL.md` resolves |
| Commit | not made by the forger; the editor commits after verification |
