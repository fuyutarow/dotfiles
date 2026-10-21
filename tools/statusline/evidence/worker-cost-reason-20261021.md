# Worker cost absence reason

## Proposition

`STATUSLINE-WORKER-COST-REASON`: an unavailable worker cost is visibly distinct
from a measured zero and has a truthful reason.

## Evidence and cause

- `src/dispatch-runs.ts` reads `cost_usd` from the published agx row into
  `markerCostUsd`, and reads a progress sidecar's optional `cost_usd` into
  `doing.costUsd`.
- `src/dispatch-display.ts` selects the authoritative value by phase: a working
  row prefers progress cost, while a non-working row prefers the marker cost.
- Before this change, `costText` and `costLabels` rendered an absent selected
  value as `$–`. That token said neither that no amount was reported nor why it
  could not be displayed.

## Render contract

- Numeric values, including `0`, continue through `formatCostUsd`: `$0` means a
  reported measured zero.
- An absent selected value now renders exactly `$n/a (not reported)`.
- The data boundary has no evidence that an absent cost is pending, unsupported,
  or temporarily unavailable. The generic `not reported` reason is therefore the
  narrow truthful classification; no charge is estimated or collected at render
  time.

The shared `routeLines` renderer serves Claude, Codex, and watch displays. It
does not read run files or start collectors; it only presents the already
normalized row values.

## Scope and validation

Changed source: `tools/statusline/src/dispatch-display.ts` only. No tests were
added or run, per the delegated brief.

Validation completed in the foreground:

- `bunx --bun oxlint --type-aware tools/statusline/src/dispatch-display.ts`
  passed (exit 0). An earlier invocation caught `unicorn(no-array-callback-reference)`
  on a direct `.map(costLabel)` callback; the final arrow wrapper is lint-clean.
- `rumdl check tools/statusline/evidence/worker-cost-reason-20261021.md && test -s
  tools/statusline/evidence/worker-cost-reason-20261021.md` passed (exit 0).

## Release handoff

No release artifact was written because this brief permits only statusline source
and this evidence file. If the coordinator releases this bug fix, generate the
tool-owned patch changeset with:

```sh
mise run changeset -- statusline patch "Render unreported worker costs with an explicit reason"
```
