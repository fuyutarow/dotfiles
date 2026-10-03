# EXECUTABLE SPECIFICATION

SCHEMA: research-section-executable-spec/v3
SPEC_ID: <stable-spec-id>
SECTION_ID: <stable-section-id>
LEASE_LOCUS: <locator>
LEASE_SHA256: <lowercase-64-hex>
ADMITTED_CANDIDATE_OR_TEST_ID: <SECTION_STATE row id>
BUILDER_INSTANCE_ID: <stable-instance-id>
BUILDER_ROLE_GRANT: <immutable-grant-id>
IMPLEMENTATION_LOCUS: <locator>
IMPLEMENTATION_SHA256: <lowercase-64-hex>
ENTRYPOINT_AND_PARAMETERS: <bounded executable invocation>
EXPECTED_OUTCOME_CONTRACT: <outcome/falsifier reference>
ESTIMAND: <precise quantity/claim to estimate or discriminate>
COMPARATOR: <control/baseline/reference>
POSITIVE_CONTROL: <expected-positive control and acceptance criterion>
NEGATIVE_CONTROL: <expected-negative control and rejection criterion>
VALIDITY_CHECKS: <predeclared checks>
MEASUREMENT_CONTRACT_LOCUS: <immutable locator>
MEASUREMENT_CONTRACT_SHA256: <lowercase-64-hex>
RUN_SCALE: <MINIMAL_DISCRIMINATOR|ESCALATED_CONFIRMATION>
ESCALATION_CLASS: <NONE|SCALE|FULL_SWEEP|GPU_PORT>
UPSTREAM_RECEIPT_LOCUS: <locator-or-NONE>
UPSTREAM_RECEIPT_SHA256: <lowercase-64-hex-or-NONE>
DIRECTOR_SCALE_RELEASE_LOCUS: <locator-or-NONE; required for ESCALATED_CONFIRMATION>
DIRECTOR_SCALE_RELEASE_SHA256: <lowercase-64-hex-or-NONE; required for ESCALATED_CONFIRMATION>

<!-- Builder-owned. A Director may cite this packet in intent but cannot author it. Fixed parameter/seed
sweeps are execution, not SEARCH. -->
