# Authority, events, and lifecycle

> **SOLE owner** of the effective-declaration versus decision-record split.

This is **skill-supplied** guidance.

JSON, TOML, JWS, and JCS do not mandate event sourcing.

## Keep readers separate when their jobs differ

| Artifact | Reader | Contains | Must not replace |
|---|---|---|---|
| Effective declaration | Runtime or gate | Values effective now. | Rationale or an expired exception. |
| Decision record | Reviewer or auditor | Authority, change, rationale, scope, expiry. | The runtime input unless the target consumes it. |
| Generated resolution | Installer or runtime | Exact result from inputs and writer. | An editable declaration. |
| Exception encoding | Gate and reviewer | Scope, authority, expiry, override. | A comment the verifier cannot interpret. |

Use the split when state, rationale, and exception have different readers.

A small human-authored config may retain explanatory comments.

The boundary is crossed when a comment must override a gate or prove authorization.

For a gated input, write Decision record as record: with a locator or none: with the sole authority.

Write Exception encoding as encoded: with a locator or none: when the target rejects exceptions.

## Minimum decision record

| Field | Job |
|---|---|
| Authority | Names who or what could approve a change. |
| Effective change | Names an old/new value or artifact digest. |
| Rationale/evidence | Keeps the decision reviewable. |
| Exception scope | Limits an override to keys, environments, or consumers. |
| Expiry/review trigger | Names when the exception ends. |
| Attribution/integrity | Links the record to an author or protected representation. |

A reviewed commit, signed record, or append-only store can satisfy this contract.

The target verifier must still use the declared effective input.

## Recovery

Raw-byte rollback restores prior protected bytes.

Canonical rollback restores an accepted artifact, profile, and verifier.

Restore effective state before replaying its rationale.
