+++
schema = 2
name = "herdr-btm"
outcome = "the herdr agents sidebar lists a btm pane as its own row: one obvious entry (a shell function or bin, e.g. `btmp`) starts btm in the current herdr pane, registers that pane with `herdr pane report-agent --source btm --agent btm --state idle <pane> -- btm` (so herdr restores it after a restart) and, while btm runs, reports display tokens every few seconds with `herdr pane report-metadata` ($cpu, $ram, $tmp: CPU %, RAM used/total, tmpfs free bytes+inodes) taken from the same measurement code the statusline Sys line uses (no second measurer); herdr/config.toml gains a `rows_by_agent.btm` layout (line 1: state icon + name, line 2: the three tokens, coloured like the statusline); the reporter stops and releases the pane (`herdr pane release-agent`) when btm exits; outside herdr the entry just runs btm"
writes = ["herdr/**", "zsh/aliases.zsh", "tools/statusline/src/host-load.ts", "tools/statusline/src/storage.ts", "tools/herdr-btm/**", "package.json", "scripts/config-registry.ts", "tools/*/.changes/*.md"]
verify = ["herdr config check", "mise run lint:ts", "mise run lint:bun", "mise run test:zsh"]
timeout_s = 2400
premises = ["file:herdr/config.toml", "file:tools/statusline/src/host-load.ts"]

[proposition]
id = "HERDR-BTM-ROW"
claim = "with a fake herdr socket (the pattern tools/statusline tests already use) the entry sends one report-agent for the pane with agent=btm and resume arg btm, then report-metadata with cpu/ram/tmp tokens at its interval, and release-agent on exit; `herdr config check` accepts the new rows_by_agent.btm; outside herdr ($HERDR_* unset) it execs btm without reporting"
refuted_by = "a btm pane that does not appear as an agent row, a reporter that keeps running after btm exits, or metrics computed by a second measurement path"
+++

Owner request 2026-10-16: "herdr の agents tab に btm も表示させることはできませんか". Facts: `herdr pane report-agent
--source <ID> --agent <LABEL> --state idle|working|blocked|unknown <PANE_ID> [-- RESUME_ARG...]`, `herdr pane
report-metadata --source <ID> [--agent <LABEL>] <PANE_ID>` (tokens), `herdr pane release-agent`; existing rows layout and
token conventions are in herdr/config.toml:119-137 ($model/$effort/$rc reported by tools/statusline). The sidebar cannot
embed a TUI: the row is a summary and a jump target. If a new bin is needed, follow the repo rule (package.json bin via
`bun link`, never a hand-made ~/.local/bin symlink). Read `herdr --skill` for the API before coding. Test data outside the
workspace. Do not commit or push.

## Current state (coordinator, 10:0x — single current version)
Your change was accepted; land's commit gate now includes lint:no-sync (landed 3008e6be) and refused it: "982 site(s),
baseline 981 — FAIL": your change adds one synchronous fs/child_process call. Rebase onto alpha (`jj rebase -r @ -d
alpha`), make that call async, or — only if it must stay synchronous — mark it `// sync-ok: <reason>`. Definition of done:
`mise run hook:pre-commit` exits 0 in this workspace; paste its last 5 lines in your return. Test data outside the
workspace. Do not commit or push.

