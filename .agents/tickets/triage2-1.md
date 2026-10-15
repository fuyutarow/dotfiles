+++
schema = 2
name = "triage2-1"
outcome = "a verdict table for 12 abandoned dotfiles workspaces that still hold unlanded changes (kept by `ws gc` 2026-10-16): dotfiles-arm-agx-20261012055505-6cb66dfd-eaa0-48be-a683-3ab9f1a8c591, dotfiles-arm-agx-20261013025132-3f51c0c6-00cb-4889-a1e2-2498f6689956, dotfiles-arm-agx-20261013124152-b9abec4c-d06c-43a8-bf5c-478dc8622bcf, dotfiles-ws-agentname, dotfiles-ws-agxspin, dotfiles-ws-gatepure, dotfiles-ws-jjsafe4, dotfiles-ws-nosync-u04, dotfiles-ws-run-commit2, dotfiles-ws-runslug, dotfiles-ws-tmp-leaks, dotfiles-ws-versionguard; for each, from /home/fuyu/.cache/coord/triage2/<name>.patch and <name>.desc only: files touched, what the change does in one line, whether current alpha already has it (cite the alpha commit), and a verdict DROP (already in alpha, superseded, or empty/noise — cite why), LAND (still needed and applies cleanly to alpha), or REDO (still needed but stale; name the conflicting files)"
writes = []
verify = []
timeout_s = 1800
premises = []

[proposition]
id = "TRIAGE2-1"
claim = "every listed workspace has one row with a verdict; every DROP cites an alpha commit or a concrete reason; every LAND names the files"
refuted_by = "a missing workspace, or a verdict without its evidence"
+++

Read-only. Do not run jj inside the workspaces (the sandbox cannot snapshot them); judge from the exported patches against
current alpha (`jj log -r alpha`, `jj file show -r alpha <path>` from /home/fuyu/dotfiles are fine). Return the table in
the summary field of your JSON return.
