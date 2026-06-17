# Community methodologies — steal the discipline, skip the ceremony

> Scope: when a heavyweight workflow framework (Superpowers / Spec-Kit / BMAD) is tempting,
> what to *steal* (the discipline) and what to *skip* (the ceremony). Default is **vanilla** —
> the discipline these frameworks sell is largely **built into the base tool** (SKILL.md §0, P2).
> Parent: SKILL.md §0 "Match tool weight to task size."

## The decision ladder — default to VANILLA, escalate only when forced

Reach for the **lightest** rung that holds. Each step up costs tokens, setup, and lock-in.

| Situation | Tool | Why this rung |
|---|---|---|
| Diff describable in **one sentence** | Just prompt — no plan mode | Ceremony is pure overhead |
| **Uncertain / multi-file / risky** | Native **plan mode** (`Shift+Tab`), OR interview → write **`SPEC.md`** → execute in a *fresh* session | Built in; SPEC.md is a throwaway, not a framework |
| Want **enforced TDD / debug discipline** | **Superpowers** — token-light, easy to uninstall | Borrows method without owning your repo layout |
| Team needs **versioned what/how/work artifacts** on disk | **GitHub Spec-Kit** | Durable files survive sessions & reviewers |
| **Large, multi-contributor, long-lived** agile project | **BMAD** | Full ceremony — justified only at real scale |

The bar to leave vanilla is **high**. Per Anthropic's own long-running-agent research, a plain
loop beats elaborate pipelines (see "Anthropic's plain loop" below). Most "you need a framework"
advice is **practitioner X-posts** (Boris Cherny, Thariq Shihipar), not formal docs — verify
against `code.claude.com/docs` before adopting.

---

## Superpowers (`obra/superpowers-marketplace`)

A Claude Code **plugin marketplace** of TDD/debug skills + a session-start hook. Main repo:
`github.com/obra/Superpowers`. Requires **Claude Code 2.0.13+**.

```bash
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

**STEAL — the capitalized-Iron-Law + red-flag-table SKILL.md style.** Its skills front-load a
single non-negotiable rule in caps that **targets the model's own rationalization** — e.g.
**`NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`** — then a table of "red flags" (excuses you
might invent to skip the law) paired with the correct move. This is the most portable idea here:
write your *own* skills in this voice. The enforced loop is plain **RED/GREEN TDD** — write a
failing test, implement only enough to pass.

**How it triggers:** a **session-start hook** instructs Claude *"If you have a skill to do
something, you must use it to do that activity"* and to search/read skills by script. This is
description-matching, **not a guarantee** (SKILL.md §4) — **test that your skill actually fires.**

| Use it | Skip it |
|---|---|
| You want enforced TDD/debug rigor on real feature work | A typo, a one-liner, a rename — **overkill** |
| You want a battle-tested SKILL.md voice to copy | — |

- Governs **ONE task at a time** — it is not a multi-task orchestrator.
- **Easy to uninstall** (`/plugin` remove), token-light — low-commitment trial. Steal the style
  even if you never install it.

---

## GitHub Spec-Kit (`github/spec-kit`)

"Spec-Driven Development": specs become *executable* — they generate the implementation, not just
guide it. Installs a `specify` CLI + slash commands into your agent.

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@vX.Y.Z
specify init <project-name> --integration <agent>
```

**STEAL — the what / how / work split as durable on-disk files**, one folder per feature:

| File | Role | Skeleton mnemonic |
|---|---|---|
| `specs/{feature}/spec.md` | functional spec — the **what** | spec = what |
| `specs/{feature}/plan.md` | technical plan — the **how** | plan = how |
| `specs/{feature}/tasks.md` | task breakdown — the **work** | tasks = work |

Also: `.specify/memory/constitution.md` (project principles), plus optional `research.md`,
`data-model.md`, `contracts/`, `quickstart.md`. Core commands: `/speckit.constitution`,
`/speckit.specify`, `/speckit.clarify`, `/speckit.plan`, `/speckit.tasks`, `/speckit.implement`,
`/speckit.analyze`, `/speckit.checklist`.

