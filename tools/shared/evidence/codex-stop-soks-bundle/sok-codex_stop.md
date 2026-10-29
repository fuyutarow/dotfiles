---
type: sok_position
title: "Codex Stop continuation and hook trust — sok"
description: "Published continuation semantics and definition-specific trust"
status: draft
sok_id: "01a15ee4-c886-71cf-b041-abdd60ad7fad"
generated: { by: "process:documentation-synthesis", at: "2026-10-21T14:37:29Z" }
sources:
  - resource: "urn:uuid:01a15ee4-c885-718a-a604-c7723aa491a8"
  - resource: "urn:uuid:01a15ee4-c886-71cf-b041-abde77d4e37d"
  - resource: "urn:uuid:01a15ee4-c886-71cf-b041-abdf243cb243"
sok_unit_id: "01a15ee4-c886-71cf-b041-abe02786acf6"
sok_authority_key: "sok/codex_stop_continuation_trust"
---

# Question

How do Stop continuation and hook trust interact?

Continuation preserves displayed output. Nonmanaged user, project and plugin
hooks require review and trust of the exact definition hash; new or changed
definitions are skipped until trusted through hook review. Managed policy is
separate. Configuration presence does not establish execution.
