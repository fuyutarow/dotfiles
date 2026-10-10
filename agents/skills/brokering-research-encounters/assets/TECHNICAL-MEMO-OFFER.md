# TECHNICAL_MEMO_OFFER v1

```yaml
ARTIFACT: TECHNICAL_MEMO_OFFER
VERSION: v1
OFFER_ID: <canonical-offer-id>
ENCOUNTER_SHA256: <exactly-one-externally-computed-frozen-ENCOUNTER_RECORD-SHA-256>
NEED:
  LOCATOR: <Director-authored-need-locus>
  SHA256: <externally-computed-frozen-need-SHA-256>
RECIPIENT_SECTION: <section-id-NFC>
CONSENT_REVISION: <string-consent-revision-NFC>
MATCH_KEY_RULE_ID: <same-stable-normalization-rule-id-as-encounter-and-need>
MATCH_KEY_RULE_SHA256: <same-frozen-rule-SHA-256-as-encounter-and-need>
EXACT_MATCHED_KEYS: [<normalized-stable-token>, ...]
DECLASSIFICATION_SHA256: <externally-computed-frozen-declassified-body-SHA-256>
BOUNDED_METHOD_NOTE: <declassified-bounded-text>
CONCRETE_EXAMPLE_OR_DISCRIMINATOR: <declassified-bounded-text>
CREATED_AT: <RFC-3339 timestamp>
EXPIRES_AT: <RFC-3339 timestamp>
WITHDRAWABLE: YES
KEY_CANONICALIZATION_RULE_ID: BROKER-KEY-CANON-v1
IDEMPOTENCY_KEY: <lowercase-SHA-256-of-RFC-8785-UTF-8-array-["v1",encounter-SHA,need-SHA,recipient-NFC,consent-revision-NFC]>
AUTHORITY: NONE
PROGRAMME_VISIBLE: NO
ACK_REQUIRED: NO
CANDIDATE_CREATED: NO
SCIENTIFIC_CREDIT: NONE
CANONICALIZATION: >-
  Freeze this completed file before downstream binding. Its externally computed SHA-256 binds
  the frozen bytes; this file never contains a self-referential file hash.
```
