# Forge verification ledger — directing-research-sections

This is the F3 ledger for the initial v2608.1.0 forge. Append on reforge; do not overwrite.

## Scope and source

The signed `research-control-plane-v2` function map assigns this skill one granted section's bid,
charter, local admission, run intent, local learning, and declassified handback. It explicitly excludes
programme mutation, executor receipts, and terminal process audit.

## Findings and resolution

| Date | Lens | Finding | Resolution |
|---|---|---|---|
| 2026-08-03 | specification | Local charter could be confused with programme mandate. | Separate ownership and schemas in `references/visibility-and-authority.md`. |
| 2026-08-03 | authority | Human method feedback could become programme control. | Quarantine schema pins `AUTHORITY: NONE`; upward raw transport is forbidden. |
| 2026-08-03 | provenance | Director could author observation after deciding a run. | `RUN_INTENT v2` and receipt ownership are split in every relevant artifact. |
| 2026-08-03 | acceptance repair | Bid entry was contradicted by mandate-only entry wording; review was incorrectly upward-returnable. | Split BID/DIRECT gates; made review local-only and narrowed upward packets. |
| 2026-08-03 | interface repair | Bid, signal, and reopen packets lacked programme intake identity/fence fields. | Added exact bid contract and intake-compatible declassified signal/reopen fields. |
| 2026-08-03 | semantic migration | Local candidate selection and the one-bet route remained only in legacy broad direction. | Added `references/local-admission-and-testing.md` as the sole one-mandate home. |
| 2026-08-03 | wire repair | Bid contained a self-digest and receipt wire payload was absent. | Removed the self-digest and added executor-owned `RUN-RECEIPT-v2.md`. |
| 2026-08-03 | signal repair | Signal enums diverged from the frozen cross-role contract. | Replaced lifecycle and declassification enums with the frozen wire values. |
| 2026-08-03 | scientific-progress reforge | Control/proposal activity could be mistaken for research progress, and the Director could accumulate execution roles. | Added `references/scientific-progress.md`, distinct role handoffs, receipt-grounded learning, and a bounded live ledger. |
| 2026-08-03 | acceptance repair | Typed exact blockers could be read as requiring learner/Director work; charter could float free of the lease. | Made blocker an explicit no-progress terminal branch and bound charter to lease locator/digest. |

## Mechanical record

- Structural floor: `bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/directing-research-sections`.
- Boundary check: `git status --short -- agents/skills/directing-research-sections`.
- 2026-08-03 result: structural floor exit 0 with no `FAIL` or `WARN` output.
- 2026-08-03 result: boundary check reported only `?? agents/skills/directing-research-sections/`.
- 2026-08-03 acceptance-repair result: structural floor exit 0 with no `FAIL` or `WARN` output.
- 2026-08-03 migration result: structural floor exit 0 with no `FAIL` or `WARN` output.
- 2026-08-03 scientific-progress reforge: structural floor exit 0 with no `FAIL` or `WARN`; `git diff --check` exit 0. No local checker was added because the runtime owns checker grammar.
- Expected warnings: none. No waiver is claimed.

## 2026-08-03 — streaming SEARCH/LEARN North Star

- Frozen source: `STREAMING-SEARCH-LEARN-CONTRACT.md`, SHA-256
  `ab1492eb2da873b3a2ed7cfcb409acb298a3f8b072ff9326d9cd246265e7d4d2`.
- One section remains WIP=1; independent sections may stream concurrently. Receipt and learner
  events wake their next transition immediately with no global/all-Directors barrier.
- The priority is `DIRECTOR_COMMIT > LEARNING > EXECUTION > BUILD > SEARCH`; Supervisor and verifier
  waits are forbidden on the reversible candidate path.
- Trigger desk-check: 10 FIRE / 13 near-miss NO-FIRE rows; no live trigger/model eval was run.
- Structural/prose floor exited 0 with no output. Cross-skill signal `cmp` exited 0.

