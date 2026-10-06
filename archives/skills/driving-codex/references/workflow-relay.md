# Luna workers — background codex-run from the main loop

Read when fanning out luna workers. The durable rules are in `SKILL.md` (C1–C4 and the relay
pattern). This file holds the copyable parts. Model names here are examples; check them against
`model-catalog.md` and probe them (C1) before use.

## Receipt (`codex-run` stdout, schema 1)

| Field | Meaning |
|---|---|
| `outcome` | `ok` · `codex-failed` · `refused` (codex never started) · `timeout` |
| `codex_exit` | codex's own exit status; absent when codex never started |
| `usage` | sum of every `turn.completed` usage: input, cached input, output, reasoning output |
| `last_message` | the `-o` file: codex's final message only |
| `elapsed_s`, `started_at` | wall time of this call |
| `why` | the reason, on every outcome other than `ok` |
| `receipt_file` | the same receipt on disk, for the main loop to compare |

Exit status: 0 ok, 1 codex-failed, 2 refused, 3 timeout. Fields are additive; `schema` changes on
removal or a change of meaning.

## Fan-out from the main loop (the Workflow tool is not used)

Write one brief file per worker, then start each worker as a background Bash call:

```text
codex-run --choice luna-high --sandbox read-only --cd <repo> --prompt-file <brief-1.md>
codex-run --choice luna-high --sandbox read-only --cd <repo> --prompt-file <brief-2.md>
```

Each call re-invokes the coordinator when it exits; read its receipt line. Parallel local runs
take P7 envelopes: `codex-run … --emit-envelope /abs/run/job-1.resource.json --job-id job-1`, then
`agent-resource-run --manifest /abs/run/job-1.resource.json -- codex-run …` (Linux).

The 2026-10-05 relay pattern (a sonnet agent() running codex-run inside a Workflow) is retired with
the Workflow tool. Its one lesson stays: hand the receipt line through as a string, never as fields
an agent fills one by one (a relay once invented `codex_exit`).

## Verifier trial — Sonnet vs Codex on the same evidence (C4)

Use before promoting a Codex model to a standing role (for example, the default adversarial
verifier). One trial is one frozen evidence set and one frozen brief, judged by both arms.

| Step | Rule |
|---|---|
| Freeze | Write the brief and the evidence file list once. Both arms read the same files. |
| Arms | Sonnet arm: the Agent tool, `subagent_type:"sonnet-high"`. Luna arm: `codex-run --choice luna-<effort>` with the same brief, asking for the same FINDINGS JSON in its last message. |
| Blind | Neither arm sees the other's output, the expected defects, or which arm it is compared with. |
| Seeded defects | Plant a few known defects in a copy of the evidence when ground truth is otherwise unknown. Score recall on them. |
| Measure | Per arm: confirmed findings, false findings, seeded-defect recall, tokens (receipt `usage` / harness usage), wall time. Quota drain from ccusage on both ledgers. |
| Adjudicate | SOLO in the main loop. A disagreement is the signal to inspect; agreement is not proof. |
| Decide | Promote only on the measured table. Record it, dated, in `model-catalog.md`. |

Keep N small and honest: two or three evidence sets per arm, reported with their variance. Do not
promote on one run.
