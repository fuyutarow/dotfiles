# RUN INTENT v2

SCHEMA: research-section-run-intent/v3
RUN_ID: <stable-run-id>
SECTION_ID: <stable-section-id>
SECTION_CHARTER_LOCUS: <locator>
SECTION_CHARTER_SHA256: <lowercase-64-hex>
CHARTER_REVISION: <integer>
MANDATE_FENCE: <opaque-token>
DIRECTOR_ROLE_GRANT: <immutable-grant-id>
DIRECTOR_INSTANCE_ID: <stable-instance-id>
LEASE_LOCUS: <locator>
LEASE_SHA256: <lowercase-64-hex>
ADMISSION_LEDGER_ROW: <state-locus#candidate-or-test-id>
ADMITTED_CANDIDATE_OR_TEST_ID: <stable-id>
EXECUTABLE_SPEC_LOCUS: <locator>
EXECUTABLE_SPEC_SHA256: <lowercase-64-hex>
ESTIMAND: <exact EXECUTABLE_SPEC estimand>
COMPARATOR: <exact EXECUTABLE_SPEC comparator>
POSITIVE_CONTROL: <exact EXECUTABLE_SPEC positive control>
NEGATIVE_CONTROL: <exact EXECUTABLE_SPEC negative control>
VALIDITY_CHECKS: <exact EXECUTABLE_SPEC validity checks>
MEASUREMENT_CONTRACT_LOCUS: <exact EXECUTABLE_SPEC locator>
MEASUREMENT_CONTRACT_SHA256: <exact EXECUTABLE_SPEC sha256>
REGISTERED_AT: <RFC3339-before-access>
ACCESS_BOUNDARY: <observation/access/execution/unblinding start>
PROSPECTIVE_TEST: <bounded test>
DISCRIMINATING_OUTCOMES: <outcome contrast>
RUN_SCALE: <MINIMAL_DISCRIMINATOR|ESCALATED_CONFIRMATION>
ESCALATION_CLASS: <NONE|SCALE|FULL_SWEEP|GPU_PORT>
UPSTREAM_RECEIPT_LOCUS: <locator-or-NONE>
UPSTREAM_RECEIPT_SHA256: <lowercase-64-hex-or-NONE>
DIRECTOR_SCALE_RELEASE_LOCUS: <SECTION_DIRECTOR_COMMIT locator-or-NONE; required for ESCALATED_CONFIRMATION>
NEXT_ACTIONS_BY_OUTCOME: <prospective map>
EXECUTOR_RECEIPT_SINK: <immutable receipt locator namespace>
TERMINAL_DEADLINE: <RFC3339>
STATUS: REGISTERED

<!-- The Section Director authors this intent only. It exact-joins the named EXECUTABLE_SPEC measurement
contract. The executor authors the immutable terminal RUN_RECEIPT; no Director-written receipt is valid. -->