## 2026-08-04 — cross-section learning-bus semantic amendment

- Frozen source: `CROSS-SECTION-LEARNING-BUS-AMENDMENT.md`, SHA-256
  `11e83b8630f3e519e2a4c82d35d3b0a59459196ac214eb6567d793e3df02dc49`.
- The exact source join is learner proposal plus source Director commit to one
  `SECTION_TRANSFER_PACKET`. The exact recipient join is immutable subscription plus packet to
  delivery, independent `ADOPT|REJECT|DEFER`, and a distinct local commit for `ADOPT` only.
- Source and recipients never wait for delivery, acknowledgement, Supervisor, verifier, quorum, or
  global join. Fan-out and replay remain propagation diagnostics and earn no SEARCH/LEARN credit.
- Canonical packet-body `cmp` against the frozen amendment passed. Cross-skill `SECTION_SIGNAL`
  `cmp` passed at SHA-256 `ecbd816b12e5fe7dca8f3078820603b134e7d65116c12d9deaa60e7c359026f2`.
- Trigger desk-check: 12 FIRE / 18 near-miss NO-FIRE rows. No live trigger/model evaluation ran.
- Structural/prose floor exited 0 with no output. This slice defines semantic assets only; it does
  not implement or test the later V0 broker runtime.

## 2026-08-04 — live-session grounding, dominance, and measurement repair

- Live failures showed that a Section could admit from stale knowledge, duplicate known work, scale before
  a cheap discriminator, or count invalid measurement as science.
- Added an ephemeral role-distinct `GROUNDING-PACKET`, exact Goal→Programme→Issue→Mandate→Charter→Grounding
  lineage, whole-cycle WIP=1, known-result/value/dominance admission fields, and receipt-linked scale releases.
- `FAIL|UNKNOWN` measurement is instrumentation repair, not SEARCH/LEARN; reporting adds grounding latency,
  duplicate rejection, invalid-measurement, stale-work, and scale-release metrics. Fixed parameter/seed
  sweeps remain execution, not search.
- Verification pending this reforge's build-order and structural/prose floor commands; no model verifier,
  link task, runtime, or scientific run was used.

## 2026-08-04 — grounding/scale repair verification

- Build-order existence check: PASS; all indexed references, templates, trigger set, and ledger exist.
- `bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/directing-research-sections`:
  PASS, exit 0, with no FAIL or WARN output.
- `git diff --check -- agents/skills/directing-research-sections` passed. No PROSE-DEBT waiver is used.

## 2026-08-04 — authority-order regression repair

- Candidate genesis/search now requires current Charter+Grounding exact lineage, never a mandate alone.
- `SECTION_DIRECTOR_COMMIT` alone releases minimal-to-escalated scale within an already Programme-released
  mandate. When both blocks apply, both releases are required. Known-result disposition is normalized to
  `NOVEL_GAP|REGISTERED_REPLICATION|KNOWN_DUPLICATE|RETRACTION_RISK`.
- Build-order existence check, `skill-check.ts`, and scoped `git diff --check`: PASS with no FAIL/WARN.

## 2026-08-04 — v2 wire and authority-chain alignment

- Restored `SECTION_MANDATE -> SECTION_CHARTER -> GROUNDING_PACKET`; Charter no longer cites Grounding,
  while Grounding exact-joins Charter before genesis, search, or admission.
- Aligned specification, intent, receipt, proposal, and commit assets around measurement-contract evidence,
  `RUN_SCALE`, escalation classes, and explicit scientific versus instrumentation-repair learning.
- `REJECT`, `DEFER`, and instrumentation repair earn no LEARN. Trigger regressions cover ordering and failed
  measurement handling. Verification pending this reforge's floor and build-order commands.

- Build-order existence check, `skill-check.ts`, and scoped `git diff --check`: PASS with no FAIL/WARN.
