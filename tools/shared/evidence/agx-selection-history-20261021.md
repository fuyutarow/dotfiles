# AGX selection history — 2026-10-21

## Result

The recorded history does **not** show Sol being chosen almost always.  It does
show a Sol plurality in today's static slice and a small, volatile Sol majority
among live runs.  The latest-200 selection cohort is instead Terra-heavy.
These are worker-row records, not coordinator/display-model observations.

| scope | denominator | Sol rows | Terra rows | Luna rows | other rows | finding |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| all retained runs | 7,339 | 3,443 (46.9%) | 310 (4.2%) | 3,171 (43.2%) | 415 (5.7%) | no Sol majority |
| 2026-10-21 JST | 424 | 211 (49.8%) | 159 (37.5%) | 53 (12.5%) | 1 (0.2%) | largest family, not a majority |
| latest 200 by `started_at` | 200 | 72 (36.0%) | 118 (59.0%) | 9 (4.5%) | 1 (0.5%) | Terra majority |
| live, first read | 8 | 5 (62.5%) | 2 (25.0%) | 1 (12.5%) | 0 | Sol majority, small/volatile |
| live, later read | 6 | 3 (50.0%) | 2 (33.3%) | 1 (16.7%) | 0 | still small; runs ended during collection |

`today` is the JST interval `[2026-10-20T15:00:00Z,
2026-10-21T15:00:00Z)`.  The all-run row counts come from `agx worker stats`
and agree with the `ls --all --json` population (7,339).  The 200-run cap was
applied after sorting by `started_at` descending; it is a cap, not a claim that
the CLI's display order is newest-first.

## Recent worker receipts (actual execution provenance)

The 200 selected index rows had 193 receipt files and 7 receipt-less records
at collection time.  The latter are not assigned an actual model.  For the 193
receipts, the recorded worker model and effort were:

| selected row | actual receipt model | effort | n / 193 |
| --- | --- | --- | ---: |
| `terra-high` | `gpt-5.6-terra` | high | 105 |
| `terra-max` | `gpt-5.6-terra` | max | 12 |
| `sol-medium` | `gpt-6.1-sol` | medium | 66 |
| `sol-low` | `gpt-6.1-sol` | low | 1 |
| `luna-high` | `gpt-6-luna` | high | 7 |
| `luna-medium` | `gpt-6-luna` | medium | 1 |
| `astra-medium` | `gpt-6-astra` | medium | 1 |

Thus actual receipt models are Terra 117/193 (60.6%), Sol 67/193 (34.7%),
Luna 8/193 (4.1%), and Astra 1/193 (0.5%).  Every available receipt's
`row`, `model`, and `effort` agrees with the table; this is the evidence for
the recent cohort's actual worker, not an inference from a coordinator model.

## Provenance classes and evidence limits

| class requested by the question | observed count | provenance status |
| --- | ---: | --- |
| selected row | 200 | recorded in the run index |
| explicit requested model / effort | UNKNOWN | no separate request-origin field in inspected index/receipt metadata |
| default/auto decision | UNKNOWN | no selection-reason field recorded |
| explicit row/model decision | UNKNOWN | no selection-reason field recorded |
| continued session | 54/200 | `continues` is non-null |
| temporary `DISPATCH_ROSTER_PATH` override | UNKNOWN | no effective-roster fingerprint/override field recorded |
| actual model/effort | 193/200 | receipt metadata (`model`, `effort`) |
| actual model/effort | UNKNOWN for 7/200 | no receipt file at collection |

No ticket bodies, transcripts, project content, or report `raw` strings were
used to fill these UNKNOWNs.  In particular, a row's presence cannot establish
whether it was a normal default, an explicit request, or an override.

`dispatcher_session` is captured, but it is only an opaque identifier.  The
latest 200 contained four such identifiers with counts 76, 76, 42, and 6.
There is no captured dispatcher-repository identity, so the dotfiles subset is
**UNKNOWN**; it was not inferred from `cwd` or workspace paths.

## Representative receipt records

| UTC start | run ID | row → actual model / effort | index outcome | evidence availability |
| --- | --- | --- | --- | --- |
| 2026-10-21T08:34:09.1009471Z | `9706e3fb-bab9-49c0-9c6a-af81db910fe7` | `sol-medium` → `gpt-6.1-sol` / medium | `no-change` | receipt + report path; 1 verify entry |
| 2026-10-21T07:22:35.28096923Z | `c79ab4fe-011b-4fff-b68c-9fd47eaff2a7` | `terra-high` → `gpt-5.6-terra` / high | `refused` | receipt + report path; 1 verify entry |
| 2026-10-21T07:04:43.979836258Z | `b9803b01-34e8-44e0-b7b3-d6740f8c8c48` | `luna-high` → `gpt-6-luna` / high | `no-change` | receipt + report path; 1 verify entry |
| 2026-10-21T07:12:37.13223183Z | `3b93d64b-a382-4802-a835-14e54d6964ab` | `astra-medium` → `gpt-6-astra` / medium | `no-change` | receipt + report path; 2 verify entries |

For all four, `selection_reason` and effective-roster fingerprint are
**UNKNOWN**: neither field exists in the inspected metadata.

## Outcomes are not an optimality result

For the 193 receipt-bearing recent runs, index outcomes were `ok` 82,
`refused` 62, `no-change` 28, `verify-failed` 18, `capacity` 2, and `timeout`
one.  The index had verify entries for 191/200, all-present-and-passing entries
for 146/200, judgment records for 59/200, and report paths for 193/200.

Those are availability/status observations, not normalized task-quality,
cost, or suitability measurements.  Tasks, continuations, verification gates,
and stopping causes differ; a refusal, kill/loss, error, or failed verification
does not establish model incompetence.  No controlled outcome/cost comparison
was performed here, so policy compliance or selection frequency must not be
called optimality.

## Reproduction (metadata only)

```sh
# index population, cap, JST slice, and selected rows
agx worker ls --all --json |
  jq 'sort_by(.started_at) | reverse | .[0:200] |
      map({id, started_at, row, state, outcome, continues, dispatcher_session})'

# For each selected id, only read receipt metadata when it exists:
# /home/fuyu/.local/state/agx-next/runs/$id/$id.json
jq '{run_id, row, model, effort, outcome, receipt_file}' \
  /home/fuyu/.local/state/agx-next/runs/<id>/<id>.json
```

Tool/version observed: `agx-worker ls v8.0.1`.  This report is an evidence
snapshot of local state during the 2026-10-21 collection window; live counts
can change as workers finish.
