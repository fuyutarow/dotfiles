# Dotfiles retrospectives

Retro files preserve the narrative, observations, proposals, and positive outcomes. Their lesson IDs are stable references; status and recurrence dates live only in [register.toml](register.toml).

| Record | Subject | Lessons |
| --- | --- | ---: |
| [2610-0a.md](2610-0a.md) | dotfiles:retro_2610.0 part 1 — 2026-10-10 night to 10-11 | 18 |
| [2610-0b.md](2610-0b.md) | dotfiles:retro_2610.0 part 2 — VSS through disk-reclaim | 11 |

The register is the feedback index. Before acting on new owner feedback, search it first with `rr about '<feedback text>'` or inspect/filter it with `mise run retros:check -- --json | jq 'select(.needs_enforcement)'`. If the feedback matches an existing lesson, append a recurrence with `mise run retros:recur -- <id> [--date YYYY-MM-DD]` instead of adding another row. Use `mise run retros:check` to validate the register; it prints one lesson ID per line, marked `needs-enforcement` when a manual lesson has recurred.

IDs retain their original source identity (`R2610-0A-*` and `R2610-0B-*`). Positive observations remain in the narrative and are not lessons. The register also includes memory and session lessons. Enforcement loci name the repository artifact responsible for applying each lesson; `manual` repeated lessons need a durable enforcement mechanism.
