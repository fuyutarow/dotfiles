# SECTION LEASE

SCHEMA: research-section-lease/v2
LEASE_ID: <stable-lease-id>
SECTION_ID: <stable-section-id>
MANDATE_ID: <stable-mandate-id>
STARTED_AT: <RFC3339>
EXPIRES_AT: <RFC3339>
FIRST_INTENT_DUE_AT: <RFC3339; <= min(start+30m, start+20%-of-lease)>
MAX_CONTROL_EVENTS_BEFORE_INTENT: <0|1|2>
MAX_PROPOSAL_EVENTS_BEFORE_INTENT: <0|1>
ALLOWED_ACTION_CLASSES: <one-or-more of PROOF|BUILD|EXPERIMENT|MEASUREMENT>
TERMINAL_TARGET: <PROOF_RECEIPT|RUN_RECEIPT|KILL_RECEIPT|EXACT_BLOCKER>

<!-- Programme-owned constraint packet. This authoring template supplies semantic fields only;
the runtime owns wire grammar and enforcement. -->
