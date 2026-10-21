# Codex legacy math delimiter helper — 2026-10-21

Scope: pure helper only, with the frozen exported type and function from the worker brief.
No adapter, deployment, native enforcement, tests, model turns, release or runtime changes.

Implementation policy: retain the source verbatim; report balanced backslash-parenthesis
and backslash-square pairs at their original opening positions (1-based lines and UTF-16
columns). Odd backslash runs activate only their final slash; even runs are literals.
Unpaired escaped Markdown brackets are ignored. Same-kind nesting is balanced; crossed
closers do not close a different kind. Findings are returned in opening source order.

Code policy: ignore backtick and tilde fences indented by at most three spaces, closed
only by the same marker with at least the opening length and trailing whitespace only.
Backtick fence info cannot contain backticks. Ignore inline backtick spans with matching
run lengths, including multiline spans; unmatched runs remain literal. Block fences are
recognized before inline spans. Blockquote/list container parsing and indented code are
outside this bounded helper's Markdown subset.

Bounds: scan at most 1,048,576 UTF-16 code units and return at most 100 findings. A pair
whose closer is beyond the scan limit is not reported. The API has no truncation flag;
consumers must treat capped input/results as potentially incomplete. Passes are linear
in the scanned prefix; no repeated suffix searches, regex backtracking or TeX parsing.

Verification pending: `mise run lint:ts -- agents/codex/hooks/math-delimiters.ts`.
Behavior tests are explicitly prohibited by this brief; edge behavior is reviewed statically.
This hook helper is not a packaged tool release; no version/changelog/changeset is needed.
