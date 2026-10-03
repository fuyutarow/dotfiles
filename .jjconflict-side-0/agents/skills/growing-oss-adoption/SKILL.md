---
name: growing-oss-adoption
description: >-
  Builds developer-facing open source that spreads; owns the adoption surface, not generic startup
  marketing. Use when naming, positioning, launching, documenting, distributing, monetizing,
  governing, sustaining, releasing, or diagnosing adoption of an OSS project. Triggers include OSS
  / open source / 公開 / 普及, developer or CLI tool, library/SDK/framework/language/MCP server,
  drop-in replacement, Show HN, launch/ローンチ, README/landing page, benchmark, naming/tagline,
  static binary, package managers, framework defaults, marketplaces, community/governance,
  licenses/relicensing, open-core, maintainer burnout, diffusion, and crossing the chasm. Cut:
  implementation and crate choice → language/domain skills; HERE owns adoption mechanisms. Cheap,
  reversible adoption trials use the domain executor; AOH fires only when an untested result guards
  expensive/irreversible exposure. Evidence gathering may fan out, but regime, fork, and diagnosis
  verdicts stay solo. English skill; answer in the user's language.
---

# Growing OSS adoption — why developer tools spread, and how to build one that does

> **Version**: v2607.1.0 (2026-07-02)
> **What this is**: a field guide and creed (矜持) for the author of a developer-facing OSS project,
> distilled from a 90-agent, adversarially-verified survey of why tools like ripgrep, Vite, uv,
> SolidJS, fzf, Tailwind, and Rust spread — and why equally-good tools died. Every principle here
> survived a hostile re-run for **survivorship bias** and **boundary conditions**; 5 candidate
> principles were judged myths and downgraded.
> **Scope**: developer-facing OSS across five regimes (CLI, library, research, protocol, GUI/extension).
> NOT consumer apps, NOT enterprise sales, NOT generic growth-hacking.
> **The one hard truth this skill exists to deliver**: *love is not adoption, and distribution beats love.*
> A beloved tool that no channel carries dies obscure; an inherited default spreads without being chosen.

## §0. The thesis — two gates, and the regime that decides which physics apply

Spread is a **two-gate** process authors routinely conflate:

1. **DISCOVERY gate** — the tool must be *found and tried*.
2. **ADOPTION gate** — a tried tool must convert to a *habit*, then to a *standard*.

The single most replicable mechanism is **collapsing the cost of the first gate** — friction-removal that
lets one developer reach an undeniable "it works" *alone, fast, and reversibly*. But this is
**necessary-not-sufficient**, and it only applies cleanly to **one of five regimes**. The famous
"single binary + benchmark + Show HN" playbook is the *CLI* playbook — and it actively **misleads** the
other four. **Classify your regime before you copy any tactic (§1).**

Two framings that must stay separate at all times:

- **The launch spike is luck; the engine is sustained substance plus a channel.** The front-page/creator-video
  event is variance (author's prior audience, aggregator lottery, timing, funded DevRel). Build the engine,
  treat the spike as a lottery ticket. → `references/epistemics.md`
- **Funded velocity is a distribution input.** A salaried team's release cadence (Astral's uv/Ruff,
  Vercel-backed tooling) is *bought*, not a reproducible solo itch. Do not read it as something an unfunded
  maintainer can copy.

## §1. Classify your REGIME first — this is the precedence rule

> **Operational tell**: *"Can ONE developer fully decide this is worth it from a short solo trial,
> with no one else needing to adopt?"* **Yes** → DX recruits the first wave. **No** → distribution,
> capability, or inheritance does, and the CLI playbook will lead you astray.

| Regime | Diffusion unit | "Magic moment" is | Win by | Creed items that MISLEAD you |
|---|---|---|---|---|
| **CLI / drop-in / self-hostable infra** | the individual developer (solo trial) | a <5-min binary "it works" | DX · drop-in compat · reproducible benchmark · single binary · zero-config defaults | — (this is the regime the survey samples; the whole playbook applies) |
| **Library / SDK** | the Stack Overflow answer & transitive dependency | a copy-pasteable snippet, one import, zero config | smallest-correct API surface · tutorial/SO coverage · being depended-upon by a popular host | "single static binary" · "5-min binary demo" · "benchmark wedge" |
| **Research / scientific** | the lab, the course, the paper | a reproducible notebook / Colab / leaderboard entry | paper-companion code · citation · model/dataset hub presence | "solo decision" · "curl\|sh" · "HN launch" · "GIF README" |
| **Protocol / standard** | independent **implementers** (N×M complementarity) | a *second* independent implementation | recruiting implementers + a seeding sponsor (LSP/Microsoft, MCP/Anthropic) | "registry" · "binary" · "benchmark" |
| **GUI / editor extension** | marketplace ranking + in-tool recommendation | install-count / rating social proof | marketplace listing (screenshots, ratings) · "recommended extensions" / workspace configs | "README-as-landing-page" · "curl\|sh" · "single binary" |

