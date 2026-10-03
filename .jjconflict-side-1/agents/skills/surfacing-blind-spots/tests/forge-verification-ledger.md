# Surfacing-blind-spots forge verification ledger — 2026-07-30

## Trigger and existence decision

The collection had operators for research-frame direction, thesis generation, present-state
inspection, forward-bet testing, and agent topology. It had no one-home operator whose input was
one existing artifact and whose only output was premise excavation with human-tacit provenance.

**Decision: create a sibling.** The runtime cut is stable:

- change or act on the artifact → an incumbent sibling;
- expose what one existing artifact presupposes, without generating answers → this skill.

`/dig` is a design source, not a collection sibling. The new skill does not package or reproduce
the entire command.

## Source grades

| Source | Grade | What entered | What did not enter |
|---|---|---|---|
| `dig.md` at commit `693d9b5` | author artifact | context-first read, bounded questioning, two-level depth, integration | effectiveness or completeness claims |
| Serverworks `/dig` article | third-party N=1 narrative | human participation and explicit experiment caveats | causal or general efficacy |
| Ward (1994) | peer-reviewed source observation | warning that unconstrained imagination can retain default category structure | proof of the seven slots |
| Smith, Ward, Schumacher (1993) | peer-reviewed source observation | avoid seeding tacit questions with generated solution examples | a universal ban on examples |
| Reiter-Palmon, Murugavel (2018) | peer-reviewed, limited task/sample | separate problem construction from solution generation | a strong general creativity effect |
| Doshi, Hauser (2024) | peer-reviewed, task-bounded experiment | agent volume is not independent tacit evidence; preserve diversity caveat | general homogenization across all work |
| seven-slot taxonomy, four axes, packet schema | skill-supplied | operational architecture and validator contract | any claim that the taxonomy is empirically complete |

The detailed source-observation / design-inference split lives only in
`references/evidence.md`.

## Calibration inversion

| | Source audience | Agent consumer |
|---|---|---|
| dominant error | stop at the first answer or ask a broad checklist | produce a polished checklist, simulate the human, and call it complete |
| corrective bias | question more deeply | one typed breadth sweep, then bounded depth with provenance |
| prominence | assumption map and iterative interview | **OPEN — NON-EXHAUSTIVE**, `UNELICITED`, no generation, strategic stop |

## Architecture sign-off

| Function | One home |
|---|---|
| LAW, entry gate, procedure, packet schema | `SKILL.md` |
| source claims and limitations | `references/evidence.md` |
| detailed sibling cuts and handoffs | `references/boundaries.md` |
| deterministic structural floor | `scripts/blind-spot-check.ts` |
| trigger regression | `tests/triggers.md` |
| forge provenance and receipts | this ledger |

No README, quick reference, asset, or second arguing home ships.

## Mechanical regression contract

`tests/blind-spot-check.test.ts` must prove:

1. a complete seven-slot packet with human provenance passes;
2. stdin and transparent `UNELICITED` depth pass with a warning and
   `HUMAN-UNAVAILABLE`;
3. a shallow checklist that merely mentions vocabulary fails;
4. omitted slot coverage fails;
5. multiple primary homes fail while a separate cross-tag remains legal;
6. a scalar score fails even when four axis columns remain;
7. model-simulated human provenance fails;
8. one-level depth fails;
9. an ordinary `OPEN` mention does not satisfy the open-set residual;
10. a non-strategic stop and thesis-generation section fail;
11. unknown options and missing paths exit 2.

## Semantic verification contract

A structural PASS does not establish that:

- the surfaced premises are surprising or important;
- the questions are genuinely contrastive or decision-changing;
- a human answer is true;
- the seven slots cover reality;
- the packet improves research creativity;
- the handoff owner will use the packet well.

Those remain judgment and forward-test surfaces. The script header and final verdict line state
this ceiling explicitly.

## Verification receipts

Record exact commands and outputs here after the initial forge and after every checker edit.
Do not replace receipts with an agent's bare PASS.

### Initial forge

- focused tests:
  `bun test agents/skills/surfacing-blind-spots/tests/blind-spot-check.test.ts`
  → `12 pass`, `0 fail`, `40 expect() calls`.
- checker proof-of-fire:
  `bun agents/skills/surfacing-blind-spots/scripts/blind-spot-check.ts -`
  with a shallow three-line checklist on stdin → exit `1`,
  `Blind-spot packet: FAIL=9 WARN=0`.
- writing-bun script floor:
  `bun agents/skills/writing-bun-scripts/scripts/script-check.ts agents/skills/surfacing-blind-spots/scripts/blind-spot-check.ts`
  → `floor: FAIL=0 WARN=0 (files=1)`.
- skill mechanical floor and prose-debt count:
  `bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/surfacing-blind-spots`
  → exit `0`, no output; structural failures `0`, prose-debt warnings `0`.
- frontmatter validation:
  `uv run --with pyyaml --no-project python /home/fuyu/.codex/skills/.system/skill-creator/scripts/quick_validate.py agents/skills/surfacing-blind-spots`
  → `Skill is valid!`.

The first focused run was `11 pass / 1 fail`: the stdin test passed a string directly to
`Bun.spawnSync`. The harness was corrected to pass `Bun.file(fixture(stdin))`; no validator rule
was weakened.

## F3 status

The fire/no-fire set is `tests/triggers.md`. This is a standard contested-sibling skill; no
solo-tier waiver applies. All initial mechanical receipts are present. Semantic creativity and
live trigger behavior remain bounded by the stated limits rather than inferred from green floors.

## 2026-07-30 adversarial hardening (v2607.2.0)

An independent packet audit found structural false passes. The checker now rejects:

- `HUMAN:<owner>` without an attestation locus and explicitly simulated answers behind a valid label;
- non-contrastive questions, inert decision branches, and shallow one-level content;
- lowercase solution/thesis headings, exhaustive-coverage claims, and questions-before-reading;
- unbounded search budgets and packet-level scalar scores;
- ownerless handoffs and handoffs that leak selection/solution/commit verdicts.

It also distinguishes honest negative statements such as “not all blind spots were found,” and allows
fully `UNELICITED` depth to stop at a genuinely exhausted finite budget.

Verification:

- `bun test agents/skills/surfacing-blind-spots/tests/blind-spot-check.test.ts`
  → 19 pass, 0 fail, 66 assertions;
- shared Bun script floor → `FAIL=0 WARN=0`;
- `skill-check.ts` → exit 0, prose-debt warnings 0;
- Codex `quick_validate.py` → `Skill is valid!`.

These tests falsify known forms of packet theater. They still do not establish surprise, importance,
human authenticity, content completeness, or improved research creativity.

## 2026-08-02 — existing-transfer audit boundary

An existing transfer candidate or `MAPPING-BREAK` may now be swept through OBJECT, RELATION, REGIME,
and OBSERVATION to expose omitted roles, assumed invariants, missing boundaries, and absent target-side
signals. The packet neither constructs nor repairs a map, and it cannot declare target truth or design
a test. Those operations remain with `forging-novel-theses` and `acting-on-hypotheses`. The profile is
constructed house guidance; no cited creativity or `/dig` source is represented as evidence that the
four-slot transfer audit is exhaustive or effective. No checker or test script changed.
