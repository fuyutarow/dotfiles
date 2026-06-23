# The six-phase playbook

Parent: SKILL.md §4. The actionable checklist for building and launching a developer-OSS project.
**Phase 1 changes everything downstream by regime** — do the classification (`regimes.md`) before working
any later phase. Items marked *(CLI)* apply cleanly only to the solo-adjudicable regime.

---

## Phase 1 — Idea / regime / wedge: pick a winnable fight

- **Classify your REGIME first** — CLI/drop-in, library/SDK, research/scientific, protocol/standard, or
  GUI/extension. The binary-and-benchmark playbook applies cleanly only to CLI/drop-in.
- **Run the solo-DX test:** *can ONE developer fully decide this is worth it from a short solo trial, with no one
  else needing to adopt?* If no (org-adjudicated, network-effect, lab/course-inherited, capability-without-substitute),
  expect distribution/capability/inheritance — not DX — to recruit the first wave.
- **If a LIBRARY:** optimize the copy-pasteable snippet and the API surface; plan to win Stack Overflow answers and
  tutorials; target transitive-dependency capture via a popular dependent. There is no binary trial to optimize.
- **If RESEARCH software:** ship a reproducible notebook/Colab; get a paper or leaderboard entry; target lab/course
  inheritance. Adoption is a PI/reviewer decision, not a solo one.
- **If a PROTOCOL:** line up the first *independent* implementers and a seeding sponsor. Your diffusion unit is
  implementers; your "second user" milestone is a second independent implementation.
- **Scratch your own acute, HIGH-FREQUENCY pain** — frequency predicts your *focus* and early credibility, not
  spread. Be honest about whether funded velocity (not just your itch) is doing the work.
- **Verify a "why now":** name the platform shift (browser ESM, mature Rust/SIMD, Apple Silicon + quantization,
  capable LLMs) OR the incumbent decay (webpack/nvm/Babel got heavy) that just made this net-positive.
- **Choose ONE sharp value axis + a low-risk swap-in.** Do *not* fear a broad launch if all-in-one consolidation IS
  the wedge (Bun) or you have funded velocity (Astral).
- **Decide drop-in vs new-category up front** (see `decisions.md`) — they demand opposite README/benchmark/launch moves.

## Phase 2 — Build / DX: collapse time-to-first-success

- **Ship excellent zero-config defaults** that make the first run *visibly better than the incumbent's default*;
  expose the thousand knobs only to people who go looking.
- **If a substitute, mirror the incumbent's CLI/flags/API 1:1 and READ its config artifacts verbatim** (.nvmrc,
  requirements.txt, package.json) so switching is find-and-replace and rollback is trivial.
- **Namespace your opinionated future under a sub-command** (`uv pip` vs `uv add`) so the drop-in compat layer and
  the full vision coexist without breaking early adopters.
- *(CLI)* **Compile to a single dependency-free binary** where the audience lacks a shared runtime; pitch the
  zero-transitive-dependency *audit surface* to enterprise reviewers, not just install convenience.
- **If speed is your wedge:** confirm it crosses the order-of-magnitude / sub-400ms threshold on the user's *real*
  workload, carries no output-correctness leap of faith, and is paired with something the next rewrite cannot copy
  (consolidation, correctness, a registry position).
- **Treat error messages as onboarding:** precise spans, plain-language cause, a suggested fix; for TUIs show
  keybindings on-screen.
- **Make a machine-facing surface first-class:** design the tool as a pipe-friendly primitive AND ship stable types,
  structured docs, and an MCP server where relevant — agents are a primary consumer now.

## Phase 3 — README & demo: the human AND machine landing page

- **First screenful answers what / why / show-me** — lead with the medium that *proves your specific claim*: a
  terminal cast for motion, a benchmark table for speed, a code snippet for a library, a notebook for research.