Most OSS by *count* is libraries; the regimes most relevant to a scientist are research software and protocols.
The corpus over-samples CLIs — so the loudest advice on the internet is the advice that fits *your* project least
unless you are building a CLI. Full treatment, with the acquisition physics and exemplars per regime:
→ `references/regimes.md`.

## §2. The creed — 18 tenets

1. **Win the first developer alone, fast, and reversibly** — but only in the solo-adjudicable regime; for a library win the Stack Overflow answer, for research win the reproducible notebook, for a protocol win the implementers.
2. **Know your regime before you copy a tactic** — the single-binary/magic-moment creed misleads three of the four non-CLI regimes.
3. **Ship a magic moment under five minutes** — but never confuse *converting* traffic with *creating* it; a library's magic moment is a copy-pasteable snippet, not a binary.
4. **Speed is a wedge, not a moat** — it must be 10× and felt *every day*, never 10% on an already-instant path; the speed wedge has a short half-life on the rewrite treadmill.
5. **"Blazing fast AND you lose nothing"** — compatibility gets the migration that speed only *motivates*.
6. **Match the incumbent's surface; spend every gram of novelty underneath.**
7. **Your benchmark will be re-run by a hostile reader** — publish the harness, disclose the bias, show a row you lose; and hold your *own* numbers to that standard.
8. **Defaults are a product** — and for shared-output tools (formatters), the *refusal* of options is the product.
9. **Distribution beats love** — a tool is inherited as a default far more often than it is chosen.
10. **Become the unavoidable default at the highest controlling altitude** — increasingly the LLM's prior and the agent's hardcoded toolset.
11. **A single static binary is a distribution multiplier AND a supply-chain audit-surface argument** — it makes others able to ship you and security reviewers able to clear you.
12. **The README is a human landing page and the error message is a tutorial** — but agents read your *types and docs*, not your GIF; make the machine-facing surface first-class too.
13. **Funded velocity is a distribution input** — do not mistake a salaried team's cadence for a reproducible solo itch.
14. **Discount every "it spread because of X" story** by the graveyard of equally-good tools that died, by the funding/audience confound, and by the platform era it assumes.
15. **The viral spike is luck; the engine is sustained substance plus a channel** — build the engine.
16. **Your incumbent's own decay is your wedge** — but it will be yours next, so pair the wedge with consolidation, correctness, or a network position the next rewrite cannot copy.
17. **Adoption hands you an unfunded obligation** — design bounded responsiveness, credible neutrality, and supply-chain provenance before you need them, and *never relicense an adopted base*.
18. **Your tactics are parameterized on your channel** — a polarizing thesis ranks on HN; a useful tutorial ranks on Qiita — port the *mechanism*, not the move.

## §3. The decision forks — the highest-leverage choices

| Choice | Pick A when… | Pick B when… |
|---|---|---|
| **Drop-in vs new category** | a usable incumbent exists, value is solo-adjudicable, your edge is a measurable delta → match surface, read config, publish head-to-head | you would *lose* a direct feature/maturity comparison and can ship on a genuinely different axis (SQLite/fopen, Docker/shipping) → reframe, do NOT anchor |
| **Lead with speed?** | (a) ~10×/sub-400ms on the user's *real* workload, (b) near-zero switching cost, (c) no output-correctness gate, AND (d) paired with something durable | a correctness-critical path (linker, prod runtime, codegen) or an already-fast-enough incumbent → lead with consolidation/correctness/ergonomics |
| **Anchor vs own a noun** | CLI/self-hostable app in an incumbent-dense category with one universal reference AND you dominate the delta axis | a language, framework, greenfield category, or protocol — the anchor caps your ceiling and brands you a follower (Rust dropped "systems programming") |
| **Withhold config?** | shared-output commodity where uniformity *is* the value (formatters) and an authority can enforce it | libraries/frameworks/build-tools/editors/languages → good-defaults-PLUS-escape-hatch |
| **Distribution path** | a natural higher-altitude host → chase framework-default/embedding (esbuild→Vite, ripgrep→VS Code) | no host → viral demo + dotfiles + package managers (jq/fd/bat); editor/GUI → marketplace ranking; library → tutorial/SO/transitive-dep; emerging top altitude → the LLM prior / agent default / an MCP server |
| **License** | maximize spread/embedding → permissive (MIT/Apache), revenue from an adjacent surface | real hyperscaler-resale threat → copyleft/source-available *up front*. **Never relicense an adopted base** (OpenTofu, Valkey) |

Full 14 decision rules and the choice of *launch artifact* (benchmark vs GIF vs paradigm essay vs notebook vs
implementer-outreach): → `references/decisions.md`.

## §4. The six-phase playbook (summary)

