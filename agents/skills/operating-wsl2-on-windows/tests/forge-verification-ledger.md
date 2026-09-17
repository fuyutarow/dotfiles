# Forge verification ledger — operating-wsl2-on-windows

## Provenance

Distilled 2026-09-17 from a live incident-and-repair session on one WSL2-on-Windows-Home compute
host (r99), not from a document corpus. Every deny-list row and lever is a measured event from that
session; the machine-specific values (paths, IPs, task defaults) are DELIBERATELY excluded from the
skill and live in project memory + untracked config — the skill is machine-agnostic.

## Calibration (Step 2 — the inversion)

The model's DEFAULT failure is the SAME direction as the source's target failure: read one
instantaneous host number, trust the gauge, follow the junction, assume fstrim reclaims. Proven — the
forging model itself made FOUR such confident-wrong calls in the source session before the code
caught them (host CPU 87% instantaneous vs 17-28% sustained; pgscan cumulative-as-rate; free-vs-
available memory; the Application Data junction loop reading 647 GB of phantom data). So the deny-list
gets top prominence: it is the skill's reason to exist.

## F1 OPERATIONALITY — artifacts each rule names

- The deny-list table → the runnable form is `mise run wsl:audit` (`scripts/wsl-audit.ts`), which
  applies every fix and has unit tests (`scripts/tests/wsl-audit.test.ts`, mutation-checked).
- The reclaim ladder → `reclaim:host` / `reclaim:vhdx` / `reclaim:clean|builds|system` mise tasks.
- The recovery ladder → `mise run wsl:wake` (`scripts/wsl-wake.ts`), unit-tested host-selection.
Every rule changes a tool call or names a task; no line is narration-only.

## F2 PLACEMENT — the cut

One overlapping sibling: `securing-remote-access`. Cut = ACCESS (set up/secure/keep-reachable) vs
OPERATE (storage/reclaim/measure/recover-when-wedged). The one collision was LIFECYCLE: its
`wsl2-mac.md` Setup 4 owns the keepalive-pin CONFIG (prevention). Resolved MECE by localizing:
prevention config stays there, recovery lives here, and `references/lifecycle.md` points there for the
config rather than duplicating it. Reciprocal pointer added to `wsl2-mac.md` Setup 4 (2026-09-17). No
retirement needed — the two are complementary, not redundant.

## F4 STANDING — budget

New skill; charges its name+description on every turn. Ceiling was at 60,228 with ~7 chars headroom,
so this admission requires raising it. Raise recorded in `agents/skills-listing-budget.json` in the
same commit, reason: a genuine ownership void (no sibling owned WSL2-on-Windows resource/disk/recovery
operation) plus a deny-list proven load-bearing by four measured failures in the source session.
Description kept tight to minimize the charge.

## F3 SELF-VERIFICATION

- Build-order verify: `test -f SKILL.md && test -d references && test -d tests` (knowledge skill;
  no scripts/ floor).
- Trigger set: `tests/triggers.md` — 9 fire, 7 near-miss no-fire, 2 co-fire.
- Adversarial verification: run after drafting; findings recorded below.

### Verification findings

| Date | Lens | Finding | Disposition |
|---|---|---|---|
| 2026-09-17 | floor (skill-check) | exit 0 — no prose-debt WARNs across SKILL.md and references/ after two tightening passes; the >400-char routing cell split | PASS |
| 2026-09-17 | budget (lint:skills-floor) | +1024 chars; ceiling raised 60228→61245 with reason in skills-listing-budget.json | PASS |
| 2026-09-17 | link:skills | links cleanly into ~/.claude/skills; structure (SKILL.md + references/ + tests/) verified | PASS |
| 2026-09-17 | adversarial fleet (5 lenses, workflow wf_fec6313f) | 5 agents, 0 errors; 461k tokens; findings below | 1 blocker + 5 major + 5 minor, all fixed |

### Adversarial fleet dispositions (2026-09-17)

| Lens | Severity | Finding | Fix applied |
|---|---|---|---|
| accuracy | BLOCKER | compaction refuses a sparse vhdx ("must not be sparse"); printed procedure would fail | `reclaim-vhdx.ts` pickMethod now prepends `--set-sparse false`; reclaim.md + SKILL.md deny-list note the precondition; a test asserts clear-sparse-before-compact |
| accuracy | major | `--set-sparse true` gated behind `--allow-unsafe` (WSL 2.5.6+) with corruption reports | deny-list row + reclaim.md + script note the gate and risk; "already sparse" reframed as per-box `fsutil` fact |
| accuracy | minor | `--resize`/sparse mutual-exclusivity claim was unsourced | corrected: `--resize` changes max size only, reclaims nothing |
| cut-refuter | major | reciprocal pointer asymmetric — securing-remote-access SKILL.md had none | added a top-level "Routing — the one sibling cut" to securing-remote-access/SKILL.md |
| cut-refuter | major | LAN-alias ownership gap (who provisions `wsl:wake`'s LAN route) | lifecycle.md states both routes are ssh aliases in config.local, provisioning owned by securing-remote-access |
| cut-refuter | minor | keepalive schtask + wsl:wake share the `wsl.exe --exec` primitive, uncross-referenced | lifecycle.md notes the shared primitive and mirror-on-rename |
| completeness | major | machine name "r99 measurements" leaked into SKILL.md | changed to "measured anchors" |
| completeness | major | claims vmmemWSL coverage but had no MEMORY reclaim lever | added a memory reclaim table (memory=/autoMemoryReclaim/swap=0/shutdown) |
| completeness | major | no RELOCATE lever (`wsl --manage --move`) — the durable fix for an undersized C: | added a relocate row to the ladder (SKILL.md + reclaim.md) |
| completeness | minor | no swap=0/swapfile prevention counterpart to reclaim:host | added to the memory table |
| completeness | major | no VM-death/crash-loop unreachability class (distinct from idle-stop) | added a 4th lifecycle row + a wake-vs-revive note |
| operationality | minor | measurement.md "measured anchors" bullets duplicated/drifted from wsl-audit.ts comments | replaced with a one-source-of-truth pointer to the code |
| operationality | minor | routing cell packed 3 decisions as prose | split into labeled Cut/Order/Keys clauses |
| trigger-deskcheck | minor (PASS) | fire #6 collides with securing-remote-access's broad WSL2 trigger | added a co-fire note to triggers.md |
