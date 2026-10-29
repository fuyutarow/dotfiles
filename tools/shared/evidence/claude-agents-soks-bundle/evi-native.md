---
type: source_evidence
title: "Claude AGENTS native loading — evi"
description: "Documented selection rules; runtime and semantic reuse remain uncertain"
status: draft
sok_id: "01a15e6a-2d0b-72f6-aca7-96158e23ed6a"
generated: { by: "process:documentation-synthesis", at: "2026-10-21T12:46:57Z" }
sources:
  - resource: "https://code.claude.com/docs/en/memory#agentsmd"
    title: "Claude Code memory — AGENTS.md"
sok_locator: "memory#agentsmd; supplied primary-source summary retrieved 2026-10-21"
sok_capture: locus_only
sok_read_depth: partial
sok_read_scope: "Supplied AGENTS.md section summary only; no independent page retrieval"
---

# Source locus

The AGENTS.md section of the official Claude Code memory documentation
describes native support beginning at version 2.1.277. The default selection
mode is claude-md-or-agents-md: project or ancestor CLAUDE instructions take
precedence over AGENTS.md. Global and managed instructions do not suppress
project AGENTS.md.

Other selection modes and builtin plugin state can change loading behavior.
The first session after an upgrade may differ. The builtin plugin identifier
changes at 2.1.285, with the older alias retained. The /memory view can show
loaded instruction files.

This locus-only capture summarizes the supplied partial section summary.
It contains no verbatim quotation and does not establish active-session loading.
