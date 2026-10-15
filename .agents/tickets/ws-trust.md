+++
schema = 2
name = "ws-trust"
outcome = "`ws add <slug>` leaves a workspace a sandboxed worker can use: after creating <repo>.ws/ws_<slug> it runs `mise trust` on that workspace's mise config (and any config the repo's .ws.toml readiness declares) outside the sandbox, so a worker inside the sandbox never has to write ~/.local/state/mise/trusted-configs (read-only there); the readiness output says it trusted the path"
writes = ["tools/workspace/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/workspace", "mise run lint:ts", "mise run lint:bun", "mise run typecheck"]
timeout_s = 1500
premises = ["file:tools/workspace/src/ws.ts"]

[proposition]
id = "WS-TRUST"
claim = "fixture: after `ws add demo` in a repo with a mise.toml, `mise trust --show` (or the equivalent check) reports the new workspace's config as trusted, with a temp MISE_STATE_DIR"
refuted_by = "a workspace created by ws add whose mise config is untrusted"
+++

Incident 2026-10-16 11:1x: preset-textlint's worker died after 5 identical errors: `mise ERROR error parsing config file:
~/dotfiles.ws/ws_preset-textlint/mise.toml … failed to ln -sf … trusted-configs … Read-only file system`. Workspaces made by
the old coordinator script were trusted by hand; `ws add` does not trust. Use a temp MISE_STATE_DIR in tests. lint:no-sync
is on alpha (add no sync calls). You cannot rebase in the sandbox. Definition of done: `mise run hook:pre-commit` exits 0;
paste its last 5 lines. Test data outside the workspace. Do not commit or push.
