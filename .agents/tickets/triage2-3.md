+++
schema = 2
name = "triage2-3"
outcome = "a verdict table for 12 abandoned dotfiles workspaces that still hold unlanded changes (kept by `ws gc` 2026-10-16): dotfiles-arm-agx-20261013024945-ece0d9a9-55cc-428c-a384-51eb1a2f97a3, dotfiles-arm-agx-20261013065556-b9bb6922-ecc7-452a-b6be-597b117b1b2e, dotfiles-arm-agx-20261013145942-040a53ad-90c7-431d-92ce-390356c72a69, dotfiles-ws-agxsandbox, dotfiles-ws-csparse, dotfiles-ws-gitlockport, dotfiles-ws-nosync-plan, dotfiles-ws-ratecontext2, dotfiles-ws-runcommit, dotfiles-ws-statusline-tmpfs, dotfiles-ws-tools-spec, dotfiles-ws-worker-jj-guard; for each, from /home/fuyu/.cache/coord/triage2/<name>.patch and <name>.desc only: files touched, what the change does in one line, whether current alpha already has it (cite the alpha commit), and a verdict DROP (already in alpha, superseded, or empty/noise — cite why), LAND (still needed and applies cleanly to alpha), or REDO (still needed but stale; name the conflicting files)"
writes = []
verify = []
timeout_s = 1800
premises = []

[proposition]
id = "TRIAGE2-3"
claim = "every listed workspace has one row with a verdict; every DROP cites an alpha commit or a concrete reason; every LAND names the files"
refuted_by = "a missing workspace, or a verdict without its evidence"
+++

Read-only. Do not run jj inside the workspaces (the sandbox cannot snapshot them); judge from the exported patches against
current alpha (`jj log -r alpha`, `jj file show -r alpha <path>` from /home/fuyu/dotfiles are fine). Return the table in
the summary field of your JSON return.
