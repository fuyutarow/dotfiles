# RUN RECEIPT

<!--
Create exactly one immutable terminal receipt for a RUN INTENT. INTENT_SHA256
must hash the exact intent bytes. STATUS is one of succeeded, failed, stopped,
aborted, or excluded. A non-succeeded status still belongs in the denominator.

This packet records observation and provenance, not interpretation. The checker
uses a deliberately bounded heuristic on narrative reason fields to reject
claim-laundering phrases such as "proves", "demonstrates", "therefore", "証明",
and "示す". It never interprets locator/path fields as prose. Put scientific
interpretation in RETROSPECTIVE JUDGMENT. Store bounded locators/digests, not a
raw tagged chat, fenced prompt/transcript/control payload, private reasoning,
command containing secrets, or credential value.
-->

SCHEMA: research-run-receipt/v1
RUN_ID: <matching-run-id>
INTENT_SHA256: <lowercase-64-hex-sha256-of-exact-intent-bytes>
STARTED_AT: <RFC3339-timestamp-or-NONE>
ENDED_AT: <RFC3339-timestamp-or-NONE>
STATUS: <succeeded-or-failed-or-stopped-or-aborted-or-excluded>
EXECUTOR: <executor-or-process-identity>
CAPTURE_SOURCE: <controlled-runner-or-observation-capture-source>
CODE_CONFIG_DATA_DIGESTS: <bounded-digest-map-for-reproducibility>
OBSERVATION_LOCATOR: <terminal-observation-or-failure-artifact-locator>
OBSERVATION_SHA256: <lowercase-64-hex-sha256>
FAILURE_OR_EXCLUSION_REASON: <NONE-with-reason-or-terminal-reason>
CONTROL_AND_ARTIFACT_CHECK_LOCI: <control-leakage-missingness-instrumentation-loci>
