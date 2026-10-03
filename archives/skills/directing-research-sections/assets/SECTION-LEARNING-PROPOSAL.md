# SECTION LEARNING PROPOSAL

SCHEMA: research-section-learning-proposal/v3
PROPOSAL_ID: <stable-proposal-id>
SECTION_ID: <stable-section-id>
CONSUMED_RECEIPT_LOCUS: <locator>
CONSUMED_RECEIPT_SHA256: <lowercase-64-hex>
LEARNING_CLASS: <SCIENTIFIC|INSTRUMENTATION_REPAIR>
MEASUREMENT_VALIDITY: <PASS|FAIL|UNKNOWN>
LEARNER_INSTANCE_ID: <stable-instance-id>
LEARNER_ROLE_GRANT: <immutable-grant-id>
PRIOR: <pre-receipt belief or decision>
OBSERVATION: <receipt-grounded observation>
BELIEF_OR_DECISION_DELTA: <bounded change>
UNCERTAINTY: <remaining uncertainty>
NEXT_DISCRIMINATING_ACTION: <bounded next action>
SCALE_RELEASE_REQUEST: <NONE|ESCALATED_CONFIRMATION>
ESCALATION_CLASS: <NONE|SCALE|FULL_SWEEP|GPU_PORT; receipt-linked rationale>
STATE_COMMIT: FORBIDDEN

<!-- Section-learner-owned. SCIENTIFIC requires a PASS receipt and may be committed as LEARN.
INSTRUMENTATION_REPAIR consumes FAIL/UNKNOWN only and earns no LEARN. -->
