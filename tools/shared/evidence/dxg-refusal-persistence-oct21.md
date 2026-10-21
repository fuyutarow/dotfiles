# DXG refusal evidence — Oct. 21

Reader: admission-guard maintainer; holds the runner contract; internal English.

## Conclusion

The saved artifacts establish three admission-time refusals based on sampled
`D` state plus a `dxg` wait channel. They do not establish that any sampled
process remained in `D`, that a later clean `ps` reading was an admission-time
reading, or that the later reading makes a prior refusal a false positive.

The user reports the refusals within 11:40–12:10 JST. The three retained denial
outputs have no individual timestamp, so that window cannot be assigned to a
particular PID from saved evidence.

## Saved refusal records

| Refusal | Saved wording and identity | Retained capture | Establishes | Does not establish |
| --- | --- | --- | --- | --- |
| hit6 | `DENY GPU live dxg stall pid=2917178 state=D wchan=dxgvmb_send_sync_msg`; exit 69. No TID or process identity is saved. | `hit6-impl/registered.log` retains the denial and `/proc/2917178/{stat,wchan}` evidence paths. | The guard sampled PID 2917178 as `D` with that wait channel before refusing this admission. | Raw `/proc` contents, capture time, start-time identity, D transition, duration, and a later persistence reading are missing. |
| ktm | `PID3556808,stateD,wchan=dxgvmb_send_sync_msg`; the report says the corrected replay was denied 69 and a readback still showed the same pair. No TID or process identity is saved. | `ktm-lookup/result-v1.md` and `report-v1.md` retain the report and the `/proc/3556808/{stat,wchan}` loci. | A denial was reported from a sampled PID/state/channel pair; the report separately records one same-pair readback. | Raw capture bytes, timestamps for either read, start-time identity, D transition, and continuous persistence are missing. |
| cm | `DENY GPU live dxg stall pid=3537711 state=D wchan=dxgvmb_send_sync_msg`; exit 69. No TID is saved. The saved report identifies it only as another-workspace Julia process; its command is intentionally not reproduced. | `cm-shrink/acceptance.log` retains the denial; `result-blocked-r1.md` retains the locus and redacted identity description. | The guard sampled that PID/state/channel before Julia for this request launched. | Raw `/proc` bytes, capture time, start-time identity, D transition, duration, and a later persistence reading are missing. |

## Separate saved observation and reported later readings

- `hit6-impl/gpu-stall-resume.txt` is a separate timestamped snapshot:
  `2026-10-21T02:58:13.938Z` (11:58:13.938 JST), PID 3473749, process name
  `julia`, `D`, and `dxgvmb_send_sync_msg`. It contains no TID and is not
  linked by saved evidence to one of the three denials above.
- The user reports clean `ps` readings without `D` at 11:41:52 and 12:09:31
  JST. No stdout, target PID set, command options, or exit status for either
  reading is retained in the permitted artifacts, nor is either linked to one
  particular denial. They are reported observations, not evidence of
  admission-time absence.
- No saved artifact records a first/last `D` transition or an elapsed time in
  `D`. Process age, if later observed, must not be relabelled as a D duration.
- The user also reports at most five concurrent GPU jobs. The current policy
  ceiling is six jobs, but no saved refusal capture reports actual concurrent
  occupancy; neither fact proves causation or persistence.

## Guard behavior in frozen reviewed source (not historical execution evidence)

This section freezes its source review at agent-resource-run 1.5.11, commit
[`1aa68817406d38b5af6a915f57417308a6875225`](https://github.com/fuyutarow/dotfiles/blob/1aa68817406d38b5af6a915f57417308a6875225/tools/agent-resource-run/package.json#L1-L10).
At that source cut, `gpuAdmissionRefusal` scans live `/proc`, requires `D`,
reads `wchan`, then rereads `stat`; a wake, exit, or non-`D` reread does not
refuse ([agent-resource-run.ts:304-369](https://github.com/fuyutarow/dotfiles/blob/1aa68817406d38b5af6a915f57417308a6875225/tools/agent-resource-run/src/agent-resource-run.ts#L304-L369)).
The reread at this source cut is a race check, not a temporal persistence
threshold or retry.

For `--check-only`, that source cut runs the guard once immediately and returns
denial exit 69 ([agent-resource-run.ts:625-636](https://github.com/fuyutarow/dotfiles/blob/1aa68817406d38b5af6a915f57417308a6875225/tools/agent-resource-run/src/agent-resource-run.ts#L625-L636)); a successful
check emits `ADMIT ... check-only` ([lines 661-663](https://github.com/fuyutarow/dotfiles/blob/1aa68817406d38b5af6a915f57417308a6875225/tools/agent-resource-run/src/agent-resource-run.ts#L661-L663)).
For a normal GPU launch, it runs once more in scope entry before spawning the
command ([scope-entry.ts:36-87](https://github.com/fuyutarow/dotfiles/blob/1aa68817406d38b5af6a915f57417308a6875225/tools/agent-resource-run/src/scope-entry.ts#L36-L87)).
The documented contract at that source cut calls both admission-time checks, not
continuous Z/D monitoring, and assigns `DENY` exit 69 ([README.md:63-95](https://github.com/fuyutarow/dotfiles/blob/1aa68817406d38b5af6a915f57417308a6875225/tools/agent-resource-run/README.md#L63-L95)).

Therefore, the frozen reviewed source supplies no automatic wait-and-retry or
duration rule that can turn these historical snapshots into persistence facts.
It also does not make a later clean `ps` result evidence that an earlier sampled
refusal was false positive.

## Evidence limits

This report intentionally does not infer a driver cause, job overlap, process
identity beyond retained text, a recovery event, or missing `/proc` captures.
It does not claim that the current guard ran for any historical record beyond
the saved denial outputs. Any new two-sample persistence threshold belongs to
the separate implementation evidence, not to these historical artifacts.
