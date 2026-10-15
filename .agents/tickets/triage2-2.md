+++
schema = 2
name = "triage2-2"
outcome = "a verdict table for 12 abandoned dotfiles workspaces that still hold unlanded changes (kept by `ws gc` 2026-10-16): dotfiles-arm-agx-20261012065423-04856291-9f0a-450d-907e-718cf411ae7b, dotfiles-arm-agx-20261013061601-a1a17789-84bd-4d19-ab61-7582ef98712e, dotfiles-arm-agx-20261013135331-06b09ddf-3844-4a1d-ab32-fd1901ed7366, dotfiles-ws-agx-tmp, dotfiles-ws-cccoom, dotfiles-ws-gitlock, dotfiles-ws-landls, dotfiles-ws-nosync-u05, dotfiles-ws-run-outcome, dotfiles-ws-skillsplug, dotfiles-ws-tmpbytes, dotfiles-ws-versionguard2; for each, from /home/fuyu/.cache/coord/triage2/<name>.patch and <name>.desc only: files touched, what the change does in one line, whether current alpha already has it (cite the alpha commit), and a verdict DROP (already in alpha, superseded, or empty/noise — cite why), LAND (still needed and applies cleanly to alpha), or REDO (still needed but stale; name the conflicting files)"
writes = []
verify = []
timeout_s = 1800
premises = []

[proposition]
id = "TRIAGE2-2"
claim = "every listed workspace has one row with a verdict; every DROP cites an alpha commit or a concrete reason; every LAND names the files"
refuted_by = "a missing workspace, or a verdict without its evidence"
+++

Read-only. Do not run jj inside the workspaces (the sandbox cannot snapshot them); judge from the exported patches against
current alpha (`jj log -r alpha`, `jj file show -r alpha <path>` from /home/fuyu/dotfiles are fine). Return the table in
the summary field of your JSON return.