- **Put the one-liner that names every incumbent you replace** (ripgrep's title; uv's "Replaces pip, pip-tools, pipx,
  poetry, pyenv, twine, virtualenv").
- **If performance-positioned:** publish the benchmark on REAL named corpora, ship the reproducible harness, disclose
  your bias, **include a row you lose**, and explain the mechanism. Disclose if any content is AI-generated.
- **Add a "why you shouldn't use this" / anti-pitch section** — it disarms the critic with an expert audience.
- **Lower the trial path:** a zero-install playground if possible; offer `curl|sh` AND first-class package-manager
  installs (brew/apt/cargo/scoop/winget/nix); for editor/GUI tools, a marketplace listing with screenshots and ratings.
- **Make config a single declarative file** so "steal this person's setup" is a copy-paste.
- **Keep machine-facing docs/types clean** — agents read them instead of your GIF, and being legible to the model is
  becoming a discovery channel.

## Phase 4 — Launch: a contingent distribution event

- **Title the launch by the OUTCOME the reader wants, not the product noun.**
- **Match the tactic to the CHANNEL:** a polarizing thesis ranks on HN/Reddit; a useful tutorial ranks on
  Qiita/Zenn/Juejin; a single creator video or conference talk may outweigh either.
- **Show up in the comments and answer the hardest objection in public** — turn the thread into a winning technical defense.
- **Frame an incomplete v1 honestly as an "existence proof" / "proof-of-concept."**
- **Spend any pre-existing audience or creator channel as launch capital.** If you lack one, accept the spike is a
  lottery and plan to win on the slow-burn engine.
- **If targeting a non-Anglophone ecosystem, launch in that community's own channel first** — do not assume HN is the
  gateway (Vue won China first).
- **Accept that placement is partly stochastic** — instrument what actually converted; do not over-attribute the
  outcome to merit.

## Phase 5 — Grow community & distribution: cross the chasm

- **Pursue ONE high-leverage default/embedding:** the unavoidable default inside a higher-altitude framework, the
  silent engine inside a higher-traffic host, OR the hardcoded default in an agent's toolset. Make embedding trivial
  (stable CLI, static binary, permissive license).
- **For editor/GUI/extension tools:** optimize marketplace ranking (install count, ratings) and get into "recommended
  extensions" / workspace configs — that is your chasm-crossing path, not a framework default.
- **Seed the LLM-discovery channel:** accumulate blog/tutorial/Stack Overflow corpus presence and ship an MCP server
  or clean machine-facing API so the model and its agents know — and can invoke — you.
- **Engineer for flagship-repo adoption** — each marquee user's public config is greppable social proof.
- **Get listed in the canonical awesome-list / starter pack** for your category and ecosystem (including non-English ones).
- **If reviving an abandoned tool:** open polite maintained-fork issues on packaging repos; offer compatibility symlinks
  (the eza playbook — inherit the name, the binary name, the semver).
- **Lower contribution friction only once reviewer-throughput-bound**, and gatekeep against AI-generated low-effort PRs;
  aim to graduate a 2–3 person core to kill the bus factor.

## Phase 6 — Sustain & govern: survive your own success

- **Set bounded responsiveness expectations explicitly** — do not let adoption convert into an unfunded 24/7 obligation.
- **Choose your license as a deliberate spread-vs-capture lever up front** (permissive for reach, copyleft/source-available
  for capture) — and **NEVER relicense an already-adopted base** (OpenTofu/Valkey).
- **If VC-backed:** make the free-forever promise explicit and monetize an ADJACENT paid surface. **If unfunded:** pursue
  GitHub Sponsors/Tidelift/Open Collective as partial bus-factor relief while knowing it rarely funds a salary.
- **For infrastructure substrates with enterprise adopters:** move toward credibly-neutral governance AND supply-chain
  provenance (SBOM, sigstore signing) BEFORE a relicensing or supply-chain fear arises.
- **Use editions/epochs + an automated codemod** (`cargo fix`) to evolve breaking syntax without breaking existing users
  — never reset the chasm with a hard compat break at peak adoption (Python 3, Angular 2, Perl 6).
- **Harden against the bus-factor-1 attack surface (XZ):** vet new committers, distribute commit rights deliberately,
  watch for social-engineering of an exhausted maintainer.
- **Replicate a proven launch formula across adjacent pains under one brand family** once the first tool earns trust
  (Ruff→uv, lazygit→lazydocker).
