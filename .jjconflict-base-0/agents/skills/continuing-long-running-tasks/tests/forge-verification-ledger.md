# Forge verification ledger

## 2026-08-01 — initial forge

### Function and placement

```text
active/resumed task + authorized path
  -- initialize | reconcile | checkpoint | compact-to-locators | close -->
TASK-CONTINUATION.md
  --> trustworthy resumable | blocked | awaiting-input | closed state
```

Ownership void was checked with a four-query JA/EN `repo-search battery`. Nearest siblings:

- `operating-the-harness`: platform configuration and hook contracts, not semantic task state.
- `orchestrating-agents`: dispatch/control plane, not cross-session task-state data plane.
- `implementing-and-debugging`: code behavior and verification, not durable continuation.
- `recovering-poisoned-context`: transcript rewind/clear before any trustworthy checkpoint.

### Source distillation

- Primary product docs: Codex configuration/hooks; Claude context-window/env/hooks.
- Live local harness: Codex CLI 0.146.0, Claude Code 2.1.220, existing hook JSON and runners.
- User-session correction: preserving “thought” must become decisions, evidence, validation, and one
  next action; raw chain-of-thought is neither necessary nor an acceptable artifact.

### F3 checklist

- Labeled examples: `tests/triggers.md` (6 FIRE, 9 NO-FIRE/route).
- Blind holdout: `tests/trigger-prompts.jsonl` (8 FIRE, 8 NO-FIRE) with the answer key isolated in
  `tests/trigger-answer-key.jsonl`.
- Structural validator and compact-lifecycle fixtures: `tests/continuation.test.ts`.
- Single-writer transaction fixtures cover stale snapshots, non-writers, held locks, handoff, and
  no-adapter human writers.

### Verification results

| Gate | Result |
|---|---|
| `bun test agents/skills/continuing-long-running-tasks/tests/continuation.test.ts` | PASS: 24 tests / 102 expectations, 0 failures. |
| `mise run test:hooks` | PASS: 140 pass, 1 skip, 0 fail / 309 expectations. Existing hook behavior remained green. |
| `skill-check.ts agents/skills/continuing-long-running-tasks` | PASS with no prose-debt warning after all transaction docs. |
| system `quick_validate.py` through `uv run --with pyyaml` | PASS: `Skill is valid!` on the final tree. |
| `script-check.ts` on six shared/product TypeScript files | PASS: `FAIL=0 WARN=0`, including `continuation-checkpoint.ts`. |
| Biome / `jq empty` / `sh -n` | PASS on seven scoped TypeScript files, both hook JSON files, and the Codex shell entry. |
| `mise run lint:skills-index` | PASS. |
| `mise run link:skills` and symlink inspection | PASS: the Skill resolves through both `~/.agents/skills` and `~/.claude/skills`. |
| `mise run link:dots` and live config comparison | PASS: Codex/Claude hook/config links resolve to this repository. |

### Live lifecycle evidence

- Codex persisted trust entries exist for both new `SessionStart` and `PreCompact` hooks.
- A bounded live `codex exec` returned `TASK_SLOT_SEEN` from actual SessionStart context.
- Claude `--include-hook-events` showed the exact SessionStart `additionalContext`, then the model
  returned `TASK_SLOT_SEEN`.
- Direct Codex/Claude runners emitted platform-specific unbound locators and no record body.
- Manual-invalid and auto-invalid compaction envelopes are covered for both products in fixtures;
  automatic compaction itself was not artificially forced to consume a context window.

### Independent forward and adversarial evidence

1. A fresh executor completed initialize → bind → drift → reconcile → close in `/tmp`; every
   checkpoint validated. Its findings drove explicit no-adapter, authority, PATH, and dirty-state
   contracts.
2. A blind description-only classifier saw only the frontmatter and holdout prompts. Final run
   classified all 16 FIRE/NO-FIRE cases correctly and routed every named sibling correctly.
3. Security audit reproduced a fixed-ancestor-symlink workspace escape in the first version. The
   repaired version returned `TCR27`, refused binding, and created no outside slot. The same re-audit
   confirmed PATH forgery, invalid bind, bounded stdin, and control-marker defenses.
4. A later forward/security audit exposed the single-writer enforcement gap. The response is
   `continuation-checkpoint.ts`: bound-writer verification, base revision/SHA-256 CAS, an exclusive
   short lock, proposal validation, and atomic rename.
5. The final security re-audit ran 12 concurrent apply processes: exactly one succeeded, while all
   others returned `TCR40` or `TCR42`. It also passed other-record handoff rejection, immutable-field
   rejection, symlink/oversize proposal rejection, atomic close cleanup, and malformed CLI probes.
   A self-declared human-writer bypass found during that audit was removed completely; `--writer-id`
   now returns `TCR39`, and `WRITER: human:alice` returns `TCR33`. No in-scope high/medium finding
   remains.
6. A separate final black-box run completed writer A apply, stale A/B rejection with an unchanged
   canonical hash, non-writer B rejection, pre-bound A→B handoff, B atomic close, and final schema
   validation. Its tested file hashes match the delivered final files.

### Explicit trust boundary

Static workspace path attacks and normal same-account concurrency are in scope. A malicious process
running concurrently as the same Unix UID is outside the isolation claim because it can replace the
installed hooks/configuration themselves; use an OS sandbox or distinct account for that threat.

## 2026-08-02 — durable topology co-fire repair (v2608.1.1)

Fresh stage-1 probe found that C and O named reciprocal ownership but did not expose one executable
order before body load. Clearing phrase in both descriptions and bodies:
`continuity record -> orchestration overlay -> writer checkpoint`. After the domain map, C
initializes/reconciles the locus, O overlays roles/visibility/veto/acceptance carrying only that locus,
and C's sole writer checkpoints the accepted overlay locator. The Ordered co-fire trigger fixture
proves the sequence; topology-only without persistence remains O-only.

Receipts: description 959 characters; `quick_validate.py` valid; targeted `skill-check.ts` silent
exit 0 (`FAIL=0 WARN=0`); `continuation.test.ts` 24 pass / 0 fail / 102 expectations; durable-order and
topology-only desk-check 2/2 PASS.
