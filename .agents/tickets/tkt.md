+++
schema = 2
name = "tkt"
outcome = "a new repo CLI `tkt` (tools/tkt, package bin `tkt`, spec tools/spec/tkt.md) owns the ticket lifecycle for every repo, the counterpart of `ws` for workspaces (owner decision 2026-10-16: issuance and GC of tickets are outside agx, scope.md 'Ticket storage … Plain files plus jj'): `tkt new <slug> [--from <template>] [--set k=v]... [--each <inputs-file>] [--repo P]` writes `<repo>/.agents/tickets/<slug>.md` (or into the `tickets` directory declared in `<repo>/.agx.toml`), from a template with placeholders, one ticket per input line for --each, and refuses to overwrite; `tkt ls [--repo P] [--json]` prints one line per ticket with its state derived by folding `agx ls --json` (no-run | running | ended-unjudged | accepted | rejected) and whether its workspace landed, storing nothing; `tkt gc [--dry-run] [--repo P]` removes ticket files whose latest run is accepted and landed (jj keeps history; files under a volatile path are reported), never touching tickets with no run, a running run or an unjudged end; it is repo-agnostic like ws (knows jj, agx ls --json and .agx.toml, not dotfiles), with no state file"
writes = ["tools/tkt/**", "tools/spec/tkt.md", "package.json", "bun.lock", "scripts/config-registry.ts", "README.md", "tools/*/.changes/*.md"]
verify = ["bun test tools/tkt", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync", "mise run lint:config-map"]
timeout_s = 3600
premises = ["file:tools/spec/jj-ws.md", "file:tools/agx/docs/scope.md"]

[proposition]
id = "TKT-LIFECYCLE"
claim = "fixture repo + fake `agx ls --json`: `tkt new` writes into .agents/tickets or the .agx.toml directory and refuses to overwrite; `--each` with 3 inputs writes 3 tickets; `tkt ls` shows each of the five states from matching fixture runs; `tkt gc --dry-run` lists exactly the accepted+landed tickets and `tkt gc` removes only those; the tool writes no state file; live probe: `tkt ls --repo /home/fuyu/dotfiles` over the real agx state prints states for the moved tickets (paste a few lines)"
refuted_by = "a gc that touches a no-run, running or unjudged ticket, an overwrite on new, or any stored state"
+++

Model it on tools/jj-ws (Cleye CLI, foreground and loud, `tkt: …` errors, one lock-free read path). Run `rr exists
'<what it does>'` before writing helpers; reuse tools/shared. Add no sync calls. Do not rebase; land rebases. Record
`mise run hook:pre-commit` exit code and last line in the checks field of your JSON return. Test data outside the
workspace. Do not commit or push.
