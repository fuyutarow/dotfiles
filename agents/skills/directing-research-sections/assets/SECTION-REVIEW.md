# SECTION REVIEW

SCHEMA: research-section-review/v2
SECTION_ID: <stable-id>
SECTION_STATE_LOCUS: <locator>
SECTION_STATE_SHA256: <lowercase-64-hex>
REVIEWED_AT: <RFC3339>
DIRECTOR_INSTANCE_ID: <stable-instance-id>
INTENT_RECEIPT_JOINS: <intent-locator/digest -> executor-receipt-locator/digest/status>
LEARNING_PROPOSAL_JOIN: <proposal-locator/digest -> consumed-receipt-locator/digest>
DIRECTOR_COMMIT_JOIN: <commit-locator/digest -> local state transition>
CHARTER_STATUS: <within-boundary|exhausted|blocked>
NEXT_LOCAL_STATE: <ACTIVE|PAUSED|COMPLETE|REOPEN_REQUESTED>
UPWARD_RETURN: <SECTION_SIGNAL|SECTION_REOPEN_REQUEST|NONE locator>
