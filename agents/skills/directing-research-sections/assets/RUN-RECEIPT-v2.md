# RUN RECEIPT v2

<!-- This is the executor-owned canonical wire payload. It documents what the Section Director may
cite and join. A Section Director must never author, edit, or repair an instance. -->

SCHEMA: research-section-run-receipt/v3
RECEIPT_ID: <stable-id>
RUN_ID: <stable-run-id>
RUN_INTENT_LOCUS: <locator>
RUN_INTENT_SHA256: <lowercase-64-hex>
EXECUTOR_INSTANCE_ID: <stable-instance-id>
EXECUTOR_ROLE_GRANT: <immutable-grant-id>
STARTED_AT: <RFC3339>
TERMINATED_AT: <RFC3339>
STATUS: <COMPLETED|FAILED|STOPPED|ABORTED>
MEASUREMENT_VALIDITY: <PASS|FAIL|UNKNOWN>
MEASUREMENT_CONTRACT_SHA256: <exact RUN_INTENT measurement-contract digest>
OBSERVATION_EVIDENCE_LOCUS: <immutable observation evidence locator>
OBSERVATION_EVIDENCE_SHA256: <lowercase-64-hex>
MEASUREMENT_VALIDITY_EVIDENCE_LOCUS: <immutable validation evidence locator>
MEASUREMENT_VALIDITY_EVIDENCE_SHA256: <lowercase-64-hex>
MEASUREMENT_REPAIR_LOCUS: <instrumentation-repair locator-or-NONE>
RESOURCE_RECEIPT_LOCUS: <locator|NONE>
ERROR_CLASS: <bounded-class|NONE>
