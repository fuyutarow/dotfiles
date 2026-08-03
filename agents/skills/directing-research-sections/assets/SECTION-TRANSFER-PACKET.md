# SECTION TRANSFER PACKET

SCHEMA: research-section-transfer/v1
TRANSFER_ID: <stable-id>
SOURCE_SECTION_ID: <stable-id>
SOURCE_DIRECTOR_INSTANCE_ID: <stable-id>
SOURCE_DIRECTOR_ROLE_GRANT: <immutable-grant-id>
SOURCE_COMMIT_LOCUS: <tracked-durable-locator>
SOURCE_COMMIT_SHA256: <lowercase-64-hex>
SOURCE_RECEIPT_DIGESTS: <one-or-more-lowercase-digests>
TOPIC_IDS: <one-or-more-predeclared-stable-ids>
AFFECTED_PREMISE_IDS: <stable-ids-or-NONE>
INTERFACE_IDS: <stable-ids-or-NONE>
OUTCOME_CLASS: <bounded-observed-class>
DELTA_CLASS: <supports|weakens|kills|scope-narrows|instrument-break|mapping-break>
APPLICABILITY_PREDICATE: <bounded-testable-predicate>
CONTRAINDICATION: <bounded-condition-or-NONE>
UNCERTAINTY: <bounded-class>
EVIDENCE_LOCATOR: <tracked-nonignored-durable-locator>
EVIDENCE_SHA256: <lowercase-64-hex>
VISIBILITY: SECTION_FEDERATION_ONLY
PROGRAMME_VISIBLE: NO
RAW_HUMAN_METHOD_INCLUDED: NO
AUTHORITY: PROPOSAL_ONLY
