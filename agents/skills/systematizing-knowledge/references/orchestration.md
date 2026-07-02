# Orchestration — running the SoK pipeline on a multi-agent harness

> Scope: the EXECUTION model — how to run the SKILL.md pipeline when the harness offers
> subagents/workflows (Claude Code `Workflow`/`Agent` tools or equivalent). This file owns the
> solo/fan-out/barrier map, the agent contract, the trust boundary for agent output, and scale
> calibration. The *methodological content* of each step stays in its home file (corpus →
> `workflow.md`, ledger → `ledger.md`, synthesis → `synthesis.md`, …) — this file only decides
> WHO executes it and WHAT may be delegated.
>
> **Written as durable operating guidance from a frontier model (Fable 5, 2026-07) to whatever
> model executes this skill later.** The map below encodes failures actually observed in
> production, not hypotheticals. If a step's constraint feels unnecessary, that feeling is the
> failure mode — follow the map. **No harness? The map degrades gracefully: run the same stages
> serially in one context; the solo/fan-out labels become "do now" vs "do as separate focused
> passes".**

## 0. The execution stance — you are the editor-in-chief

Agents are staff writers and fact-checkers; the orchestrator is the editor. Three duties are
**never delegated**, because they require the whole picture in one context:

1. **The argument** — reconciliation (step 5), gap prioritization (step 9), and the final
   position. An argument assembled from shards is not an argument.
2. **The genre/framing judgment** (steps 0–1) — cheap, judgment-heavy, and everything downstream
   depends on it.
3. **The final resolution verdict on the hero artifacts** — read the hero table and the top-k
   load-bearing sources YOURSELF before shipping. An editor who has read none of the primary
   material is laundering, not editing.

Everything mechanical — searching, extracting, gate-walking, verifying, auditing — fans out.

## 1. The solo / fan-out / barrier map

| Pipeline step (SKILL.md) | Mode | Why / how |
|---|---|---|
| 0 genre-fit, 1 frame RQ | **SOLO** | judgment; downstream depends on it; seconds not minutes |
| 2 corpus: search | **FAN-OUT, loop-until-dry** | one agent per search modality (keyword / citation-graph / author / venue / snowball generation); keep spawning rounds until K consecutive rounds add no new included papers — this IS the saturation rule (`workflow.md`) executed |
| 2 corpus: dedup + screen | **BARRIER, then PIPELINE** | dedup needs ALL results (justified barrier); then screening pipelines per paper against the pre-frozen inclusion criteria — freeze criteria BEFORE spawning screeners or you HARK at agent speed |
| 3 extract | **PIPELINE per paper** | one agent per included paper → schema-forced ledger rows at full resolution (`resolution.md`: number + regime + locus). Schema-forced structured output, never prose parsing (§2) |
| 3b AI4S gates | **PIPELINE per claim** | gate-walk A–F is claim-local |
| 4 relate | **BARRIER + assisted** | the relate matrix needs all rows; agents may propose candidate contradiction pairs, the orchestrator confirms the matrix |
| 5 reconcile | **SOLO — never shard** | the moderator search diffs context vectors ACROSS the whole claim graph; a sharded reconciler misses the moderator that lives in the shard boundary. Agents may fetch evidence on demand; the reconciliation itself happens in one context |
| 6 grade | **PIPELINE per unified claim** | after reconciliation is fixed; GRADE is claim-local given the relations |
| 7 unify (sameness test) | **PIPELINE per theory pair** | the formal mapping check is pairwise-local |
| 8 bound / flip conditions | **PIPELINE per claim** | regime statement is claim-local |
| 9 gap analysis | **SOLO** | importance × tractability is a judgment over the whole map |
| 10 write: draft | **SOLO** | one voice, one argument |
| 10 write: audit | **FAN-OUT** | adversarial verification per load-bearing claim; resolution audit per section (`resolution.md` §3–4); prose audit (the `auditing-audience-facing-prose` lens) — all read-only (§4). Findings loop back to step 3 |

The default between stages is **pipeline** (item flows on as soon as ITS previous stage is done);
a **barrier** (wait for ALL) is justified only where the table says so — dedup, the relate matrix,
and portfolio-level consistency checks genuinely need cross-item context. Barrier-by-habit wastes
wall-clock equal to the spread between your fastest and slowest agent.

## 2. The agent contract — what every spawned prompt must contain

An underspecified agent returns plausible prose; a contracted agent returns usable data. Every
spawn carries FIVE elements:

1. **Exact inputs** — absolute paths / arXiv ids / URLs of what to read. "Search the literature"
   is not an input; "read arXiv:2210.15624 §3–4" is.
2. **The bar** — which reference file defines quality for this task (extraction → `ledger.md` +
   `resolution.md`; verification → the six-slot grammar; audit → the checklist section). Tell the
   agent to READ it first; do not paraphrase the bar into the prompt (paraphrase drifts).
3. **The output schema** — structured output (JSON schema), validated at the tool layer. Ledger
   rows, verdicts, and findings are DATA; free-prose returns are for judgment summaries only.
4. **Read-only declaration** for all audit/verify agents — an auditor that edits the artifact
   under audit destroys the evidence chain (and may clobber concurrent work).
5. **"Your final message is the return value"** — data, not a human-facing report.

Minimal schemas that have survived production use:

```json
// extraction (per paper -> ledger rows)
{"type":"object","required":["rows"],"properties":{"rows":{"type":"array","items":
  {"type":"object","required":["claim","type","context","source_locus","magnitude","regime"],
   "properties":{"claim":{"type":"string"},"type":{"enum":["empirical","theoretical","definition","conjecture","methodological"]},
     "context":{"type":"string"},"source_locus":{"type":"string","description":"§/thm/table/fig — NOT just the paper id"},
     "magnitude":{"type":"string","description":"number+units, or 'qualitative: <why>'"},
     "regime":{"type":"string"}}}}}}

// verification (per load-bearing claim -> verdict)
{"type":"object","required":["verdict","evidence"],"properties":{
  "verdict":{"enum":["CONFIRMED","REFUTED","UNCERTAIN"]},
  "evidence":{"type":"string","description":"verbatim quote from the primary source + locus"}}}
```

