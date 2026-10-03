# Forge verification ledger

## 2026-09-23 — placement and signed function map

Input: requested distillation of the admitted, bounded executable-specification-boundaries SoK.
Its metadata status remains `draft`; this skill does not upgrade it to `stable` or a universal result.
Owner: root editor; scope includes a new design skill and reciprocal cuts in existing skills.

`domain predicates + consumers → place invariants → TYPE CONTRACT + checks → implementation handoff`.
Stop: each scoped invariant has a representation, enforcement boundary, residual, and a check or explicit gap.
Design-only requests stop with a plan; implementation requests continue under their existing authorization.

| Candidate owner | Decision |
|---|---|
| implementing-and-debugging | Retain change intent/root-cause/regression. Pure contract design can precede any code change. |
| writing-rust / writing-typescript | Retain language APIs and idioms. Neither owns cross-language invariant placement. |
| governing-configuration-systems | Retain configuration authority, effective input, integrity and merge semantics. |
| practicing-tiger-style | Retain consequence/risk/resource/recovery ledger. Type design also applies to small APIs. |
| refactoring-code | Retain behavior-preserving transformations and their oracles. |
| designing-type-contracts | Create a reusable design owner with an implementation handoff. |

No pattern-catalog skill or separate FCIS/ROP/RAII skill is added.
Construction mechanisms remain language-owned; the design skill owns which obligation they must meet.

## Existing-corpus search

`repo-retrieve battery -p agents/skills --limit 3`, three queries:

- `type as specification schema first parse dont validate invariant typestate domain modeling`
- `型設計 仕様 型 スキーマ 不正な状態 パース 境界`
- `contract validation construction paths deserialization runtime static enforcement`

Verified index: `14e3d54c1b614bcb33a7cec705d7209e92f80b4c`, 2026-09-23T08:52:07.162Z.
Relevant hits: writing-python/references/validation.md:15; configuration skill C4/C5; Workers type-integrity rules.
Read the candidate owners' actual manuals before the placement decision; search scores are not absence evidence.

## Source grades and operational delta

Canonical source: soks position `urn:uuid:01a0cd74-0db5-7631-a93d-b6a4a73e1b19`.
Ledger: `urn:uuid:01a0cd74-0db5-7631-a93d-b6a346b7565b`, admitted at `b49b070`.
Resolve in the local soks corpus by UUID; historical context is retained here, not in operational rules.
No new external primary material was consulted for this distillation.

| Rules | Source claims | Grade / transformation |
|---|---|---|
| D1–D3, enforcer and boundary | ESB-001–009, Y001–002 | skill-supplied operationalization of the bounded synthesis |
| Parsed output and preserved predicates | ESB-005–007 | source-grounded principle; path audit/freshness table is skill-supplied |
| D4 derivation choice | ESB-Y003 (uncertain) | skill-supplied conditional heuristic; preserve incumbent authority |
| D5 negative case plus positive control | TYP-015 and ESB-Y001 | skill-supplied verification protocol, not a universal proof method |
| Effect residuals | ESB-010–011, Y005 | synthesis-grounded distinction; runtime choice remains contextual |
| No defect percentage from compile checks | ESB-012–013, Y004 | preserve the original estimands; no performance claim for this skill |
| Exercises A–D | local construction | constructed tests, not measured production failures |

The source's corrective bias is to make facts explicit in types and boundaries.
The agent risk is both under-modeling and overclaiming from names, casts, code generation, or architectural slogans.
Prominence: concrete rejected cases, all construction routes, and residuals; no mandatory maximal type machinery.

## Verification

Baseline collection: 71 skills; 65,130 listing characters against ceiling 65,242.
Baseline warnings: 111 across 59 skills. No ceiling increase is planned.

| Check | Observed result |
|---|---|
| `bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/designing-type-contracts` | Exit 0; no structural or prose-debt warnings for the new skill. |
| `uv run --no-project --with pyyaml python .../skill-creator/scripts/quick_validate.py .../designing-type-contracts` | Exit 0, `Skill is valid!`; used the installed Codex system validator. |
| `mise run lint:skills-floor` | Exit 0; 72 skills, 64,707 listing characters, ceiling unchanged at 65,242. |
| `git diff --check` | Exit 0. |
| `mise run link:skills` | Exit 0; Codex discovery root and Claude skill link resolve to this directory. |
| Catalog completeness | The pre-commit catalog check caught the missing new entry; added it to `agents/skills/README.md`. |
| New-skill and TypeScript prose floors | Both have zero warnings; unchanged broad sibling debt remains in their dated waivers. |

The aggregate listing shrank by 423 characters while adding one skill.
The final collection has 110 warning records across 58 other skills; this is not a collection-wide cleanup claim.
Live selection in a newly started client session was not observed; link resolution does not prove auto-triggering.
The commit hook's Node-dependent task needed the invocation-scoped `MISE_NODE_VERSION=22.23.2` override.
No global toolchain or repository tool configuration was changed; `mise run lint:ts` passed with that override.

## Independent audit and forward exercises

Separate Terra agents handled placement, semantic/trigger review, new-skill exercises, and baseline exercises.
The baseline used commit `14e3d54` only; the new-skill arm could not read tests or this ledger.
Neither arm saw the expected observations or another arm's answers.
These are bounded design-answer checks, not compiler tests, randomized experiments, or a quality benchmark.

| Exercise | New-skill observation | Baseline comparison |
|---|---|---|
| Same-typed transfer roles | Identified swappable positions; offered named arguments before role wrappers; neither proves recipient intent. | Also identified distinct roles; led with wrappers and included generated-client tests not specified by the prompt. |
| Mutable list and permission snapshot | Distinguished preserved shape from mutation and revocation; checked decode/reload/alias paths. | Also separated mutation and expiration. No demonstrated outcome advantage. |
| Old mobile client and removed field | Named independent deployment and planned compatibility fixtures; did not claim execution. | Also rejected build-only compatibility. No demonstrated outcome advantage. |
| Pure checkout plus shell crash | Separated payment confirmation from type shape and delivery recovery. | Also named runtime obligations. No demonstrated outcome advantage. |

Editor disposition: retain the explicit design owner and corrected sibling rules for consistency and discoverability.
The comparison supports modest process clarity, not a general improvement in agent correctness or speed.

| Audit finding | Disposition |
|---|---|
| Source metadata is draft although the ledger called the survey completed | State admitted/bounded and preserve draft status explicitly. Draft does not erase its prior semantic review. |
| Verification ledger still said pending during audit | Replaced with observed commands, results, and untested live-selection limit above. |
| Potential sibling collisions and shortened triggers | Independent review found no additional collision; core Rust and implementation tasks retained. |
| Python EXACTLY ONCE persisted outside its reference | Editor updated LAW, PG3 and checklist in the same change; all now share preserved-predicate semantics. |

Desk-check: 6 fire and 8 near-miss rows in `tests/triggers.md` resolve to the intended owners.
Typos/annotations stay language-local; configuration/Tiger/refactor retain their own artifacts.
Rust-specific crate APIs stay in `writing-rust`; no crate list was moved into this design skill.

## Maintenance

Revisit when a new invariant-design owner appears, a construction bypass is observed, or a language guarantee changes.
Do not broaden a local compiler/parser test into a field-wide defect-prevention claim.
