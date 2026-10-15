+++
schema = 2
name = "btm-always"
outcome = "the btm row is always present in the owner's herdr agents sidebar without manual steps: herdr-btm-2 (612847e3, config reloaded live 2026-10-16 10:2x, `herdr config check` ok) made a running btmp report CPU/RAM/tmpfs through a supported sidebar token, but on the owner's live server `herdr agent list` shows only claude rows because no pane runs btmp; find herdr's supported way to keep one btmp pane per server (startup/layout/workspace config, a hook on server start, or an idempotent `btmp ensure` command run by an existing timer or shell entry) and implement it so that a server start or a closed btm pane converges back to exactly one btm row; ALSO the owner runs plain `btm` in a herdr pane (screenshot 2026-10-16 10:3x: btm running in tab 2 of dotfiles, agents sidebar shows only Claude rows) — plain `btm` bypasses btmp and never registers; owner decision 2026-10-16: `btm` = `btmp` everywhere — `btm` in an interactive shell always runs btmp (alias or function in zsh/aliases.zsh), and btmp itself decides: inside a herdr pane it registers and reports, outside herdr it simply execs the real btm with the same arguments; btmp must call the real binary by absolute path or `command btm`, never through the alias (no recursion)"
writes = ["herdr/config.toml", "tools/herdr-btm/**", "zsh/aliases.zsh", "tools/*/.changes/*.md"]
verify = ["bun test tools/herdr-btm", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2400
premises = ["file:tools/herdr-btm/src/btmp.ts", "file:herdr/config.toml"]

[proposition]
id = "BTM-ALWAYS"
claim = "on an isolated test herdr server (HERDR_SOCKET_PATH under a temp dir): after server start the agent list has exactly one btm row; after killing that pane it returns to exactly one within the stated convergence time; running the ensure path twice never creates two; a zsh test shows interactive `btm` resolves to btmp; btmp outside a herdr env execs the real btm with its arguments (exit code preserved) and inside one registers; no recursion; the mechanism is cited from herdr's docs or help text"
refuted_by = "zero or two btm rows after start, kill, or a repeated ensure, or a mechanism herdr does not document"
+++

Test only against an isolated herdr server; never create or kill panes on the owner's live server. If herdr offers no
startup mechanism, implement an idempotent ensure command and say which existing trigger should call it; do not add a new
timer without saying so in for_coordinator. Add no sync calls. Do not rebase; land rebases. Record `mise run
hook:pre-commit` exit code and last line in the checks field of your JSON return. Test data outside the workspace. Do not
commit or push.
