# SECTION REOPEN REQUEST

SCHEMA: research-section-reopen-request/v2
REOPEN_REQUEST_ID: <stable-id>
ISSUE_ID: <stable-open-issue-id>
SECTION_ID: <stable-id>
SECTION_MANDATE_LOCUS: <locator>
SECTION_MANDATE_SHA256: <lowercase-64-hex>
MANDATE_REVISION: <integer>
MANDATE_FENCE: <opaque-token>
PROGRAMME_REVISION: <integer>
PROGRAMME_FENCE: <opaque-token>
DIRECTOR_INSTANCE_ID: <stable-instance-id>
DIRECTOR_ROLE_GRANT: <immutable-grant-id>
DECLASSIFIER_INSTANCE_ID: <stable-instance-id>
DECLASSIFIER_ASSERTION: <allowlist-and-privacy-check assertion>
TRIGGER: <mandate-declared reopen trigger>
DECLASSIFIED_EVIDENCE_LOCATOR: <safe locator>
DECLASSIFIED_EVIDENCE_SHA256: <lowercase-64-hex>
UNCERTAINTY: <bounded uncertainty>
REQUESTED_PROGRAMME_REVIEW: <question only>
AUTHORITY: REQUEST_ONLY

<!-- This is typed/declassified input to supervising-research-programmes. It cannot enact REOPEN;
only a later programme-owned PROGRAMME_DECISION may do so. -->
