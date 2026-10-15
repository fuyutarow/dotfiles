+++
schema = 2
name = "retro-map-5"
outcome = "a structured extraction of 19 retrospectives in /home/fuyu/Workspace/retrospectives (2026-10-09-firedancer-coord-retro2610-09185mkvp.md, 2026-10-09-firedancer-coord-retro2610-0919f353p.md, 2026-10-10-firedancer-coord-retro2610-1017tt5rc.md, 2026-10-11-firedancer-coord-retro2610-1102dnfp7.md, 2026-10-12-dotfiles-coordinator.md, 2026-10-12-firedancer-no-decisive-result.md, 2026-10-13-dotfiles-cli-devx-retro-2.md, 2026-10-13-firedancer-devx-design-space-retro.md, 2026-10-13-firedancer-research-collapse-postmortem.md, 2026-10-13-timeouts-retro.md, 2026-10-14-coral-dpp-core-design-retro.md, 2026-10-14-firedancer-frustration-review.md, 2026-10-14-firedancer-retrieval-and-devx-retro.md, 2026-10-15-disk-tmp-exhaustion-postmortem.md, 2026-10-15-firedancer-issue-structure-afternoon.md, 2026-10-15-integration-pipeline-retro.md, 2026-10-15-ticket-home-retro.md, 2026-10-16-firedancer-devx-and-concept-consolidation.md, 2026-10-16-frustration-review-5-and-devx.md) for the dotfiles architecture revision: one row per distinct finding with fields finding (one line), evidence (file:section of the retro), kind (negative-space gap | constructive pattern | owner rule), component (which dotfiles part owns it: agx, ws, land, hooks, statusline, capacity/disk-reclaim, presets, skills, herdr, router, coordinator protocol, or 'project-layer' when it belongs to the project, not dotfiles), invariant (the property that would have prevented or preserved it, stated as a checkable claim), check_today (the existing check that enforces it with file:line, or 'none'), and status (resolved with commit id if the retro says so, else open); deduplicate within your group and merge rows that are the same invariant"
writes = ["retro-map-5.tsv"]
verify = []
timeout_s = 1800
premises = []

[proposition]
id = "RETRO-MAP-5"
claim = "every listed retrospective contributes at least one row or is listed as 'no architecture finding' with a reason; every row has all seven fields; check_today cites file:line or says none"
refuted_by = "a listed retrospective missing from the output, or a row with an invariant that is not checkable"
+++

Read the retrospectives fully (they are long; this is careful reading, not skimming). Write the rows as a tab-separated
file `retro-map-5.tsv` in the current directory: the header line (finding, evidence, kind, component, invariant,
check_today, status separated by tabs), then one row per line. For check_today, search /home/fuyu/dotfiles with `rr`
(read-only). Change nothing else. The JSON return's summary is one sentence: how many rows, and how many retros had no
architecture finding.
