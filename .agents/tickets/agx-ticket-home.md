+++
schema = 2
name = "agx-ticket-home"
outcome = "agx provides the one ticket mechanism every project uses, implementing the 2026-10-15 decision (retrospectives records/20261015_ticket-home-retro.md, invariants K-1..K-6) that was never built: (K-1) a ticket's home is `<repo>/.agents/tickets/` by default, or the durable directory a repo declares in `<repo>/.agx.toml` (`tickets = \"<path>\"`), and `agx check` warns when a ticket path is volatile (/tmp, a session scratchpad, ~/.cache) or outside the declared home; (K-2) `agx run` copies the ticket verbatim plus its sha256 into the run directory and records the hash; (K-3) the run record holds the --cd tree's commit id (base_rev) and the commit each premise resolved in, and a declared `base_rev` that differs stops the run before launch; (K-4) a re-dispatch that replaces an earlier run records `supersedes`, a continuation keeps `continues`; (K-6) typed ticket fields replace prose for resources, target rev, external reads, interim-report deadline, network and sandbox, and `agx check` validates them; (N6) a missing required field names the table, the key and a one-line example; tools/agx/docs/scope.md is updated (agx still does not store tickets: the copy is provenance)"
writes = ["tools/agx/src/**", "tools/agx/tests/**", "tools/agx/docs/**", "tools/agx/.changes/*.md"]
verify = ["bun test tools/agx/tests", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 3600
premises = ["file:tools/agx/docs/scope.md"]

[proposition]
id = "AGX-TICKET-HOME"
claim = "tests: a ticket under /tmp gets a check warning naming the declared home; a repo with .agx.toml `tickets` accepts tickets there; a run directory holds ticket.orig.md with a sha256 equal to the recorded hash; base_rev and premise commits are in the run record; a declared base_rev mismatch exits before launch with both ids; a missing [proposition] error names the table, keys and an example; scope.md states the copy is provenance, not storage"
refuted_by = "a run whose ticket cannot be recovered byte-for-byte from its run directory, or a volatile ticket path without a warning"
+++

Read tools/agx/docs/scope.md first and stay within agx's four jobs (route, launch, record, fold); this is record +
check. Do not add a ticket store or ticket listing command. Add no sync calls. Do not rebase; land rebases. Record
`mise run hook:pre-commit` exit code and last line in the checks field of your JSON return. Test data outside the
workspace. Do not commit or push.
