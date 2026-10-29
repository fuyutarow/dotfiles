# AGX Sol actual-pick provenance (2026-10-21)

## Result

The saved choice audit attributes the inspected recent Sol starts to **Jev**, not
to the potential `sol-low` static fallback. In the bounded sample of the 20 most
recent `started` records whose row begins `sol-`, all are `sol-medium`: 17 fresh
Jev picks, 0 fresh fallbacks, and 3 continuations. This is an observed-path
breakdown, not a repeat of the fleet-wide row count.

## Receipt mechanism

`route()` writes `source`, optional Jev probabilities, and a route-usage snapshot
through `setPendingPickAudit` (`tools/agx-worker/src/next/route.ts:128-173`). The
next `started` event receives that pending audit (`tools/agx-worker/src/next/store.ts:39-49,191-205`). A `started` event separately retains its row and optional `continues`
parent (`tools/agx-worker/src/next/store.ts:51-78`). Thus `pick_audit.source` is
the saved decision provenance for a fresh run; `continues` is the receipt for a
row-pinned continuation, not a new pick.

## Observed bounded sample

Source: `/home/fuyu/.local/state/agx-next/records.jsonl`, inspected 2026-10-21
by projecting only `id`, timestamp, row, continuation parent, `pick_audit` source,
probabilities, and route-availability metadata, then taking the last 20 Sol
`started` events. No ticket, brief, project content, or vendor transcript was read.

| Saved-path class | Starts in the 20-record sample | Rows | Warranted reading |
| --- | ---: | --- | --- |
| Fresh `pick_audit.source = jev` | 17 | all `sol-medium` | Jev selected the recorded row. This is direct saved decision evidence. |
| Fresh `fallback-*` source | 0 | — | No inspected fresh Sol start attributes itself to fallback. This is not proof about older or uninspected starts. |
| `continues` parent set, no new audit | 3 | all `sol-medium` | The row was resumed. The parent chain below identifies its original fresh Jev choice. |
| Fresh source missing/unknown | 0 | — | Within this bounded sample, no fresh Sol start lacks an audit. |

Representative saved records:

| Run ID | Started at (UTC) | Saved provenance | Relevant terminal fact |
| --- | --- | --- | --- |
| `24f433f9-a877-4517-87e6-ef514ba6e17e` | 08:10:40.818864155 | Fresh `sol-medium`; `source=jev`; audit probabilities include `sol-medium=0.52`, `sol-high=0.21`, `sol-low=0.03`. | Ended 08:33:37.400767025 with `verify-failed`; it is selection evidence, not an accepted outcome. |
| `9706e3fb-bab9-49c0-9c6a-af81db910fe7` | 08:34:09.1009471 | `sol-medium`, `continues=24f433f9-a877-4517-87e6-ef514ba6e17e`; no new pick audit. | Ended 08:56:59.589346813 with `no-change`; it is a continuation of the prior Jev choice, not a `sol-low` fallback or a new `sol-medium` pick. |
| `a7608cae-0588-4777-93a2-4e01484b28ae` | 07:45:08.154656436 | Continuation of fresh-Jev `e93b088c-d56f-4173-889a-d9452ac0f653`. | Row pin only. |
| `f5ea24c5-cc33-41ca-8983-65c1b885f488` | 07:53:01.667172201 | Continuation of fresh-Jev `b2085586-b1ec-46f8-8867-e09de1dd646d`. | Row pin only. |

The specified continuation sidecar is present at
`/home/fuyu/.local/state/agx-next/runs/9706e3fb-bab9-49c0-9c6a-af81db910fe7/9706e3fb-bab9-49c0-9c6a-af81db910fe7.json`;
its SHA-256 at inspection was
`2fed1bf42eb4648829e10bf4d20b528c1933c3ad145555dbe13601f0c35a0cfc`.

## What the receipts do and do not establish

- They establish that the sampled `sol-medium` fresh starts were Jev-attributed,
  and that the three sampled continuations inherited `sol-medium` from their
  Jev-picked parents. A static `sol-low` fallback cannot be declared their cause.
- The audit schema retains only `source`, `probabilities`, and `usage_snapshot`
  (`tools/agx-worker/src/next/store.ts:39-43`). The inspected sidecar also has no
  capability tag, roster path, or roster digest. Required capabilities and exact
  effective roster are therefore **UNKNOWN** for these saved decisions.
- The audit probability vector supports “Jev supplied this choice distribution”; it
  does not demonstrate that the selected model was optimal, nor that a task's
  accepted-result throughput or cost was superior.
- Terminal outcomes for the two representative parent/continuation receipts are
  `verify-failed` and `no-change`, respectively. They must not be counted as
  evidence of Sol suitability or optimality.

## Bounded next action

For a claim about the whole 67-Sol completed-receipt population, join the history
worker's count to each fresh run's `pick_audit.source` and each continuation's
parent chain, then keep outcome/acceptance analysis separate. Retain a roster
digest/path and required capability tags at dispatch if future provenance needs to
explain Jev's inputs without reading task text.
