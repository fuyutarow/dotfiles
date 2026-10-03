# Forge verification ledger — designing-command-line-interfaces

## 0. Function and placement

```text
proposed or observed command surface + named consumers
  -- design | audit --> CLI CONTRACT
  --> implementation-ready interface + positive/negative receipts
```

STOP: one act's meaning, hidden state, reversibility, or delegability → `designing-interactions`.
STOP: one failure's message/locus/recovery card → `designing-developer-diagnostics`.
STOP: effective declaration, authority, integrity, or precedence policy →
`governing-configuration-systems`.
STOP: release identifier comparator/range semantics → `designing-version-schemes`.
STOP: implementation or language runtime choice → `implementing-and-debugging` / `writing-*`.
STOP: using an existing vendor CLI → `driving-*`; launch/distribution → `growing-oss-adoption`.

This is the reusable command-wide protocol joint: invocation grammar, effects, channels, outcomes,
and compatibility in one contract. No sibling owns that complete artifact.

## 1. Source-grade table

The source position is draft `sok/command_line_interface_contracts`, request SHA-256
`d55ad832ab3f2ebdadb25e425d9dfa4e42115a8be29b66b3b92faee5e63a405c`. Its canonical SoK commit is
**PENDING**. Do not represent these rows as a committed corpus authority until it is admitted and committed.

| Rule / use | SoK grade | Skill disposition |
|---|---|---|
| Declare parser profile; reject universal grammar. | CLI-001, limited synthesis | C1 requires target ecosystem/profile. |
| Name `--`, synopsis, and parse-error behavior only in stated POSIX scope. | CLI-002, supported scope | C1 records parser-specific cases. |
| Treat help/version/discovery as profile guidance, not a universal requirement. | CLI-003, qualified | C1 records help/examples only when promised. |
| Allocate stdout, stderr, and exit as distinct observable channels. | CLI-004, limited synthesis | C3–C4 matrix is mandatory. |
| Separate mutable human presentation from stable machine routes. | CLI-005, limited synthesis | C3/C5 records route-specific promises. |
| Require framing, presentation/config independence, and compatibility beyond format name. | CLI-006, limited synthesis | Machine mode requires framing and compatibility. |
| Give prompt/dynamic presentation a noninteractive/TTY-gated path. | CLI-007, qualified | C0/C3 records supported regime behavior. |
| Keep recovery-oriented diagnostics distinct from normal result output. | CLI-008, qualified | C4 maps caller recovery; one card routes to diagnostics. |
| Classify outcomes only when recovery differs; keep numbers product-specific. | CLI-009, limited synthesis | C4 table names retry/next action. |
| State continuation and final aggregation for multi-item work. | CLI-010, limited synthesis | C2 names both behaviors. |
| Do not infer safety from `dry-run`/`force` names. | CLI-011, supported | C2 names fidelity, target protection, acknowledgement. |
| Separate retained partial state, replay precondition, and cleanup bound. | CLI-012, limited synthesis | C2 recovery table names each applicable dimension. |
| Treat subcommands, arguments, flags, overrides, and machine routes as possible compatibility surfaces. | CLI-013, qualified | C5 compatibility table and receipts. |
| Do not invent universal flag/environment/file/remote precedence. | CLI-014, unresolved | Route authority policy to configuration systems first. |
| Require one contract, headings, fields, tables, and red/green checker behavior. | skill-supplied | Structural checker; explicitly not semantic proof. |
| Use SOLO decisions and CITATION-RELAY inventory/receipt evidence. | skill-supplied | Execution model; relays carry locus or raw transcript. |

## 2. Calibration inversion

| Source-side error | Agent-side error | Corrective |
|---|---|---|
| Treating one product convention as a complete protocol. | Copying flags, `--json`, or exit numbers without consumers/effects. | C0–C5 force named contract fields and product-specific limits. |
| Under-specifying an automation route. | Treating a format label as a stable machine contract. | Require framing and compatibility only when a machine mode is promised. |
| Assuming a safety flag supplies safety. | Calling `dry-run`/`force` sufficient analysis. | Write effects, fidelity, bypass, partial state, and retry first. |

## 3. P0 and acceptance status

**P0 semantic battery: PENDING.** At dotfiles HEAD `369ce65a42166dd58702cc92aec2d4fca82fdc96`, the prior
semantic router returned `NO_INDEX` against watermark `f3b4881edee101fa52fe7662641addace38e10c0`.
A fresh index is queued. Ownership placement is a signed draft decision only; no final placement claim may ship until the battery is adjudicated.

Live installation is provisional under the user's immediate-completion direction; acceptance and commit still require the current semantic battery.

**Canonical SoK commit: PENDING.** The source position has not yet been admitted and committed. The
draft retains source IDs and bounded claims solely for forge traceability.

## 4. Verification record

| Check | Receipt |
|---|---|
| Contract behavior | `bun test tests/cli-contract-check.test.ts`: 13 pass, 0 fail, 31 expectations; exit 0. |
| Valid fixture | `bun scripts/cli-contract-check.ts tests/fixtures/valid-contract.md`: exit 0; `C0 PASS`; `CLI CONTRACT: FAIL=0`. |
| Proof of fire | Red tests observe exit 1 for missing C1–C5, visible `{{...}}` table placeholders, non-meaningful fields, and machine mode without framing/compatibility. |
| Script floor | `bun /home/fuyu/dotfiles/agents/skills/writing-bun-scripts/scripts/script-check.ts scripts/cli-contract-check.ts`: exit 0; `FAIL=0 WARN=0`. |
| Skill floor | `bun /home/fuyu/dotfiles/agents/skills/forging-skills/scripts/skill-check.ts .`: exit 0 with no prose-debt warnings. |
| Trigger desk-check | Seven fire and seven no-fire rows are recorded in `tests/triggers.md`; independent adjudication remains pending. |

## 5. Maintenance triggers

- P0 returns ownership evidence or a sibling changes a typed cut.
- The draft source position changes status, is rejected, or receives a canonical commit.
- A command incident exposes an unnamed invocation, effect, channel, outcome, or compatibility boundary.
- The checker accepts a missing/duplicate/placeholder field, an unknown regime, empty table, missing negative receipt, or machine mode without framing/compatibility.
