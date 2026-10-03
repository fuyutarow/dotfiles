# RETROSPECTIVE JUDGMENT

<!--
Compare frozen prospective intent with terminal observation. This artifact may
judge research meaning; RUN RECEIPT may not. Replace every placeholder and keep
prediction, observation, checks, interpretation, and postdiction distinct.

DENOMINATOR_SHA256 algorithm: sort the unique RUN_ID values bytewise, join them
with LF, append one trailing LF, and SHA-256 the resulting UTF-8 bytes. Example
for run-a and run-b hashes exactly "run-a\nrun-b\n".

AUDITABLE requires exact set equality among supplied intents, supplied receipts,
and RUN_IDS, with MISSING_RECEIPT_RUN_IDS: NONE. PARTIAL requires RUN_IDS to equal
the supplied intent set and its missing list to equal intents minus receipts.
UNAUDITABLE requires every supplied intent ID to be in RUN_IDS and requires its
missing list to equal RUN_IDS minus supplied receipt IDs. Receipts still require
a matching supplied intent and exact intent-byte hash. Therefore a judgment-only
history lists every RUN_ID as missing; it must not claim prospective evidence
existed.

Verdicts below are semantic judgments. Use exactly one contiguous PROCESS LENSES
table and each required Lens ID exactly once. Escape a prose pipe as `\|`, or put
it inside an inline-code span. The checker validates table structure,
enumerations, and loci only; a structural PASS does not establish verdict truth.
TRANSITION records the semantic update to the research state;
EPISODE_DISPOSITION independently records whether this episode persists, pauses,
retires, or reopens. Do not substitute one axis for the other.
Do not add a scalar creativity score or raw chain-of-thought/transcript/prompt.
-->

SCHEMA: research-retrospective/v1
JUDGMENT_ID: <stable-judgment-id>
AUDITABILITY: <AUDITABLE-or-PARTIAL-or-UNAUDITABLE>
RUN_IDS: <sorted-or-unsorted-comma-separated-unique-run-ids>
DENOMINATOR_SHA256: <lowercase-64-hex-denominator-digest>
MISSING_RECEIPT_RUN_IDS: <NONE-or-comma-separated-run-ids>
REGISTERED_EXPECTATION_VS_OBSERVATION: <prospective-expectation-compared-with-observation>
CONTROLS: <control-evidence-loci-and-bounded-assessment>
LEAKAGE: <leakage-check-loci-and-bounded-assessment>
MISSINGNESS: <missingness-check-loci-and-bounded-assessment>
INSTRUMENTATION: <instrumentation-check-loci-and-bounded-assessment>
ALTERNATIVES_GAINED_OR_LOST: <which-live-alternatives-changed-and-why>
SCOPE_ACTUALLY_TESTED: <bounded-tested-scope>
RESULT_CLASS: <EXPECTED-or-UNEXPECTED-or-NULL-or-FAILED-or-INCONCLUSIVE>
TRANSITION: <TREE_UPDATE-or-THESIS_REGENERATE-or-PROBLEM_RECONSTRUCT-or-PORTFOLIO_UPDATE-or-FINISHED_CLAIM-or-NO_CHANGE>
EPISODE_DISPOSITION: <PERSIST-or-PAUSE-or-RETIRE-or-REOPEN>
POSTDICTION: <new-after-observation-explanation-or-NONE-with-reason>
NEXT_REGISTERED_TEST: <next-prospective-test-or-NONE-with-reason>
AUDIT_CLEARANCE_LOCUS: <independent-clearance-locus-or-NONE-with-reason>
UNRESOLVED: <open-uncertainties-or-NONE-with-reason>
REOPEN_CONDITION: <observable-reopen-condition-or-NONE-with-reason>

## PROCESS LENSES

| Lens ID | Evidence locus | Verdict | Causal consequence | Repair / reopen |
|---|---|---|---|---|
| frame-coevolution | <evidence-locus> | <EVIDENCED-or-VIOLATED-or-NOT-EVIDENCED-or-NOT-APPLICABLE> | <causal-consequence> | <repair-or-reopen> |
| generation-evaluation-separation | <evidence-locus> | <EVIDENCED-or-VIOLATED-or-NOT-EVIDENCED-or-NOT-APPLICABLE> | <causal-consequence> | <repair-or-reopen> |
| denominator-retention | <evidence-locus> | <EVIDENCED-or-VIOLATED-or-NOT-EVIDENCED-or-NOT-APPLICABLE> | <causal-consequence> | <repair-or-reopen> |
| premise-alternative-breadth | <evidence-locus> | <EVIDENCED-or-VIOLATED-or-NOT-EVIDENCED-or-NOT-APPLICABLE> | <causal-consequence> | <repair-or-reopen> |
| discriminating-evidence | <evidence-locus> | <EVIDENCED-or-VIOLATED-or-NOT-EVIDENCED-or-NOT-APPLICABLE> | <causal-consequence> | <repair-or-reopen> |
| surprise-uptake | <evidence-locus> | <EVIDENCED-or-VIOLATED-or-NOT-EVIDENCED-or-NOT-APPLICABLE> | <causal-consequence> | <repair-or-reopen> |
| actor-independence | <evidence-locus> | <EVIDENCED-or-VIOLATED-or-NOT-EVIDENCED-or-NOT-APPLICABLE> | <causal-consequence> | <repair-or-reopen> |
| negative-result-retention | <evidence-locus> | <EVIDENCED-or-VIOLATED-or-NOT-EVIDENCED-or-NOT-APPLICABLE> | <causal-consequence> | <repair-or-reopen> |
