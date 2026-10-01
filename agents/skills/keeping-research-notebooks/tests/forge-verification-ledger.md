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
| `skill-check.ts <skill dir>` | FILLED AT SHIP (§6) |
| Build-order verify one-liner | FILLED AT SHIP (§6) |
| Description length | 687 chars; name+description charge 713 |

## §5 Verification fleet

FILLED AFTER VERIFY.

## §6 Ship receipts and F4 budget

FILLED AT SHIP.