## 3. Agent epistemics — invariant #2 applies to agents too

- **Agent vote-counting is not evidence.** "5 agents agree X" carries exactly the weight of
  "5 papers say X" — none, unless the agents are *independent in method*. Diversify the LENS
  (correctness / reproduces / source-fidelity), not the count; identical prompts produce
  correlated errors, and correlated agreement is one observation, not five.
- **Verify by refutation, not confirmation.** Skeptic agents are prompted to REFUTE the claim
  against the primary source, defaulting to REFUTED when uncertain. A verifier prompted "check
  whether X is true" confirms X at a rate that makes the pass worthless.
- **Extraction agents find what the prompt names.** If the prompt lists expected findings, the
  agent returns them (confirmation bias at machine speed). Extraction prompts name the SLOTS
  (grammar, schema), never the expected CONTENT.
- **Bibliographic facts get primary confirmation, no exceptions** — authorship, venue, year,
  "who did what first". Observed production failure (2026): a fan-out agent **fabricated a
  co-authorship** that survived into a decision document until a primary arXiv check killed it.
  Any bibliographic assertion an agent cannot back with a fetched primary source is quarantined
  exactly like a gate-failed number (`ai4s-gates.md` quarantine semantics).

## 4. The trust boundary — treat agent output like an abstract

`ledger.md` §ANTI bans extracting from abstracts (*spin inheritance*). **An agent's summary is an
abstract of an abstract** — apply the same suspicion, mechanically:

- A number/claim enters the ledger only WITH its `source_locus`; unlocatable output is quarantined,
  not "probably fine".
- The orchestrator personally spot-reads: the hero table sources, the top-k load-bearing claims
  (k ≈ 5–10), and any claim a skeptic marked UNCERTAIN. Everything else may rest on the
  verification layer.
- **Audit phases are read-only end-to-end** — no workflow agent writes to the corpus, the ledger,
  or the document during an audit; fixes are a separate phase with explicit, disjoint file
  ownership per agent (no two agents write the same file; worktree isolation only when ownership
  cannot be made disjoint).
- Relaying an agent finding into the deliverable WITHOUT reading its evidence is the orchestration
  version of citation-as-decoration (`resolution.md` §ANTI) — the editor signs every claim.

## 5. Scale calibration — match the fleet to the corpus

| Corpus size | Execution |
|---|---|
| < ~10 papers | **solo + iterative probes** — orchestration overhead exceeds the work; read the papers yourself; decisive questions resolve on a few data points |
| ~10–50 papers | extraction fan-out + solo synthesis; single-lens verification of load-bearing claims |
| > ~50 papers, or audit of an existing multi-document corpus | full map (§1): multi-modal corpus sweep with loop-until-dry, per-paper extraction, multi-lens adversarial verification, per-section resolution audit |

Two costs to respect: a barrier's wall-clock is set by its SLOWEST agent (pipeline where possible);
and every relay through the orchestrator burns context — schemas keep returns compact, and
synthesis-relevant data (key claims, verdicts) should be digested to what the argument needs, not
transcript dumps.

## 6. Re-runs and living SoKs

- **Stable claim ids across runs** (`cid` — `ledger.md`): a re-run diffs against the previous
  ledger; only changed cells re-verify. Never renumber.
- Deltas re-run the AFFECTED pipeline slice (`writing.md` §4), not the world: a new paper enters
  as one extraction agent + relate/reconcile delta in the solo context.
- If the harness supports workflow resume/caching, an unchanged (prompt, input) pair should be a
  cache hit — design prompts deterministically (no timestamps/randomness inside prompts) so
  resume works.

## Anti-patterns (orchestration-scoped)

| Anti-pattern | Fix |
|---|---|
| **Sharded synthesis** — reconciliation/moderator search split across agents | Steps 5, 9, 10-draft are SOLO (§1); agents fetch evidence, the editor argues |
| **Agent vote-counting** — "N agents concur" as certainty | Lens diversity + refutation prompting; correlated agreement = one observation (§3) |
| **Unverified relay** — agent findings pasted into the deliverable unread | The editor signs every claim; spot-read the load-bearing set (§4) |
| **Fabricated-bibliography laundering** — agent-asserted authorship/venue/priority enters prose | Primary-source confirmation for ALL bibliographic facts; quarantine otherwise (§3) |
| **Fan-out theater** — 30 agents on a 6-paper corpus | Scale table (§5); orchestration is for scale, not for its own sake |
| **Writing auditors** — audit agents with write access "fixing while checking" | Audits read-only; fixes are a separate phase with disjoint ownership (§4) |
| **Schema-less extraction** — parsing ledger rows out of agent prose | Structured output with validation; prose returns are for judgment only (§2) |
| **Barrier-by-habit** — awaiting ALL agents between every stage | Pipeline is the default; barrier only for genuine cross-item context (§1) |

## Cross-references

| Need | Go to |
|---|---|
| What each pipeline step DOES (methodology) | its home file: `workflow.md`, `ledger.md`, `synthesis.md`, `writing.md` |
| The content bar agents are held to | `resolution.md` |
| Quarantine semantics for unvouchable agent output | `ai4s-gates.md` |
| Saturation rule the corpus loop executes | `workflow.md` §3 |
| Harness mechanics (workflow/agent tools, hooks, permissions) | the `operating-the-harness` skill — not restated here |
