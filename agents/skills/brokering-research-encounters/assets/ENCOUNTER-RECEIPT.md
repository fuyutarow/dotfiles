# ENCOUNTER_RECEIPT v1

```yaml
ARTIFACT: ENCOUNTER_RECEIPT
VERSION: v1
RECEIPT_ID: <stable-receipt-id>
OFFER_SHA256: <externally-computed-frozen-TECHNICAL_MEMO_OFFER-SHA-256>
ENCOUNTER_SHA256: <externally-computed-frozen-ENCOUNTER_RECORD-SHA-256>
NEED_SHA256: <externally-computed-frozen-need-SHA-256>
RECIPIENT_SECTION: <section-id-NFC>
TERMINAL_AT: <RFC-3339 timestamp>
TERMINAL_OUTCOME: <closed-enum: EXPIRED|WITHDRAWN|PULLED_REJECT|PULLED_DEFER|PULLED_ADMIT>
HUMAN_METHOD_INPUT:
  PULL_ID: <stable-pull-id-derived-from-canonical-pull-key|NONE>
  PULL_IDEMPOTENCY_KEY: <lowercase-SHA-256-of-RFC-8785-UTF-8-array-["v1",offer-SHA,recipient-NFC,"pull"]|NONE>
  PULLED_AT: <RFC-3339 timestamp|NONE>
  PULLED_BY_DIRECTOR_ID: <Director-stable-id|NONE>
  DIRECTOR_GRANT_LOCATOR: <Director-grant-locus|NONE>
  DIRECTOR_GRANT_SHA256: <externally-computed-frozen-grant-SHA-256|NONE>
  LOCATOR: <Director-local-locus|NONE>
  SHA256: <externally-computed-frozen-input-SHA-256|NONE>
DIRECTOR_ADMISSION_RECORD:
  LOCATOR: <Director-local-locus|NONE>
  SHA256: <externally-computed-frozen-admission-record-SHA-256|NONE>
WITHDRAWN_POST_PULL_PRE_ADMISSION_INPUT:
  LOCATOR: <existing-Director-local-locus|NONE>
  SHA256: <externally-computed-frozen-input-SHA-256|NONE>
SUPERVISOR_BODY_VISIBLE: NO
AUTHORITY: NONE
PROGRAMME_VISIBLE: NO
ACK_REQUIRED: NO
CANDIDATE_CREATED: NO
SEARCH_CREDIT: 0
LEARN_CREDIT: 0
KEY_CANONICALIZATION_RULE_ID: BROKER-KEY-CANON-v1
IDEMPOTENT_RECEIPT_KEY: <lowercase-SHA-256-of-RFC-8785-UTF-8-array-["v1",offer-SHA,"terminal"]; independent-of-outcome>
CANONICALIZATION: >-
  Freeze this completed file before downstream binding. Its externally computed SHA-256 binds
  the frozen bytes; this file never contains a self-referential file hash.
```
