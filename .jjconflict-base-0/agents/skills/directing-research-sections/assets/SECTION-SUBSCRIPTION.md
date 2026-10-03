# SECTION SUBSCRIPTION

SCHEMA: research-section-subscription/v1
SUBSCRIPTION_ID: <stable-id>
RECIPIENT_SECTION_ID: <stable-id>
SECTION_MANDATE_LOCUS: <locator>
SECTION_MANDATE_SHA256: <lowercase-64-hex>
MANDATE_REVISION: <integer>
MANDATE_FENCE: <opaque-token>
SECTION_CHARTER_LOCUS: <locator>
SECTION_CHARTER_SHA256: <lowercase-64-hex>
RECIPIENT_DIRECTOR_INSTANCE_ID: <stable-id>
RECIPIENT_DIRECTOR_ROLE_GRANT: <immutable-grant-id>
TOPIC_IDS: <one-or-more-predeclared-stable-ids>
AFFECTED_PREMISE_IDS: <stable-ids-or-NONE>
INTERFACE_IDS: <stable-ids-or-NONE>
ACCEPTED_DELTA_CLASSES: <one-or-more of supports|weakens|kills|scope-narrows|instrument-break|mapping-break>
EVENT_LOG_CURSOR: <immutable-start-cursor>
EFFECTIVE_AT: <RFC3339>
EXPIRES_AT: <RFC3339-or-mandate-expiry>
IMMUTABLE: YES
VISIBILITY: SECTION_FEDERATION_CONTROL
PROGRAMME_VISIBLE: NO
AUTHORITY: ROUTING_FILTER_ONLY
