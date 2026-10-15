+++
schema = 2
name = "agxspin"
outcome = "agx's spin detector never stops a worker whose consecutive commands are distinct rr queries returning NO_MATCH; a NO_MATCH result is a valid answer, not a tool error"
writes = ["tools/agx/**"]
verify = ["bun test tools/agx", "bunx --bun tsgo --noEmit", "mise run gate:land"]
timeout_s = 1200
premises = ["file:tools/agx/package.json"]

[proposition]
id = "NOMATCH-IS-ANSWER"
claim = "five distinct rr queries in a row that each print RESULT: NO_MATCH do not trigger the spin stop, while five identical failing commands still do"
refuted_by = "a fixture with 5 distinct NO_MATCH rr calls is classified as spin, or a fixture with 5 identical failing commands is not"
+++

Peer report from firedancer (2026-10-14): runs 44b647c6 and d6c74e5b were stopped as "5 identical consecutive tool
errors". The calls were distinct `rr` searches that each returned NO_MATCH. rr prints identical boilerplate (and maybe
a nonzero exit) for NO_MATCH, so the detector sees identical errors.
Do:
1. Find the spin detector in tools/agx (`rr about 'spin detection identical consecutive tool errors'`) and read both
   runs' records read-only to see exactly what it compared.
2. Compare the COMMAND (or its normalized form) plus its output, never the output alone. Treat an rr output with
   `RESULT: NO_MATCH` (and rr's documented NO_MATCH exit, if any) as a successful answer.
3. Fixture tests: distinct NO_MATCH queries are not spin; identical repeated failures still are.
Add a changeset under tools/agx/.changes/. Do not commit or push.
