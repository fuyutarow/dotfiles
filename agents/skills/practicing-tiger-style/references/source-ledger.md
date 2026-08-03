# Source ledger

> **Scope / SOLE declaration:** This is the SOLE home for pinned sources and each
> source-derived rule's grade, regime, limit, and disposition. It does not establish
> LLM effects; `evidence-and-limits.md` owns that question.

## Pinned primary sources (observed 2026-08-03)

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

Emit the pre-advice table in `SKILL.md` one input atom at a time. Each retained row below is one
rule, with its exact immutable or dated-primary locus; never transfer source-local truth into a
universal disposition.

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

Apache-2.0 covers the cited TigerBeetle repository; independent paraphrase is preferred.
Before substantial redistribution, inspect `LICENSE`, `NOTICE`, per-file notices, and trademark
use; this is not legal advice or an endorsement claim. Prior-art artifacts inform shape only:
no prose, checklists, examples, or report formats are copied—especially the no-license
`M64GitHub/tiger-style` artifact. Community additions are **third-party**, never TigerBeetle rules.
