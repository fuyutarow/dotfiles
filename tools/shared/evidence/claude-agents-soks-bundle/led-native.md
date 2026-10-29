---
type: sok_claim_ledger
title: "Claude AGENTS native loading — led"
description: "Documented selection rules; runtime and semantic reuse remain uncertain"
status: draft
sok_id: "01a15e6a-2d0b-72f6-aca7-9618a89ffe59"
generated: { by: "process:documentation-synthesis", at: "2026-10-21T12:46:57Z" }
sok_unit_id: "01a15e6a-2d0b-72f6-aca7-96194927eaa0"
sok_authority_key: "led/claude_agents_native_loading"
sources:
  - resource: "urn:uuid:01a15e6a-2d0b-72f6-aca7-96158e23ed6a"
---

# Documented loading claims

| ID | Claim | Disposition | Evidence | Reversal condition | Limit |
| --- | --- | --- | --- | --- | --- |
| CA-001 | Native AGENTS.md support begins at 2.1.277 | Documented in supplied section summary | urn:uuid:01a15e6a-2d0b-72f6-aca7-96158e23ed6a | Upstream corrects the version floor | Eligibility does not establish active-session loading |
| CA-002 | Default claude-md-or-agents-md mode prefers project or ancestor CLAUDE instructions over AGENTS.md | Documented in supplied section summary | urn:uuid:01a15e6a-2d0b-72f6-aca7-96158e23ed6a | Upstream changes the default selection rule | Other selection modes can differ |
| CA-003 | Global and managed instructions do not suppress project AGENTS.md | Documented in supplied section summary | urn:uuid:01a15e6a-2d0b-72f6-aca7-96158e23ed6a | Upstream changes the scope rule | Project-file precedence remains a separate condition |
| CA-004 | Mode, builtin plugin state and first-session-after-upgrade behavior can affect loading | Documented in supplied section summary | urn:uuid:01a15e6a-2d0b-72f6-aca7-96158e23ed6a | Upstream removes or corrects these exceptions | No runtime replication is included |

The evidence is partial documentation coverage. These claims do not establish
which instructions any particular active session loaded.
