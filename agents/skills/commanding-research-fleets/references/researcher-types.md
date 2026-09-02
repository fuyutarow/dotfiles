# Researcher types and in-lab verification (E4)

> **Scope**: SOLE home for the Researcher archetype table, the Lab coordinator's boundary
> against them, and the full in-lab verification procedure.

## The four archetypes

A Researcher is the executor-equivalent role (`orchestrating-agents`' generic executor,
role-specialized for this fleet). Every Researcher dispatch declares exactly one archetype —
never a blend — and runs on `model:'sonnet'` with one `RESOURCE-CLASS`/`RESOURCE-ENVELOPE`
declaration, per `orchestrating-agents`' generic dispatch contract.

| Archetype | Function |
|---|---|
| **retriever** | pulls precedent — CBR's 4R sense (`vocabulary-and-law.md`'s Retrieve row) |
| **breaker** | attacks a claim or a candidate; refutation-first |
| **builder** | produces an executable specification or an artifact |
| **verifier** | recomputes from raw data and attempts to falsify — the archetype that carries `--certifier` (below) |

**NOT** a Researcher archetype: the **Lab coordinator** (git custody, GPU gatekeeping —
`charters.md`). Do not dispatch a Lab coordinator task under a Researcher archetype; the two
are separate roles even when the same session happens to fill both.

## In-lab verification — the full procedure (E4)

Verification is never queued through the Director. It happens inside the reporting PI's own
lab, dispatched by that PI, before the PI reports or promotes anything.

1. The PI has a claim ready to report or promote.
2. The PI dispatches a Researcher under the **verifier** archetype, in the same lab, with the
   claim's raw data.
3. That verifier Researcher **recomputes from raw data** and **attempts to falsify** the claim
   — not a re-read of the PI's own summary.
4. If the claim survives, the PI promotes it: `--who <PI>` names the author, `--certifier
   <verifier Researcher>` names the one who recomputed and could not falsify it.
5. The Director receives only the resulting receipt. It never dispatches the verification
   step, never queues it, and never sees the raw recomputation.

The orderer's own words for this, quoted verbatim (2026-09-03 ruling): *"各PIがsubagentを呼び
出して、やってから報告するだけ。研究室で揉んでから主張しろ"* — each PI calls its own subagent,
does the work, and only then reports; argue it out inside the lab before making the claim.

A verification Researcher must not be the same dispatch that authored the claim — author and
certifier are always distinct identities, mirroring `orchestrating-agents`' generic rule that
an author and its independent verifier are never the same bearer.

## Provenance

The archetype table is graded **author-confirmed** (§2 of the input spec). The in-lab
procedure and its quoted ruling are graded **author-confirmed**, sourced from the 2026-09-03
addendum. Full grade table: `tests/forge-verification-ledger.md` §1.
