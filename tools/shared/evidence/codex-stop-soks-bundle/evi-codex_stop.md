---
type: source_evidence
title: "Codex Stop continuation and hook trust — evi"
description: "Published continuation semantics and definition-specific trust"
status: draft
sok_id: "01a15ee4-c885-718a-a604-c7723aa491a8"
generated: { by: "process:documentation-synthesis", at: "2026-10-21T14:37:29Z" }
sources:
  - resource: "https://learn.chatgpt.com/docs/hooks"
    title: "Codex hooks"
  - resource: "https://developers.openai.com/codex/hooks"
    title: "Codex hooks redirect"
sok_locator: "#stop, lines 1671–1694; #review-and-trust-hooks, lines 980–986; inspected 2026-10-21"
sok_capture: locus_only
sok_read_depth: partial
sok_read_scope: "Supplied summary of Stop and review-and-trust-hooks sections"
---

# Published protocol

Stop input includes turn_id:string, stop_hook_active:boolean and
last_assistant_message:string|null; matcher is unused.
Nonempty exit-0 stdout must be JSON. {"decision":"block","reason":"..."} requests
continuation using that reason as a new user prompt; it does not hide or reject
the displayed turn. Exit 2 with stderr reason is an alternative.
