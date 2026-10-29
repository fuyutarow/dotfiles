---
type: sok_position
title: "Claude AGENTS native loading — sok"
description: "Documented selection rules; runtime and semantic reuse remain uncertain"
status: draft
sok_id: "01a15e6a-2d0b-72f6-aca7-96167a4d87b8"
generated: { by: "process:documentation-synthesis", at: "2026-10-21T12:46:57Z" }
sok_unit_id: "01a15e6a-2d0b-72f6-aca7-96194927eaa0"
sok_authority_key: "sok/claude_agents_native_loading"
sources:
  - resource: "urn:uuid:01a15e6a-2d0b-72f6-aca7-96158e23ed6a"
  - resource: "urn:uuid:01a15e6a-2d0b-72f6-aca7-9617754a8aa7"
  - resource: "urn:uuid:01a15e6a-2d0b-72f6-aca7-9618a89ffe59"
---

# Native instruction-file selection

Under what documented version, scope and selection conditions does Claude Code
load AGENTS.md?

Native support begins at 2.1.277. In the default claude-md-or-agents-md mode,
project or ancestor CLAUDE instructions take precedence over AGENTS.md.
Global and managed instructions do not suppress project AGENTS.md.
The distinction between project selection and global instruction scope is
therefore necessary when interpreting the documented defaults.

Version eligibility alone does not establish which files an active session
loaded. Selection mode, builtin plugin state and upgrade-session behavior can
affect the result.

## Coverage boundary

The evidence covers one vendor's official memory documentation, limited to
the supplied partial AGENTS.md section summary. It is not a complete literature
review or a runtime replication. Related conceptual coverage and novelty are
not established.
