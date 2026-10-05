# Workflow relay — Codex workers under a Claude Workflow

Read when a Workflow uses Codex workers. The durable rules are in `SKILL.md` (C1–C4 and the relay
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

## One relay (copy, then edit the brief path and model)

```js
const RELAY = {type: 'object', properties: {
  receipt_line: {type: 'string', description: 'the exact last stdout line codex-run printed'},
  shell_exit: {type: 'integer', description: 'the exit status of the codex-run command'}},
  required: ['receipt_line', 'shell_exit']}

const r = await agent(`RESOURCE-CLASS(NONCOMPUTE): one bounded read-only Codex call through codex-run; no local fanout.
You are a relay. Run this ONE Bash command with the Bash tool parameter timeout: 600000:
  codex-run --model gpt-6-luna --effort medium --sandbox read-only --cd <dir> --timeout-s 540 --prompt-file <brief.md>; echo "SHELL_EXIT=$?"
Return receipt_line = the JSON line codex-run printed, copied exactly as a string, and
shell_exit = the number after SHELL_EXIT=. Do not parse, summarize, judge, or retry.`,
  {label: 'codex:luna', phase: 'Verify', schema: RELAY, agentType: 'sonnet-high'})
let receipt = null
try { receipt = JSON.parse(r.receipt_line) } catch (e) { receipt = {outcome: 'relay-error', why: String(e)} }
```

Under parallel local relays, swap the declaration and the command:

```text
RESOURCE-ENVELOPE(/abs/run/job-3.resource.json): agent-resource-run only
agent-resource-run --manifest /abs/run/job-3.resource.json -- codex-run …
```

Create each envelope first, from the main loop, with the same flags as the run:
`codex-run --model … --effort … --sandbox … --cd … --timeout-s 540 --emit-envelope /abs/run/job-3.resource.json --job-id job-3`.

## Verifier trial — Sonnet vs Codex on the same evidence (C4)

Use before promoting a Codex model to a standing role (for example, the default adversarial
verifier). One trial is one frozen evidence set and one frozen brief, judged by both arms.

| Step | Rule |
|---|---|
| Freeze | Write the brief and the evidence file list once. Both arms read the same files. |
| Arms | Sonnet arm: `agent(…, {agentType: 'sonnet-high', schema: FINDINGS})`. Codex arm: the relay above with the same brief, asking for the same FINDINGS JSON in its last message. |
| Blind | Neither arm sees the other's output, the expected defects, or which arm it is compared with. |
| Seeded defects | Plant a few known defects in a copy of the evidence when ground truth is otherwise unknown. Score recall on them. |
| Measure | Per arm: confirmed findings, false findings, seeded-defect recall, tokens (receipt `usage` / harness usage), wall time. Quota drain from ccusage on both ledgers. |
| Adjudicate | SOLO in the main loop. A disagreement is the signal to inspect; agreement is not proof. |
| Decide | Promote only on the measured table. Record it, dated, in `model-catalog.md`. |

Keep N small and honest: two or three evidence sets per arm, reported with their variance. Do not
promote on one run.
