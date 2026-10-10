# ENCOUNTER_RECORD v1

```yaml
ARTIFACT: ENCOUNTER_RECORD
VERSION: v1
ENCOUNTER_ID: <stable-encounter-id>
SOURCE:
  KIND: <closed-enum: HUMAN_ORIGINATED>
  ID: <source-stable-id>
  OCCURRED_AT: <RFC-3339 timestamp>
  RECORDED_AT: <RFC-3339 timestamp>
RESTRICTED_RAW:
  LOCATOR: <restricted-locus>
  SHA256: <externally-computed-SHA-256-of-frozen-raw-content>
CONSENT:
  DECISION: <closed-enum: GRANTED|DENIED>
  RECIPIENT_SCOPE: <recipient-section-id-NFC|NONE>
  DECIDED_AT: <RFC-3339 timestamp|NONE>
  EXPIRES_AT: <RFC-3339 timestamp|NONE>
  REVISION: <string-consent-revision-NFC|NONE>
  WITHDRAWAL:
    STATE: <closed-enum: NONE|WITHDRAWN>
    AT: <RFC-3339 timestamp|NONE>
    HISTORY_LOCATOR: <restricted-locus|NONE>
DECLASSIFICATION:
  DECISION: <closed-enum: APPROVED|DENIED>
  REVIEWER: <reviewer-stable-id|NONE>
  REVIEWED_AT: <RFC-3339 timestamp|NONE>
  SHA256: <externally-computed-SHA-256-of-frozen-declassified-body|NONE>
DECLASSIFIED_BOUNDED_BODY: <bounded-declassified-text|NONE>
MATCH_KEY_RULE_ID: <stable-normalization-rule-id>
MATCH_KEY_RULE_SHA256: <externally-computed-frozen-rule-SHA-256>
MATCH_KEYS: [<normalized-stable-token>, ...]
AUTHORITY: NONE
PROGRAMME_VISIBLE: NO
CANONICALIZATION: >-
  Freeze this completed file before downstream binding. Its externally computed SHA-256 binds
  the frozen bytes; this file never contains a self-referential file hash.
```
