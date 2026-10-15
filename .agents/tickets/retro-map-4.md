+++
schema = 2
name = "retro-map-4"
outcome = "a structured extraction of 19 retrospectives in /home/fuyu/Workspace/retrospectives (2026-10-09-firedancer-coord-retro2610-0917v6np2.md, 2026-10-09-firedancer-coord-retro2610-0919266sd.md, 2026-10-10-firedancer-coord-retro2610-1010nnzyq.md, 2026-10-11-firedancer-coord-postmortem2610-1114e1block.md, 2026-10-12-codex-windows-conpty.md, 2026-10-12-firedancer-jj-repair.md, 2026-10-12-tmp-inode-recurrence.md, 2026-10-13-firedancer-contract-violations.md, 2026-10-13-firedancer-overnight-retro.md, 2026-10-13-issue-structure.md, 2026-10-14-coordination-blockers-retro.md, 2026-10-14-firedancer-evening-retro.md, 2026-10-14-firedancer-measurement-postmortem.md, 2026-10-15-devx-progress-blockers-retro.md, 2026-10-15-evening-agx-devx-retro.md, 2026-10-15-firedancer-retro-devx-evening.md, 2026-10-15-self-recovery-contradiction-retro.md, 2026-10-16-firedancer-branch-repairs-not-on-main-line.md, 2026-10-16-frustration-review-4.md) for the dotfiles architecture revision: one row per distinct finding with fields finding (one line), evidence (file:section of the retro), kind (negative-space gap | constructive pattern | owner rule), component (which dotfiles part owns it: agx, ws, land, hooks, statusline, capacity/disk-reclaim, presets, skills, herdr, router, coordinator protocol, or 'project-layer' when it belongs to the project, not dotfiles), invariant (the property that would have prevented or preserved it, stated as a checkable claim), check_today (the existing check that enforces it with file:line, or 'none'), and status (resolved with commit id if the retro says so, else open); deduplicate within your group and merge rows that are the same invariant"
writes = ["retro-map-4.tsv"]
verify = []
timeout_s = 1800
premises = []

[proposition]
id = "RETRO-MAP-4"
claim = "every listed retrospective contributes at least one row or is listed as 'no architecture finding' with a reason; every row has all seven fields; check_today cites file:line or says none"
refuted_by = "a listed retrospective missing from the output, or a row with an invariant that is not checkable"
+++

Read the retrospectives fully (they are long; this is careful reading, not skimming). Write the rows as a tab-separated
file `retro-map-4.tsv` in the current directory: the header line (finding, evidence, kind, component, invariant,
check_today, status separated by tabs), then one row per line. For check_today, search /home/fuyu/dotfiles with `rr`
(read-only). Change nothing else. The JSON return's summary is one sentence: how many rows, and how many retros had no
architecture finding.
