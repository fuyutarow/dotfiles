+++
schema = 2
name = "herdr-btm-2"
outcome = "the btm pane is visible in herdr's agents sidebar with its CPU, RAM and tmpfs summary, using only what herdr supports: today (commit 43e6cca2) herdr/config.toml declares [ui.sidebar.agents.rows_by_agent] for `btm`, and `herdr config check` rejects it ('unknown canonical agent id `btm` in sidebar rows_by_agent; using defaults'), so the custom row never renders; read herdr's own agent API (`herdr --skill`, `herdr agent --help`, https://herdr.dev/agent-guide.md) to find the supported way for a non-canonical pane to appear with text (for example the reported title, status message, or a canonical id herdr allows for custom tools), make btmp report through it, and remove the rejected config"
writes = ["herdr/config.toml", "tools/herdr-btm/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/herdr-btm", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2400
premises = ["file:herdr/config.toml", "file:tools/herdr-btm/src/btmp.ts"]

[proposition]
id = "HERDR-BTM-VISIBLE"
claim = "`herdr config check` prints no warning for herdr/config.toml; the herdr API documentation cited with URL or help text shows the field btmp now uses is rendered in the agents sidebar; with a live herdr server, `herdr agent list` (or the equivalent read command) shows the btm entry with the summary text"
refuted_by = "a remaining config warning, a field the docs do not say is rendered, or no btm entry in the live list"
+++

If herdr offers no supported way for a non-canonical pane to appear in the agents sidebar, stop and return the evidence
(doc excerpt or help text) and the closest supported alternative; do not patch herdr itself. Add no sync calls. Do not
rebase; land rebases. Record `mise run hook:pre-commit` exit code and last line in the checks field of your JSON return.
Test data outside the workspace. Do not commit or push.
