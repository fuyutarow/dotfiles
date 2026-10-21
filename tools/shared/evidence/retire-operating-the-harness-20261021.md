# Retirement evidence — operating-the-harness

Date: 2026-10-21  
Status: complete — owner-requested retirement

## Intended outcome

Remove `operating-the-harness` from the callable source inventory, retain its complete manual
under `archives/skills/`, preserve executable consumers, and replace active mandatory invocation
with local task guidance or an explicit archived-reference rule.

## Result

`operating-the-harness` no longer exists below `agents/skills/`, so the normal in-house skill
inventory and `skills:sync` cannot install it as a callable skill. The complete historical package
is retained at `archives/skills/operating-the-harness/`, indexed by the dated archive entry.

The two executable checks were retained as live, non-skill contracts at `scripts/harness/`:

- `scope-check.ts` remains the implementation for `scope-check` and `lint:harness-scope`.
- `gate-diagnostics-check.ts` remains the implementation for `gate-diagnostics-check` and
  `lint:gates`.

Their historical source copies remain in the archive. The live copies differ only in the opening
ownership comment; behavior was not changed.

## Active reference audit

All active `SKILL.md` and active reference callers that routed to this skill now say to inspect the
repository's declared local configuration and executable checks. The active skill index, README,
and `CLAUDE.md` no longer list it. Historical test ledgers, the listing-budget history, archive,
and AGX caller inventory retain dated references only; they do not make a skill callable.

## Source and installation status

The source directory is absent from `agents/skills/`. At inspection time, both installed home
copies (`~/.agents/skills/operating-the-harness` and `~/.claude/skills/operating-the-harness`) were
still present; this workspace must not deploy them. After the accepted source lands, the coordinator
must run `mise run skills:sync` from the accepted main source. Its stale-skill reconciliation
removes both installed copies.

## Narrow checks

- `SKILLS_LINT_WORKTREE=1 bun scripts/lint-skills-floor.ts` exited 0: 56 active skills and
  49,116 static name-plus-description characters; it reported 77 existing prose-debt warnings.
- `SKILLS_LINT_WORKTREE=1 bun scripts/lint-skills-index.ts` exited 0: the active skill index is
  complete after removal.
- A classified `rr` active-caller audit found no remaining reference in active `SKILL.md` or
  `references/` content.
- `rumdl check archives/skills/README.md
  tools/shared/evidence/retire-operating-the-harness-20261021.md` exited 0.
- The recorded budget remains unchanged: its prior 68-skill measurement differs by more than this
  one retirement, so lowering it here would absorb unrelated working-tree state. The retained cap
  remains a safe upper bound.

No release changeset was created: this is an internal skill retirement and an executable-path move
with unchanged public command behavior.
