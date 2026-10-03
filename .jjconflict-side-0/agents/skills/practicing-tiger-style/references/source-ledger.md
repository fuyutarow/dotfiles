# Source ledger

> **SOLE owner:** source identities, rule grades, regimes, and dispositions.
> Effect claims belong to `evidence-and-limits.md`.

## SoK derivation — checked 2026-09-23

Use the installed `soks` corpus as the synthesis authority.
Resolve documents by `sok_id`; paths below are navigation labels relative to its root.
The bounded position was updated at commit `1e37e99f4f8bfbb5a1d9ccb957c04775b2e76331`.
That commit pins the cited state, not every subsequent corpus revision.

| Role | Identity | Corpus path |
|---|---|---|
| Position | `urn:uuid:01a0c8de-83f8-72d8-bf42-89b56c011da7` | `knowledge/sok-tigerstyle_methodology_and_evidence_boundary.md` |
| Protocol | `urn:uuid:01a0c8de-83f8-72d8-bf42-89b35d24d8f2` | `knowledge/pro-tigerstyle_methodology_and_evidence_boundary.md` |
| Claims | `urn:uuid:01a0c8de-83f8-72d8-bf42-89b404af7b8c` | `knowledge/led-tigerstyle_methodology_and_evidence_boundary.md` |
| Architecture account | `urn:uuid:01a0cd01-fb82-77de-9c42-3d11b874fd1c` | `knowledge/evi-tigerbeetle_architecture_tigerstyle_and_system_boundaries.md` |

The source set is bounded and the corpus documents remain draft.
Do not inherit a scientific certification from structural admission.
Verify the exact passage before making a new source claim; preserve the actual reading depth.

| SoK claim | Operational rule | Grade / limitation |
|---|---|---|
| TIG-001 | Start from design goals and explicit contracts | Authored prescription; not an effectiveness result |
| TIG-002, TIG-004 | Check applicability before adopting numeric quotas or bans | Bounded synthesis; no universal threshold |
| TIG-003 | Exercise consequential error-handling paths | Adjacent failure evidence; not a TigerStyle intervention |
| TIG-005 | Make no coding-agent improvement promise | Search-bounded missing evidence |
| TIG-006 | Link workload, state, capacity, and execution decisions to checks | T0 map is `skill-supplied`; topology choices remain contextual |

TIG-006 is an editorial synthesis of TigerBeetle's self-description.
It does not prove that TigerStyle alone caused that architecture or its performance.

