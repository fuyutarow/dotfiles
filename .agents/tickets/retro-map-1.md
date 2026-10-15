+++
schema = 2
name = "retro-map-1"
outcome = "a structured extraction of 20 retrospectives in /home/fuyu/Workspace/retrospectives (2026-07-03-qoed-postmortem-r2607-020-overview-authority-rot.md, 2026-10-09-firedancer-coord-retro2610-09186tked.md, 2026-10-10-firedancer-coord-retro2610-1000377qm.md, 2026-10-10-firedancer-coord-retro2610-1021cqa4z.md, 2026-10-11-firedancer-coord-retro2610-1110rfc5h.md, 2026-10-12-firedancer-coord-retro2610-1208p4xgg.md, 2026-10-12-firedancer-tmp-enospc.md, 2026-10-13-dotfiles-cli-devx-retro.md, 2026-10-13-firedancer-experiments-layer-violation.md, 2026-10-13-firedancer-theory-salvage-retro.md, 2026-10-14-agx-cutover-retro.md, 2026-10-14-firedancer-brief-devx-retro.md, 2026-10-14-firedancer-issue-structure-night.md, 2026-10-14-issue-structure-retro.md, 2026-10-15-dispatch-architecture.md, 2026-10-15-firedancer-issue-structure-evening.md, 2026-10-15-no-sync-oracle-retro.md, 2026-10-15-tmp-ownership-retro.md, 2026-10-16-firedancer-measurement-to-record-issue-structure.md, 2026-10-16-frustration-review-6.md) for the dotfiles architecture revision: one row per distinct finding with fields finding (one line), evidence (file:section of the retro), kind (negative-space gap | constructive pattern | owner rule), component (which dotfiles part owns it: agx, ws, land, hooks, statusline, capacity/disk-reclaim, presets, skills, herdr, router, coordinator protocol, or 'project-layer' when it belongs to the project, not dotfiles), invariant (the property that would have prevented or preserved it, stated as a checkable claim), check_today (the existing check that enforces it with file:line, or 'none'), and status (resolved with commit id if the retro says so, else open); deduplicate within your group and merge rows that are the same invariant"
writes = ["retro-map-1.tsv"]
verify = []
timeout_s = 1800
premises = []

[proposition]
id = "RETRO-MAP-1"
claim = "every listed retrospective contributes at least one row or is listed as 'no architecture finding' with a reason; every row has all seven fields; check_today cites file:line or says none"
refuted_by = "a listed retrospective missing from the output, or a row with an invariant that is not checkable"
+++

Read the retrospectives fully (they are long; this is careful reading, not skimming). Write the rows as a tab-separated
file `retro-map-1.tsv` in the current directory: the header line (finding, evidence, kind, component, invariant,
check_today, status separated by tabs), then one row per line. For check_today, search /home/fuyu/dotfiles with `rr`
(read-only). Change nothing else. The JSON return's summary is one sentence: how many rows, and how many retros had no
architecture finding.
