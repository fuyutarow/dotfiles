# Agent dispatch contract

## Pre-spawn ticket grading

Every parsed brief receives the model-free ticket floor before its real worker starts. Unless
`--no-grader` is set, the dispatcher then asks Jev to pick a roster row for a short read-only
grader worker bounded to 90 seconds. A schema 2 ticket refused by the floor skips the grader.
The grader is a sub-step of the parent run: it has no run record, verify step, autograde, or
independent stats entry.

The grader receives the full brief, the BIBIFI microticket rules (one consumed decision, a first
useful return within six minutes, split containers with at least two independently checkable
deliverables, queues are still containers, and long work cannot be obtained by chaining), and the
strict JSON shape emitted in an `agent-dispatch-grade` fenced block. The dispatcher validates the
fence and schema. Every proposed piece is converted to a schema 2 ticket and must pass the model-free
floor. Piece write globs must be disjoint or ordered by a transitive `depends_on` relation.

Malformed output, invalid pieces, process failure, or timeout records grader status `failed` and
uses the floor verdict. A grader failure never refuses the run. A valid grade merges floor and
grader violations with source `floor+grader`. Schema 2 split/clarify grades refuse with exit 2 and
print actionable violations plus ready-to-paste piece headers or clarifying questions. Schema 1 and
plain briefs record the same judgment as warnings until refusal is planned for 1.4.0. The parent
receipt carries grader status, reason, Jev pick, chosen row, elapsed time, usage and cost.

`--no-grader` records status `skipped` and its reason. `agent-dispatch grade-replay <dir>
[--expect <file.tsv>]` applies the floor and grader to every top-level `*.md` brief and never starts
the brief's real worker. Expectations are `file<TAB>verdict` rows; replay reports agreement and the
false-refusal rate among expected-pass briefs.
