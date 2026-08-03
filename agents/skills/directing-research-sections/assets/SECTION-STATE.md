# SECTION STATE

SCHEMA: research-section-state/v3
SECTION_ID: <stable-id>
CHARTER_LOCUS: <locator>
CHARTER_SHA256: <lowercase-64-hex>
CHARTER_REVISION: <integer>
DIRECTOR_INSTANCE_ID: <stable-instance-id>
STATE: <ACTIVE|PAUSED|COMPLETE|REOPEN_REQUESTED>

## Admission ledger

| Candidate/test ID | Source class | Decision | Goal→Programme→Issue→Mandate→Charter→Grounding lineage | Known-result disposition | Value class | Dominance state/release | Charter criterion | Evidence locator | Decided at | In-flight status | Loser/negative reason |
|---|---|---|---|---|---|---|---|
| <id> | <SEARCHER|HUMAN-METHOD-INPUT|MAPPING_TRANSFER|ADOPTED_SECTION_TRANSFER> | <ADMIT|REJECT|DEFER> | <all locators+digests> | <NOVEL_GAP|REGISTERED_REPLICATION|KNOWN_DUPLICATE|RETRACTION_RISK> | <class> | <RELEASED|BLOCKED; locator> | <criterion> | <locator> | <RFC3339> | <SEARCH|BUILD|EXECUTION|LEARNING|COMMIT|NONE> | <reason or N/A> |

<!-- This is a bounded live ledger. Exactly one row may be admitted/in flight across the entire candidate cycle. -->

## Quarantined inputs

| Input ID | Source | Received at | Scope | AUTHORITY | Local handling |
|---|---|---|---|---|---|
| <id> | <human/provenance> | <RFC3339> | <bounded> | NONE | <admit/reject/defer independently> |
