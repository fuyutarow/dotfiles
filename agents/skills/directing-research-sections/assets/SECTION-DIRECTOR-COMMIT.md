# SECTION DIRECTOR COMMIT

SCHEMA: research-section-director-commit/v3
COMMIT_ID: <stable-commit-id>
SECTION_ID: <stable-section-id>
DIRECTOR_INSTANCE_ID: <stable-instance-id>
DIRECTOR_ROLE_GRANT: <immutable-grant-id>
LEARNING_PROPOSAL_LOCUS: <locator>
LEARNING_PROPOSAL_SHA256: <lowercase-64-hex>
CONSUMED_RECEIPT_LOCUS: <locator>
CONSUMED_RECEIPT_SHA256: <lowercase-64-hex>
DECISION: <COMMIT|REJECT|DEFER>
LEARNING_CLASS: <SCIENTIFIC|INSTRUMENTATION_REPAIR>
SCALE_RELEASE: <NONE|ESCALATED_CONFIRMATION; valid only when DECISION=COMMIT>
ESCALATION_CLASS: <NONE|SCALE|FULL_SWEEP|GPU_PORT; non-NONE only with SCALE_RELEASE=ESCALATED_CONFIRMATION>
MINIMAL_RECEIPT_LOCUS: <locator-or-NONE; required for ESCALATED_CONFIRMATION>
MINIMAL_RECEIPT_SHA256: <lowercase-64-hex-or-NONE; required for ESCALATED_CONFIRMATION>
GROUNDING_FENCE_VALIDATION: <current revision/fence assertion>
SECTION_STATE_TRANSITION: <exact local transition>
COMMITTED_AT: <RFC3339>

<!-- Director-owned. Its author must be distinct from the learner proposal author. REJECT or DEFER earns
no LEARN; INSTRUMENTATION_REPAIR earns no LEARN even when committed. -->
