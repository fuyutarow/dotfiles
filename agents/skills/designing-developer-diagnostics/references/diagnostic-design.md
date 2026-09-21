# Diagnostic design — the SOLE home of card semantics

## 1. The card is a causal boundary, not an error-copy template

The **DIAGNOSTIC CARD** separates a demonstrated condition from explanation and recovery. It is
one card per failure class, not one card per string.

| Field | Must contain | Must not contain |
|---|---|---|
| Surface | CLI, config validator, compiler, build tool, or tool API | “developer” without a receiver |
| Machine contract | Nonzero exit + stderr for a CLI, or the named API error envelope | Human prose presented as a machine contract |
| Observed condition | The rejected input/state the tool actually established | An inferred root cause |
| Evidence / locus | File/key/request/operation and the relevant span/value | A vague subsystem name |
| Cause confidence | `proven`, `candidate`, or `unknown` | An unmarked confidence leap |
| Primary message | A standalone statement of the failure | An opaque code or a dangling “failed” |
| Related loci | A declaration, prior use, expected value, or other causal neighbor | Independent errors hidden as “related” |
| Recovery mode | The strongest supported recovery class | A fix that merely sounds plausible |
| Receipt | Executed path plus expected output contract | “manually checked” with no case |

The field layout is skill-supplied. It operationalizes this bounded corpus position:
`sok-developer_facing_diagnostic_messages` (soks commit `06203eb`).

## 2. Recovery mode is a confidence decision

| Mode | Use when | Required output | Forbidden shortcut |
|---|---|---|---|
| **exact** | A repair was exercised for this failure class and its preconditions hold | Replacement command/config/code plus preconditions | An untested command presented as certain |
| **conditional** | A likely repair depends on a named, unchecked condition | “If <condition>, try <action>” | Hiding the condition |
| **investigate** | Cause or safe repair is not established | Smallest discriminating observation | A speculative imperative |
| **none** | The user cannot act now, or a distinct owner must act | Escalation locus and information to preserve | Pretending an error is recoverable |

An explanation may include a **proven** cause. A `candidate` stays explicitly conditional. An
`unknown` is not a failure of the message: name the observation that would decide it.

This is a conservative, skill-supplied rule. The corpus supports recovery as valuable, but it does
not measure the safety of speculative repairs.

## 3. Locus and grouping

For source/config errors, locate the full offending expression, key, or request field.
When the contradiction needs two locations, emit a primary locus plus a labeled related locus.
Examples: the use and its declaration, a duplicate and its prior occurrence, or actual versus expected.

| Relation | Rendering |
|---|---|
| One local error | Primary message + one primary span/key |
| Two causally coupled locations | Primary diagnostic + labeled note/secondary span |
| Same causal failure with several follow-ups | One group; child notes explain consequences |
| Independent failures | Separate primary diagnostics; do not conceal one under another |

Use a stable diagnostic code only when it points to explanation that the primary message cannot
carry. Code, documentation, color, IDE hover, and a stack trace never make the primary message
optional. Color may reinforce a distinction but is not the sole carrier of one.

## 4. Verification and limits

Run the floor first. It detects missing card fields and recovery-mode contradictions only. Then
exercise the actual tool path:

1. a positive case emits the intended severity, primary message, locus, exit/response, and group;
2. a negative neighboring case does not emit it; and
3. any exact recovery has a passing receipt under its declared preconditions.

The source corpus supports precise loci, structured diagnostics, useful recovery, and realistic testing.
It does **not** establish that every redesign increases correct repairs.
A 2025 SQL syntax-error study reported better error finding, recovery confidence, and faster fixes.
It did not show a consistent success-rate improvement. Measure the failure class you own.
Do not claim general developer-productivity gains from a polished string.