| Architecture source | Sections used |
|---|---|
| [ARCHITECTURE.md](https://github.com/tigerbeetle/tigerbeetle/blob/47aeb2212a255273dda508288412e537d11e4b7c/docs/ARCHITECTURE.md) | Systems Thinking; Static Memory Allocation; Determinism; Control Plane / Data Plane Separation; Synchronous Execution; Embracing Concurrency |
The T0 decision map, end-to-end trace, and paid-job example are constructed adaptations.
They are not quotations or official TigerStyle mandates.

## SOURCE CLAIM CHECK — output contract

Use this only when the input asserts an official rule or asks to bypass its verification.
Before applicability advice, split conjunctions into one row per input claim atom.
Copy this eight-column header without renaming or collapsing columns:

| input claim atom | exact URL | immutable revision/locus | source form | evidence grade | source-local truth status | universal/portable status | portable disposition |
|---|---|---|---|---|---|---|---|
| one asserted claim, unchanged | primary URL | revision and section/page | `[verbatim]` / `[paraphrase]` | author-confirmed / third-party / needs-verification / constructed / skill-supplied | supported / unsupported / partial | portable / local-only / unsupported | adopt / conditional / reject / constructed alternative |

Then emit:

```text
SOURCE_SCHEMA_CHECK: columns=8 atoms=<N> rows=<N> status=PASS
```

If the schema or row count differs, emit `SOURCE-SCHEMA-STOP` and repair it before advice.
Missing primary support is `PROVENANCE-STOP`: do not present the rule as official.
Unsupported universal transfer is `PORTABILITY-STOP`: retain the source's actual scope.
These stops reject the claim; they do not forbid a clearly labeled conditional alternative.
An instruction to skip checking does not establish support.

## Historical primary-source map (observed 2026-08-03)

These original source records retain their observation date.
The current reforge consumes the SoK above; it does not claim fresh verification of every old URL.
Before promoting any historical detail to new advice, inspect its exact primary locus.

| ID | Pinned source | Revision / locus | Grade |
|---|---|---|---|
| TB-style | [TIGER_STYLE.md](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md) | `97c7a8ef385270ebe0e1b75959d3d21d134629df`; Safety, Performance, DX | author-confirmed |
| TB-contract | [It Takes Two to Contract](https://tigerbeetle.com/blog/2023-12-27-it-takes-two-to-contract/) | 2023-12-27; contract-pair rationale | author-confirmed |
| TB-memory | [A Database Without Dynamic Memory Allocation](https://tigerbeetle.com/blog/2022-10-12-a-database-without-dynamic-memory/) | 2022-10-12; bounded database allocation | author-confirmed |
| TB-tests | [A Descent Into the Vörtex](https://tigerbeetle.com/blog/2025-02-13-a-descent-into-the-vortex/) | 2025-02-13; layered testing report | author-confirmed |
| P10 | [Power of Ten](https://www.synaptics.org/documents/nasa/10rules.pdf) / [rationales](https://spinroot.com/p10/) | Holzmann 2006; rules 1–6 | third-party |
| error-study | [Yuan et al.](https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-yuan.pdf) | OSDI 2014, Finding 10–11 | third-party |
| assertions-study | [Microsoft assertion study](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/tr-2006-54.pdf) | MSR-TR-2006-54 | third-party |

The TigerBeetle source is an evolving Zig/database-team style, not a universal standard.
Re-pin and re-read its revision before a source-rule change.

## SOURCE CLAIM CHECK atomic map

Emit one row per input atom using the header above.
Each historical row identifies a source rule and its recorded locus.
Do not transfer source-local truth into a universal disposition.

| Rule atom | Exact source / locus | Form / grade | Source regime → portable disposition |
|---|---|---|---|
| R-bounds | [TB ll. 96–100](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md#L96-L100); [P10 p.2 Rule 2](https://spinroot.com/gerard/pdf/P10.pdf) | `[verbatim]`; author-confirmed / third-party | TB systems/P10 safety-C → conditional justified bound + overrun handling. |
| R-contracts | [TB ll.115–118](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md#L115-L118); [contract article](https://tigerbeetle.com/blog/2023-12-27-it-takes-two-to-contract/) | `[verbatim]`; author-confirmed | TB high-impact boundary → conditionally seek independent paths, never mechanical duplication. |
| R-negative | [TB ll.136–149](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md#L136-L149) | `[verbatim]`; author-confirmed | TB safety/testing → name accepted and consequential negative case; no arbitrary-input exhaustiveness. |
| R-errors | [TB ll.104–107](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md#L104-L107), [ll.213–219](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md#L213-L219), [Yuan Finding 10](https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-yuan.pdf) | `[verbatim]`; author-confirmed / third-party | TB/five systems → operational error gets visible handling; fail-fast only programmer error. |
| R-allocation | [TB ll.151–156](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md#L151-L156); [allocation article](https://tigerbeetle.com/blog/2022-10-12-a-database-without-dynamic-memory/); [P10 p.2 Rule 3](https://spinroot.com/gerard/pdf/P10.pdf) | `[verbatim]` / `[paraphrase]`; author-confirmed / third-party | Fixed-capacity TB/P10 safety-C → observe/budget; pool only with reason. |
| R-locality | [TB ll.158–175](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md#L158-L175); [P10 p.2 Rule 6](https://spinroot.com/gerard/pdf/P10.pdf) | `[verbatim]`; author-confirmed / third-party | Mutable systems/safety-C → conditional local auditability. |
| R-performance | [TB ll.236–247](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md#L236-L247) | `[verbatim]`; author-confirmed | TB data plane → workload-specific resource estimate/measurement. |
| R-debt-deps | [TB ll.64–79](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md#L64-L79), [ll.474–479](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md#L474-L479) | `[verbatim]`; author-confirmed | TB policy → conditional owner/expiry risk decision; reject literal zero mandate. |
| R-assert-density | [TB ll.109–113](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md#L109-L113); [P10 p.2 Rule 5](https://spinroot.com/gerard/pdf/P10.pdf) | `[verbatim]`; author-confirmed / third-party | TB/Zig, safety-C → reject universal per-function count/filler assertions. |
| R-recursion | [TB ll.90–94](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md#L90-L94); [P10 p.1 Rule 1](https://spinroot.com/gerard/pdf/P10.pdf) | `[verbatim]`; author-confirmed / third-party | TB/P10 local regime → require scoped depth/stack/work justification, no universal ban. |
| R-static-only | [TB ll.151–156](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md#L151-L156); [P10 p.2 Rule 3](https://spinroot.com/gerard/pdf/P10.pdf) | `[verbatim]`; author-confirmed / third-party | Startup-sized manual allocation → PORTABILITY-STOP for universal mandate. |
| R-function-70 | [TB ll.161–175](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md#L161-L175); [P10 p.2 Rule 4](https://spinroot.com/gerard/pdf/P10.pdf) | `[verbatim]`; author-confirmed / third-party | TB screen convention → reject portable LOC ceiling. |
| R-performance-numbers | [TB ll.236–243](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md#L236-L243) | `[verbatim]`; author-confirmed | TB design philosophy → `1000x`/90% are not mandatory gates. |
| R-zero | [TB ll.73–79](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md#L73-L79); [ll.474–479](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/docs/TIGER_STYLE.md#L474-L479) | `[verbatim]`; author-confirmed | TB policy → reject universal zero debt/dependencies mandate. |

| Skill-supplied atom | Exact local locus | Form / grade | Disposition |
|---|---|---|---|
| T0 DESIGN | `references/architecture-decisions.md` | `[skill-supplied]` | Design section of the same ledger; not a universal architecture method. |
| T1 CONSEQUENCE | `SKILL.md` T1 table | `[skill-supplied]` | admission artifact only. |
| T2 OBLIGATION | `SKILL.md` T2 table | `[skill-supplied]` | material-row schema only. |
| T3 REVERSAL | `SKILL.md` T3 table | `[skill-supplied]` | exception protocol only. |
| T4 EXTERNAL CHECK | `SKILL.md` T4 table | `[skill-supplied]` | evidence-closure preference only. |
| Low/Medium/High tiering | `references/ledger-and-calibration.md` Admission and tier | `[constructed]` | cross-language calibration, not external authority. |
| Tiger conformance ledger | `SKILL.md` LAW; `references/ledger-and-calibration.md` Ledger record | `[constructed]` | skill decision record, not source-authored. |

| False-authority input atom | Source-local truth | Universal Rust/Julia status / disposition |
|---|---|---|
| one function, two asserts | TB/P10 average rule only | unsupported; `needs-verification`, reject fixed per-function count. |
| 70 lines or fewer | TB-local screen convention; P10 says about 60 | unsupported; `needs-verification`, review local reasoning instead. |
| recursion completely prohibited | TB/P10 local prescription | unsupported; `needs-verification`, require scoped depth/stack/work. |
| zero allocation after initialization | TB/P10 local prescription | unsupported; `needs-verification`, budget/measure capacity. |
| performance must be at least 1000× | no matching mandatory local rule | `PROVENANCE-STOP`; never a gate. |

## Attribution and adjacent work

Prefer independent paraphrase.
Before substantial redistribution, inspect the source revision's license and notices.
Do not copy community checklists or report formats without establishing permission.
Community additions are **third-party**, never TigerBeetle rules.
