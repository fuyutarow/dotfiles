# SECTION SIGNAL

SCHEMA: research-section-signal/v2
SIGNAL_ID: <stable-id>
ISSUE_ID: <stable-open-issue-id>
SECTION_ID: <stable-id>
SECTION_MANDATE_LOCUS: <locator>
SECTION_MANDATE_SHA256: <lowercase-64-hex>
MANDATE_REVISION: <integer>
MANDATE_FENCE: <opaque-token>
PROGRAMME_REVISION: <integer>
SECTION_CHARTER_LOCUS: <locator>
SECTION_CHARTER_SHA256: <lowercase-64-hex>
DIRECTOR_INSTANCE_ID: <stable-instance-id>
DIRECTOR_ROLE_GRANT: <immutable-grant-id>
DECLASSIFIER_INSTANCE_ID: <stable-instance-id>
DECLASSIFIER_ASSERTION: <allowlist-and-privacy-check assertion>
LIFECYCLE_TOKEN: <ACTIVE|PAUSED|COMPLETE|REOPEN_REQUESTED|CONSTRAINT_CHANGED>
SIGNAL_CLASS: <PROGRESS|BLOCKED|NEGATIVE|COMPLETE|DECLASSIFICATION_BLOCKED>
PREDECLARED_OBSERVABLE_ID: <charter-or-intent observable id>
OUTCOME_CLASS: <bounded observed outcome class>
EVIDENCE_LOCATOR: <allowlisted bounded locator>
EVIDENCE_SHA256: <lowercase-64-hex>
RECEIPT_DIGESTS: <comma-separated lower-case digests-or-NONE>
THROUGHPUT_WINDOW_ID: <stable-nonoverlapping-window-id>
THROUGHPUT_WINDOW_STARTED_AT: <RFC3339>
THROUGHPUT_WINDOW_ENDED_AT: <RFC3339>
THROUGHPUT_WINDOW_ELAPSED_SECONDS: <positive-integer>
THROUGHPUT_WINDOW_BOUND_ASSERTION: <finite-programme-bound-and-overlap-policy>
CANDIDATE_INVENTORY_COUNT: <nonnegative-integer; IDEATION-only>
BUILDS_COUNT: <nonnegative-integer; executable implementations admitted to an intent>
SEARCH_RECEIPTS_COUNT: <nonnegative-integer; exact intent-linked terminal receipts>
LEARNING_COMMITS_COUNT: <nonnegative-integer; distinct receipt-consuming Director commits>
NEGATIVE_KILL_RECEIPTS_COUNT: <nonnegative-integer; included in SEARCH_RECEIPTS_COUNT>
SEARCH_PER_HOUR: <SEARCH_RECEIPTS_COUNT / elapsed-hours>
LEARN_PER_HOUR: <LEARNING_COMMITS_COUNT / elapsed-hours>
LEARNING_COMPLETION: <LEARNING_COMMITS_COUNT / SEARCH_RECEIPTS_COUNT; NULL when denominator is zero>
CANDIDATE_TO_INTENT_P50_MS: <nonnegative-integer-or-NULL>
CANDIDATE_TO_INTENT_P95_MS: <nonnegative-integer-or-NULL>
INTENT_TO_START_P50_MS: <nonnegative-integer-or-NULL>
INTENT_TO_START_P95_MS: <nonnegative-integer-or-NULL>
START_TO_RECEIPT_P50_MS: <nonnegative-integer-or-NULL>
START_TO_RECEIPT_P95_MS: <nonnegative-integer-or-NULL>
RECEIPT_TO_COMMIT_P50_MS: <nonnegative-integer-or-NULL>
RECEIPT_TO_COMMIT_P95_MS: <nonnegative-integer-or-NULL>
READY_SLOT_IDLE_MS: <nonnegative-integer>
CANDIDATE_COMPUTE_UTILIZATION: <candidate-execution-ms / reserved-compatible-execution-ms-or-NULL>
WAIT_REASON_COUNTS: <counts for NO_COMPATIBLE_CAPACITY|SECTION_WIP_LOCKED|LEASE_OR_AUTHORITY_INVALID|DEPENDENCY_NOT_READY|RESOURCE_SAFETY_HOLD>
ABANDONED_ATTEMPT_COUNT: <nonnegative-integer>
EXPIRED_ATTEMPT_COUNT: <nonnegative-integer>
CONTROL_ACTIVITY_COUNTS: <bounded separate agent/document/prompt/token/verifier/smoke/instrument map>
TRANSFER_PACKETS_PUBLISHED_COUNT: <nonnegative-integer>
TRANSFER_DELIVERIES_COUNT: <nonnegative-integer>
TRANSFER_ADMISSIONS_ADOPT_COUNT: <nonnegative-integer>
TRANSFER_ADMISSIONS_REJECT_COUNT: <nonnegative-integer>
TRANSFER_ADMISSIONS_DEFER_COUNT: <nonnegative-integer>
COMMIT_TO_DELIVERY_P50_MS: <nonnegative-integer-or-NULL>
COMMIT_TO_DELIVERY_P95_MS: <nonnegative-integer-or-NULL>
DELIVERY_TO_ADMISSION_P50_MS: <nonnegative-integer-or-NULL>
DELIVERY_TO_ADMISSION_P95_MS: <nonnegative-integer-or-NULL>
TRANSFER_REPLAY_DROPS_COUNT: <nonnegative-integer>
UNROUTED_TRANSFER_PACKETS_COUNT: <nonnegative-integer>
PROGRAMME_VISIBILITY_VIOLATIONS_COUNT: <nonnegative-integer>
TRANSFER_TOPIC_COVERAGE_GAPS: <bounded-topic-id-to-count-map-or-NONE>
TRANSFER_CONFLICT_ALARMS: <bounded-topic-id-to-count-map-or-NONE>
TRANSFER_THROUGHPUT_EXCLUSION_ASSERTION: <fan-out-and-replay-excluded-from-SEARCH-and-LEARN>
TRANSFER_PACKET_BODY_INCLUDED: NO
UNCERTAINTY: <bounded class>
COVERAGE_DUPLICATION_ASSERTION: <denominator/duplication assertion>
CONSTRAINT_RESOURCE_DELTA: <bounded delta-or-NONE>
REQUESTED_PROGRAMME_DECISION: <NONE|REVIEW|REOPEN_CONSIDERATION>
RAW_CONTENT_INCLUDED: NO