The portable insight: **persist what/how/work as files that outlive the context window** — a
reviewer or a fresh session reads `spec.md`/`plan.md`/`tasks.md` cold. You can reproduce the split
with three plain markdown files; the CLI just standardizes it.

| Use it | Skip it |
|---|---|
| Team needs versioned, reviewable spec→plan→task artifacts | **Solo / short-lived** work — three throwaway files beat a toolchain |

---

## BMAD (`bmad-code-org/BMAD-METHOD`)

**B**reakthrough **M**ethod for **A**gile **AI**-**D**riven **D**evelopment. A full agile-team
simulation: **12+ domain-expert personas** (PM, Architect, Developer, UX, …) across a
brainstorm→PRD→architecture→deployment lifecycle.

```bash
npx bmad-method install          # prerelease: npx bmad-method@next install
```

**STEAL — sharding a big plan into small story files**, each sized to fit a **fresh context
window**. A large plan/PRD is broken into self-contained story files; each is implemented in its
own clean session, so no single context has to hold the whole project. This is the one idea worth
lifting even at small scale — it is just SKILL.md §0's "one feature at a time" with a file
boundary, and it composes with Spec-Kit's `tasks.md`.

**SKIP — the rest.** BMAD imports **full agile ceremony** (multi-persona handoffs, the whole
lifecycle). That weight is justified **only at scale** — large, multi-contributor, long-lived
projects. On a solo or single-feature task it is the canonical anti-pattern (SKILL.md §4,
"heavyweight frameworks on small/solo tasks").

| Use it | Skip it |
|---|---|
| Large multi-contributor agile program needing role separation | Anything one person can hold in their head — **overkill** |

---

## Anthropic's plain loop — the baseline these frameworks compete with

[Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
prefers a **PLAIN loop** over elaborate orchestration. The harness, distilled:

- **`claude-progress.txt`** — progress notes the agent reads at session start and updates at end.
- **Git history** with descriptive commits as the durable record.
- **`feature_list.json`** — features with a `passes` field; the agent edits **only the status**.
- **One feature at a time**, with **self-verify** (run tests on the dev server) before marking
  done.

Verbatim guardrail, worth copying into your own prompts:

> *"It is unacceptable to remove or edit tests because this could lead to missing or buggy
> functionality."* · *"Only mark features as 'passing' after careful testing."*

And the load-bearing caveat against framework hype — they are **explicitly uncertain** that
multi-agent beats a single agent:

> *"it's still unclear whether a single, general-purpose coding agent performs best across
> contexts, or if better performance can be achieved through a multi-agent architecture."*

So: a progress file + git + one feature + self-verify reproduces most of what the frameworks sell.
Reach for vanilla first (this maps directly to SKILL.md §2's verification loop).

---

## Verify the hype before you adopt

| Claim you'll hear | Reality |
|---|---|
| "**174k stars**" / "**10×**" / "STOP everything" | Uncorroborated / likely inflated marketing — do not repeat as fact (SKILL.md §4) |
| "The skill **auto-triggers** when relevant" | Description-**matched**, **not guaranteed** — invoke a test case and confirm it fires |
| "Best-practice tip from \<famous name\>" | Many "tips" are practitioner **X-posts** (Boris Cherny, Thariq Shihipar), not docs — verify against `code.claude.com/docs` |

**Rule of thumb:** adopt the *discipline* (Iron-Law voice, what/how/work files, story sharding,
the progress-file loop) by writing it into your own CLAUDE.md / Skills / SPEC.md. Adopt the
*framework itself* only when the scale test in the ladder above is unambiguously met.

## Sources

- [Anthropic — Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Superpowers (blog.fsck.com, obra)](https://blog.fsck.com/2025/10/09/superpowers/) · repo: [github.com/obra/Superpowers](https://github.com/obra/Superpowers)
- [GitHub Spec-Kit](https://github.com/github/spec-kit)
- [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)
