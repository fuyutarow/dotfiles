# Agent guidance distillation — 2026-10-21

## Outcome

Both guidance files now point to their current authorities and preserve operational boundaries without duplicating the longer repository manuals. The current files are 7 lines (`AGENTS.md`) and 23 lines (`agents/codex/AGENTS.md`). `jj diff --stat` reports 26 insertions and 96 deletions across the two edits. Counts are physical Markdown lines, including headings and blank lines.

## Removed stale or duplicated claims

- Removed the personal fixed `Sol`/`Terra` dispatch roster and statements about model/effort hook enforcement. The personal entrypoint now delegates worker choice to ordinary `agx` ticket/capability routing and limits enforcement claims to paths actually covered by hooks.
- Removed the claim that skill directories are symlinked. `CLAUDE.md` and `mise.toml` specify that `agents:link` links commands and Codex guidance, while `skills:sync` installs skill copies.
- Removed detailed duplicated deployment, shell, and task instructions from repo guidance; linked its canonical operational and rationale sources instead.
- Removed QODE-specific machine path guidance from the personal entrypoint so it does not present host-specific state as portable policy.

## Retained rules and authorities

| Retained guidance | Authority |
|---|---|
| Read nearest/project instructions; `CLAUDE.md` carries detailed dotfiles policy and README explains invariants | User-provided repository guidance; `CLAUDE.md`; `README.md` → Design — the invariants |
| Topic-first ownership, config registration, mise tasks, one-way declaration-to-runtime flow, one writer, no implicit global toolchain | `CLAUDE.md` Conventions to preserve; `scripts/config-registry.ts`; `mise.toml`; README invariants |
| Commands and Codex guidance are linked, skills are copied by the declared sync task | `CLAUDE.md` Conventions to preserve; `mise.toml` tasks |
| Ordinary `agx` dispatch; no unrequested model/roster pin; claim hook coverage only for actually covered paths | User's dispatch correction; current `agx` ticket/capability workflow; actual hook configuration is the authority for enforcement |
| Skill discovery and retired-skill boundary; personal alias points to its actual definition | User-provided personal guidance; `agents/commands/umada.md`; archived index |
| Classified `rr` search and Serena for known symbols; no alternate-tool bypass; empty output is not proof of absence | Repository `rr` contract and personal search-routing guidance |
| Continuity only with a locus bound for this run; record reconciliation and writer authority | `continuing-long-running-tasks` contract and run-injected continuation instructions |
| Narrow verification and reporting | Repository verification guidance and personal guidance |

## Verification

Requested Markdown check: `rumdl check AGENTS.md agents/codex/AGENTS.md tools/shared/evidence/agents-guidance-distill-20261021.md`.
