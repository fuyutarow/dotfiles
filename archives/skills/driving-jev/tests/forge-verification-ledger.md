# driving-jev — forge and verification ledger

## Function and existence gate

```text
bounded text/JSON + semantic decision need
  --design and execute an atomic typed judgment-->
raw Jev response + explicit caller policy
  --> act / review / clarify / fallback / stop outside this skill
```

Ownership void: existing `driving-*` skills operate generative agent/model CLIs. None owns a
non-generative typed judgment boundary, primitive selection, probability relay, or caller-side
abstention policy. TypeSafe's official skill owns application integration and live cookbook
discovery but ships no house runner or cross-agent operating contract. `driving-jev` therefore has
a distinct input, artifact, stop, and PURPOSE cut.

## Source and provenance

| Source | Class / grade | Distilled contribution |
|---|---|---|
| TypeSafe official skill and live docs, fetched 2026-09-21 | OFFICIAL DOCS / official-doc-confirmed | System One boundary, primitive meanings, API schema, response semantics, current model facts, jaggedness |
| local `driving-claude` / `driving-codex` family | local house corpus / author-confirmed | bounded relay, perishable-fact quarantine, driving-skill sibling shape |
| `scripts/jev.ts`, contract, and fixtures | skill-supplied | safe direct invocation, explicit custom-endpoint acknowledgement, exit recovery classes |
| J0–J5 | constructed | agent-oriented gates; engineered, not vendor-measured |

Primary sources are listed in `references/model-and-api.md`. No community wrapper claim is treated
as authoritative; the bundled runner targets the official API directly.

## Calibration inversion

| | Vendor audience | Agent consumer |
|---|---|---|
| dominant error | developers may treat generative LLMs as the only AI primitive | INVERSE risk: a capable agent over-delegates reasoning, exact code, and action authority to a cheap model |
| corrective bias | expose fast typed judgments as programmable primitives | constrain Jev to bounded judgment and keep policy/control/side effects outside |
| prominence | patterns and app integration | `JUDGMENT-NOT-AGENT`, J0 FIT, J3 ABSTAIN-PATH, and MUST-NOT-FIRE first |

## CLI contract decision

The runner supports only shell-pipeline, CI, and agent regimes. It intentionally has no human
pretty mode, batch DSL, prompt construction flags, API-key flag, automatic retries, or hidden model
default. Request JSON is the provider contract and stdout is a lossless machine relay. The frozen
contract is `references/cli-contract.md`.

## Fire / no-fire desk-check

| Query | Expected |
|---|---|
| 「Jev を使って、この問い合わせが返金要求か判定して」 | fire `driving-jev` |
| “Use TypeSafe Choice to route these tickets, with an uncertain fallback.” | fire `driving-jev` |
| 「Codex が全部読む前に、200件を意味判定で絞りたい」 | fire `driving-jev` |
| “My Jev Noul keeps returning 0.5.” | fire `driving-jev` |
| 「この判定を Jev に渡すべきか普通のコードか決めて」 | fire `driving-jev` |
| “Call `/v1/systemone` and preserve usage/model.” | fire `driving-jev` |
| “Have Claude inspect this repository and write the fix.” | no-fire → `driving-claude` |
| 「Codex にこの diff を深くレビューさせて」 | no-fire → `driving-codex` |
| “Count ERROR lines and compare dates.” | no-fire → deterministic code |
| “Add the TypeSafe JavaScript SDK to my production app.” | co-fire vendor `typesafe-ai`, implementation, TypeScript; `driving-jev` only if the judgment boundary is unsettled |
| 「Jev の API キーをブラウザに埋め込んで」 | no-fire as invocation; refuse credential placement and route server-side integration |
| “What is Jev?” | no-fire; direct answer |

Description-only desk-check: all rows resolve from name + description. The closest race is
TypeSafe's vendor skill; the PHASE/PURPOSE cut leaves agent/shell operation here and product
integration there. Existing generative driving skills include their own binary/vendor terms and do
not lexical-match Jev; reciprocal description edits would add standing cost without resolving a
demonstrated race, so they are intentionally deferred.

## Verification record

F3 independent-agent verification is waived at the solo tier for this bounded procedural skill:
the current task policy does not authorize subagent dispatch. The same lenses ran serially.

| Lens / check | Result |
|---|---|
| self-contradiction | PASS: JUDGMENT-NOT-AGENT, CODE-OWNS-POLICY, and the stop rule agree across gates, examples, and routing |
| architecture / dangling pointers | PASS: build-order files exist; every reference/script/test has one index home |
| sibling cuts / description desk-check | PASS: 6 fire and 6 near-miss rows resolve from name+description; vendor/generative/deterministic cuts are typed |
| bloat / perishable-fact quarantine | PASS: `skill-check.ts driving-jev` emits no FAIL or WARN; current facts live only in `model-and-api.md` |
| CLI fixture behavior | PASS: `bun test agents/skills/driving-jev/tests/jev.test.ts` — 7 pass, 0 fail, 24 assertions |
| Bun script floor | PASS: `script-check.ts scripts/jev.ts` — FAIL=0 WARN=0 |
| strict TypeScript typecheck | PASS: tsgo with `--ignoreConfig`, Bun types, strict, exact optional, and unchecked-index flags — no diagnostics |
| CLI contract floor | PASS: C0 consumer regimes recognized; `CLI CONTRACT: FAIL=0` |
| Codex quick validator | PASS: `quick_validate.py` through `uv run --with pyyaml --no-project` — “Skill is valid!” |
| collection budget | PASS: 69 skills, 63,355 listing characters; ratchet pinned to the measured total |
| deployment links | PASS: `mise run link:skills`; both `~/.agents/skills/driving-jev` and `~/.claude/skills/driving-jev` resolve to this source |

No live Jev request was sent during the forge. Provider behavior was exercised through a loopback
fixture, avoiding an undeclared credential, spend, or external-data transfer. The official model
and API facts were instead fetched from the primary docs listed in `model-and-api.md`.

## Staleness triggers

Reforge when the stable alias moves, the API/request/response schema changes, official model limits
or data terms change, a new local Jev runner becomes canonical, a real call reveals a missing
failure class, or a sibling begins claiming TypeSafe/Jev operation.
