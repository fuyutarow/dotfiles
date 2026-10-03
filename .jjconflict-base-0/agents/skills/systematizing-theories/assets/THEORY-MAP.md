# THEORY MAP

Use within the existing canonical theory record. Do not duplicate its raw findings/proofs here.
Fields are semantic requirements, not a new database schema. Use inline cards for a small theory.

THEORY_ID: <existing stable project ID>
REVISION: <current theory revision>
QUESTION: <one selected theoretical question>
CANONICAL_LOCUS: <record/path>
COVERAGE: <included sources/versions; partial or checked inventory; unreviewed remainder>
PRIMITIVES: <object, domain, notation, units and time/measurement conventions>

## Statements

Repeat one card per statement. A multi-claim item must be split before tracking its consequences.

ID@REVISION: <stable statement ID and immutable version>
ALIASES: <historical numbering or titles, or none>
KIND: <axiom | assumption | definition | lemma | proposition | theorem | corollary | conjecture | empirical claim | open obligation>
STATEMENT: <exact proposition/definition>
SCOPE: <domain; quantifiers; regime; time; quantity/unit>
CONDITIONS: <intrinsic conditions of this exact statement; versioned definitions; not a union of J-premise sets>
WARRANT_SUMMARY: <live complete J IDs and their standards; or STIPULATED/ASSUMED/EMPIRICAL_EVIDENCE with basis>
DEDUCTIONS: <J IDs, or none>
EVIDENCE_LINKS: <E IDs, or none>
APPLICATIONS: <A IDs, or none>
STATE: <active | challenged | refuted | superseded | retired; reason and locus>
SUPERSEDES: <old revision or none>

## Deductive justifications

| J-ID | Conclusion ID@revision | Proof standard | Required premises (AND within this row) | Inference/warrant locus | Scope and status |
|---|---|---|---|---|---|
| <id> | <statement> | <sketch/informal/external/kernel; exact basis> | <versioned refs> | <exact argument> | <limit> |

Multiple deductive rows for a conclusion are alternatives; never merge their premise sets automatically.
A graph is a rendering of these rows, not an independent authority or proof.

## Evidence links and target applications

| E-ID | Finding ID/version and immutable locus | Disposition | Tested statement/version | Regime and empirical bearing |
|---|---|---|---|---|
| <id> | <existing record> | <validity/scope> | <exact target> | <support/counterevidence/uninformative/invalid; limit> |

| A-ID | Target ID/version | Statement ID@revision | Bridge locus | Premise and implementation status | Scope |
|---|---|---|---|---|---|
| <id> | <model/run/domain> | <exact theorem> | <mapping/check> | <satisfied/failed/unknown with reason> | <limit> |

Keep definition-use and implementation/test references typed separately as needed.
An E record cannot replace a failed J path; one failed A record does not invalidate every application.

## Predictions and open obligations

| ID | Target statement/version | Extra measurement/implementation assumptions | Finding/plan locator | Current scope/status |
|---|---|---|---|---|
| <id> | <refs> | <conditions> | <existing record> | <supported/counterevidence/open; exact limit> |

## Changes

- <THEORY CHANGESET ID/locus>: <input -> changed statements -> affected view reconciliation>