1. **Idea / regime / wedge** — classify the regime; confirm the solo-DX test; verify a "why now" (platform unlock *or* incumbent decay); choose one sharp value axis + a low-risk swap-in.
2. **Build / DX** — zero-config defaults that beat the incumbent's default on run #1; mirror the incumbent's surface and *read its config files verbatim*; namespace your vision under a sub-command (`uv pip` vs `uv add`); single dependency-free binary where there's no shared runtime; errors as onboarding; ship a machine-facing surface (stable types, MCP) as first-class.
3. **README & demo** — first screenful = what/why/show-me in *the medium that proves your claim* (cast for motion, table for speed, snippet for a library, notebook for research); name every incumbent you replace; reproducible benchmark with a row you lose; an anti-pitch section.
4. **Launch** — title by the *outcome*, not the product noun; match tactic to channel (HN polarizing thesis ≠ Qiita useful tutorial ≠ one creator video); answer the hardest objection in public; frame v1 honestly as an existence proof.
5. **Grow & distribute (cross the chasm)** — pursue ONE high-leverage default/embedding; seed the LLM-discovery channel (corpus presence + MCP server); engineer flagship-repo adoption (public configs are greppable social proof); get into the canonical awesome-list.
6. **Sustain & govern** — bounded responsiveness; license as a deliberate lever; editions + automated codemod to evolve without breaking; harden the bus-factor-1 attack surface (XZ); convert users to contributors only once reviewer-bound.

Full per-phase checklist (with the regime branches): → `references/playbook.md`.

## §5. Anti-patterns — the ways good tools die

The five most expensive, in order of how often they sink a *technically good* project:

1. **Applying the CLI playbook to a library, research tool, or protocol** — there is no 5-minute binary trial for `requests`, scikit-learn, or LSP.
2. **Confusing a magic moment with a traffic source** — a flawless demo *converts* arriving developers; it cannot *create* demand (create-react-app, Meteor nailed the moment and died).
3. **Treating a pure-speed wedge as durable** — short half-life on the rewrite treadmill; without consolidation/correctness/network position you are the next incumbent displaced.
4. **Relicensing an adopted base to capture revenue** — BSL/SSPL retroactive relicenses repelled the community and a funded fork took the base (OpenTofu, Valkey). Choose the license up front.
5. **Reading your own launch story as proof of mechanism** — survivorship bias and the post-2008 platform regime both inflate apparent universality.

All 20 anti-patterns: → `references/decisions.md`.

## §6. The epistemic frame — how to read all of the above

Every spread story is sampled on the *winners* and on *one era*. Discount accordingly:

- **Survivorship bias is the dominant honest finding.** Nearly every "it spread because of X" also had a
  pre-existing author audience, funded velocity, a platform-shift prerequisite, a creator channel, or a bundling
  deal. Treat the replicable mechanisms (DX, drop-in compat, reproducible benchmark, single binary, opinionated
  defaults) as **table-stakes that prevent losing**, not as causes of the spike.
- **The whole frame is conditioned on the post-2008 GitHub + universal-package-manager + comment-aggregator regime**,
  and is now being re-parameterized by **LLM-mediated discovery** (models recommend the tool they were trained on;
  agents invoke hardcoded defaults). This may *invert* "newest-fastest-wins" toward "the-tool-the-model-already-knows-wins."
  Era-bound: single binary, `curl|sh`, HN launch, GIF README. Plausibly era-invariant: reduce switching cost,
  reproducible proof to a skeptic, scratch a real pain, distribution beats love.
- **Hold this survey's own numbers to its own standard.** The headline aggregator-launch statistics it leans on
  circulate without a firm published source — illustrative estimates, not measurements.

When the harness offers subagents, hold them to the same standard: the decision forks and the diagnosis
verdict stay **solo**; channel evidence and hostile verification **fan out**. The solo/fan-out map and the
admissibility rule for agent evidence live in `references/epistemics.md` §5. N agents agreeing a tactic will
work is a synthetic launch story, not evidence.

The reflexive frame plus the 14 open research questions (LLM-era diffusion, MCP-as-new-regime, non-English-community
inversion, the true size of the invisible graveyard): → `references/epistemics.md`.

## Reference index — load on demand

| File | Covers | Read when |
|---|---|---|
| `references/regimes.md` | The 5 regimes in depth: acquisition physics, exemplars, the creed items that mislead each | **First**, before any tactical decision — to know which playbook is yours |
| `references/principles.md` | The full 8-cluster taxonomy: each principle with mechanism, named evidence, certainty, and boundary | Justifying a choice, or wanting the *why* and the counterexamples behind a creed line |
| `references/playbook.md` | The full six-phase checklist with regime branches | Actually building/launching — working the steps |
| `references/decisions.md` | All 14 decision rules + all 20 anti-patterns | At a fork (drop-in vs category, speed-or-not, license, governance) or auditing for failure modes |
| `references/case-studies.md` | 14 exemplars (ripgrep, eza, fnm, fzf, Vite, SolidJS, esbuild/SWC/Bun, Rust, Tailwind, Prettier, uv/Ruff, Starship, lazygit) as "what to steal" lists | Wanting concrete, copyable moves from a project like yours |
| `references/epistemics.md` | Survivorship bias, the platform-era conditioning, the LLM-era shift, and the 14 open questions | Reasoning about durability, the future of discovery, or a research agenda on diffusion — or before delegating any diagnosis/verification to subagents |
| `tests/forge-verification-ledger.md` | reforge evidence, warning counts, and debt queue | Auditing this skill itself |
