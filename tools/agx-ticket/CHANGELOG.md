# Changelog

## 1.0.1 — 2026-10-23

- Use jj trunk() to detect landed runs

## 1.0.0 — 2026-10-23

- Share committed trunk ticket-home configuration and local overrides; reject retired configuration with exit 2.

## 0.5.0 — 2026-10-23

- Replace repository discovery overrides with AGX_REPOS_ROOT and reject retired doctor variables

## 0.4.0 — 2026-10-23

- Replace doctor quiet environment control with --quiet and reject the retired variable.

## 0.3.0 — 2026-10-19

- Remove the bare tkt command alias; use agx ticket or agx-ticket.

## 0.2.0 — 2026-10-19

- Emit ticket doctor findings in the shared JSON Lines shape

## 0.1.7 — 2026-10-18

- Reduce doctor CPU by sharing run history, ticket metadata, and workspace landing probes within each diagnostic.

## 0.1.6 — 2026-10-17

- Standardize -V/--version, plain deterministic help, and typed unknown-flag diagnostics.

## 0.1.5 — 2026-10-17

- Limit recorded outside-home findings to actionable runs and detect present files outside every ticket home.

## 0.1.4 — 2026-10-17

- Reject nonconforming ticket slugs with a hyphenated tkt new suggestion

## 0.1.3 — 2026-10-16

- Resolve ticket homes from committed .agx.toml so ticket creation agrees with dispatch validation.

## 0.1.2 — 2026-10-16

- Add read-only ticket placement findings

## 0.1.1 — 2026-10-16

- Move the ticket CLI under the agx-ticket part and keep tkt

## 0.1.0 — 2026-10-16

- Add tkt for ticket issuance, derived lifecycle states and accepted-and-landed collection.
