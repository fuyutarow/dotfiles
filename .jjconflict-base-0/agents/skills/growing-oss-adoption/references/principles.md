# The principle taxonomy — 8 clusters, every mechanism with its boundary

Parent: SKILL.md §0–§3. This is the survey body: each principle as `statement / mechanism / evidence / boundary`.
**Almost every principle is `conditional`, not `robust`** — that is the finding, not a hedge. Each boundary is
what the adversarial stress-test (survivorship + boundary-condition lenses) actually produced; 5 candidates were
judged myths and downgraded into the boundaries below. Read a boundary as "the regime/era where this is true."

---

## Cluster 1 — What recruits the first wave (acquisition)

**DX is the early-adopter's relative advantage — in one regime** · *conditional*
In a substitute/commodity category where capability is at parity AND adoption is individually-funded bottom-up,
developer experience (install ease, time-to-first-success, legible errors, speed) is the dominant axis recruiting
the first wave. *Mechanism:* early adopters feel daily-loop pain and respond to its reduction in a ~5-min solo trial;
abstract capability needs an evaluation no one funds. *Evidence:* ripgrep, fnm, Vite, uv/Ruff, esbuild, lazygit;
**but** Kubernetes, Git, TensorFlow 1.x won *despite* hostile DX. *Boundary:* the §1 solo-trial tell. Fails for
novel-capability-without-substitute, org/top-down funding, brand/network recruiting, and the library/research/protocol
regimes.

**Funded engineering velocity is itself a distribution input** · *conditional*
Paid full-time engineering + DevRel let a team out-iterate volunteers on DX, compatibility, and release cadence —
so "great DX won" is partly *bought velocity*. *Evidence:* Astral (Charlie Marsh raised VC, hired a team — uv/Ruff's
cadence is partly funded, not solo-itch); Vercel-backed tooling; Deno/Bun company-backed; sharkdp's fd/bat is the
genuinely-unfunded contrast case. *Boundary:* a **confound to credit honestly, not a strategy to deploy.** Funding
*amplifies* a real wedge; it cannot manufacture demand (well-funded failures abound).

**Compressed magic moment as a conversion amplifier** · *conditional*
Front-loading a guaranteed fast (~sub-5-min) visible "it works" amplifies conversion of *already-arriving* traffic.
*Mechanism:* cost is paid up front while payoff is uncertain; a guaranteed win inverts the risk calculus and yields a
shareable artifact. *Evidence:* Docker's PyCon demo, Stripe's seven lines, create-react-app's one command; **but** Git,
Kubernetes, curl spread with no quick win, and create-react-app/Meteor nailed the moment and *died*. *Boundary:* it
**converts demand, it does not create it** — it rides a channel that supplies the traffic. For a library the moment is
a copy-pasteable snippet; for research, a reproducible notebook.

**Speed-as-wedge for drop-in, output-trust-free, high-frequency tools** · *conditional*
A verifiable, local, per-invocation speed multiplier over a *named* incumbent is the lowest-friction *initial* wedge
for drop-in CLIs/build tools. *Mechanism:* benefit is self-evident, reproducible on the user's own machine, and accrues
to the chooser — collapsing the trust/sales cycle. *Evidence:* uv/Ruff, fnm, esbuild, ripgrep; **but** mold (a
multiple-× faster linker) and ugrep stayed niche. *Boundary:* requires near-zero switching cost AND no
correctness/output-trust gate. Dies on a correctness-critical path (linker, prod runtime, codegen) or with real
switching cost. In survivors, speed is almost always co-bundled with consolidation (uv) or correctness (ripgrep's
gitignore relevance).

**The 10×-not-10% behavioral threshold (ceiling form)** · *conditional*
Sub-perceptible speed deltas (inside the ~400ms flow boundary, below ~3×) do **not** drive adoption; past the
perceptibility floor, ergonomics/defaults and distribution decide, not further speed. *Mechanism:* at order-of-magnitude
the tool becomes "free" and folds into a tight inner loop (run on every save), unlocking new usage patterns. *Evidence:*
Alacritty (speed winner) lost to Kitty/WezTerm on features; esbuild was fastest yet lost the bundler race to slower Vite.
*Boundary:* **robust as a *negative*/ceiling claim**; the positive "crossing 10× converts to adoption" is overstated —
where 10× coincided with winning (ripgrep) it was bundled with ergonomics *and* a channel (VS Code).

**Scratch your own acute, high-frequency itch** · *conditional*
Author-as-user reliably tunes a tool to a real high-frequency workflow and earns the first peers' credibility — but this
explains *initial product-fit and early trust*, **not spread**. *Evidence:* Bun's reload-time itch, Ruff/uv's slow-tooling
itch, Homebrew's compile waits, lazygit, fnm; **but** entr/HTTPie/fx had the itch and no spread, and SQLite/Kubernetes
spread with the author *not* a high-frequency user. *Boundary:* holds for single-author CLI/TUI in a horizontal
high-frequency niche *with* a reachable channel and drop-in migration. **Frequency predicts author FOCUS, not spread.**

---

## Cluster 2 — Regime-specific acquisition (libraries, research, protocols)

Full treatment in `regimes.md`. In brief, four principles the CLI-sampled corpus under-weights:

- **Libraries spread by tutorial, Stack Overflow answer, and copy-pasteable API surface** — the product *is* the API;
  the magic moment is a snippet, not a binary (`requests`, FastAPI/pydantic, axios, day.js, serde/tokio).
- **Transitive-dependency capture** — a library spreads by being *depended upon* by a popular host, with zero direct
  user decision (core-js, lodash, tokio, certifi). Strong for download metrics, near-useless for mindshare/revenue.
- **Research software spreads by paper-companion code, leaderboard, and lab/course inheritance** — adoption is a
  PI/reviewer decision (PyTorch, HF `transformers` + hub, scikit-learn). Network effects live at the model/dataset hub.
- **Protocol/standard-track spread: recruit implementers, not users** — moat is N-implementers × M-consumers (LSP, OCI,
  OpenTelemetry, OpenAPI; MCP is the live instance). A spec with one implementer is a library with extra steps.

---

## Cluster 3 — What crosses the chasm (distribution & network)

> Pragmatists *inherit* tools rather than choosing them. **Distribution beats love.**

**Become the unavoidable default at the highest controlling altitude** · *conditional*
The pragmatic majority inherits a tool when a higher-altitude project makes it the *unavoidable* default, dragging that
host's base across at zero per-developer decision. *Evidence:* SWC via Next.js, esbuild via Vite, Vite via
SvelteKit/Astro/Nuxt + CRA deprecation, ripgrep via VS Code; **but** Yarn-in-CRA and Flow-in-CRA *lost* to higher-altitude
npm-in-Node and TypeScript. *Boundary:* requires the *unavoidable* default path (not merely "recommended"), real opt-out
friction, and no higher-altitude default bundling a rival. Captures only the *host's* base. Often a *lagging* validator
of a tool that already went viral on merit (ripgrep was viral before VS Code).

**Become a silent embedded engine inside a higher-traffic tool** · *conditional*
Being the silent default backend of a more widely-distributed host converts its install base into your *invocation* count
— but this is downstream of winning a benchmark and is **not** "spread" (mindshare/community/revenue). *Evidence:* ripgrep
in VS Code/Cursor/Claude Code, esbuild in Vite, Bun in Claude Code; **but** Lua/zlib/core-js are maximally embedded yet
obscure/unfunded, and esbuild→Rolldown, Babel→SWC show the host *evicts* you when vertical integration pays. *Boundary:*
embedding is **earned** by being best-in-class on a host-relevant axis — a lagging indicator, not a growth strategy.
Durable only when replacement cost is extreme (SQLite/zlib class).

**Marketplace placement and in-tool recommendation** · *conditional*
For editor plugins, browser extensions, and GUI OSS, the dominant path is marketplace discovery ranked by install count +
reviews, plus in-tool recommendation. *Boundary:* CLI surfaces only partly transfer (the listing *is* the landing page);
ranking is gameable and incumbency-biased — an early lead compounds independent of merit. See `regimes.md` §5.

**Creator/influencer and conference-talk channels import borrowed trust** · *conditional*
A single creator endorsement (YouTube/Twitch) or a conference talk can outweigh an aggregator front page, importing the
creator's parasocial trust. *Evidence:* Fireship-style coverage, Evan You's Vue/Vite circuit, RustConf, htmx's creator-driven
spread; **but** single-point-of-failure risk, and heavily confounded with author-as-creator pre-existing audience
(Tailwind/Wathan). *Boundary:* non-reproducible, increasingly pay-for-reach-adjacent; near-irrelevant for infra libraries
and rigor-first audiences.

**Discovery channels are parameterized on the local aggregator, not universally on HN** · *conditional*
The "comment-ranked aggregator" mechanism generalizes in *shape*, but the channel, ranking dynamics, and what counts as
"controversy" are language- and region-specific. *Evidence:* Qiita/Zenn (Japan, tutorial-ranked, not link-flamewar),
Juejin/掘金 + SegmentFault + V2EX (China), velog/Naver (Korea), dev.to; Vue achieved massive China-first adoption through
non-English channels; fzf's junegunn and SWC's DongYoon Kang (Korean) spread through English channels — so *the channel an
author can reach*, not nationality, is load-bearing. *Boundary:* the corpus is overwhelmingly English HN/Reddit and likely
mis-estimates ranking elsewhere; Qiita/Zenn reward useful tutorials over polarizing theses, *inverting* the "controversy
ranks" tactic. "It didn't hit HN" is **not** evidence of failure.

**Network effects amplify a lead and entrench at the protocol/registry layer** · *conditional*
For OSS whose value is interpersonal/shared (forges, registries, marketplaces, languages, protocols, model hubs), network
effects entrench an incumbent against *incrementally* better rivals. *Evidence:* npm registry (yarn/pnpm win the CLI but
reuse the registry), Hugging Face hub (shared weights as the network); **but** Atom (owned by GitHub) lost to VS Code on
merit, IE→Chrome, AngularJS→React. *Boundary:* lock-in lives at the *shared* layer, not the tool. Overrides only *small*
merit gaps, never a discontinuous step-change with an independent channel (Chrome), and is forfeited by a botched migration.
The defensible claim is **network-as-amplifier-of-merit**, not network-as-substitute.

**Free-to-start individual adoption precedes standardization — when a paid surface exists** · *conditional*
For tools an individual can run usefully solo at near-zero vendor marginal cost, free permissionless adoption is the
diffusion unit; org standardization and revenue follow as land-and-expand. *Evidence:* HashiCorp (Vagrant→Terraform),
Supabase, ngrok, Astral; **but** RethinkDB followed it perfectly and died unmonetized; Snowflake/Oracle standardize
top-down first. *Boundary:* monetization is **not** guaranteed to follow the same unit (Spark→Databricks). Fails for
per-tenant-cost platforms, frameworks/languages, and org-mandated tooling. Interacts with the license lever (Cluster 7).

**Being in the model's prior or default toolset is the new unavoidable-default altitude** · *conditional*
As discovery shifts to LLM recommendation and agent tool-calling, being in the training corpus and being an agent's
hardcoded default becomes a controlling altitude — which **rewards well-blogged incumbents and penalizes brand-new tools**.
*Evidence:* ripgrep and Bun as Claude Code defaults; the broad blog/SO corpus advantaging established libraries in LLM
suggestions; MCP servers as a wholly new distributable artifact type; Tailwind's reported drop in *human* docs traffic as
agents read docs. *Boundary:* **inverts "newest-fastest wins" toward "the tool the model already knows wins"** for
LLM-mediated discovery, while leaving human channels intact for now. Highly time-sensitive and under-measured — see
`epistemics.md`.

---

## Cluster 4 — How to make it easy to switch (migration ergonomics)

> Switching cost — not learning a new idea — is the binding constraint when an incumbent already exists.

**Drop-in compatibility gets the migration that speed only motivates** · *conditional*
For commodity utility-layer tools competing laterally, near-zero-cost compatibility (same CLI, config files, output)
*converts* speed-driven desire into actual migration, because the legacy interface is both the sunk cost and the product
spec. *Evidence:* uv reads requirements.txt/mirrors pip, Ruff emits flake8 codes, fnm reads .nvmrc; Deno *stalled* until
npm compat then accelerated (a natural experiment). *Boundary:* does **not** generalize to frameworks/runtimes/languages
that sell a new model (Vite won *while* charging a migration tax); dominated by default-absorption where they compete
(Vite beat the drop-in Rspack on distribution). Neither necessary nor sufficient.

**Reuse the incumbent's config artifacts and plugin ecosystem** · *conditional*
Reading the standardized manifest 1:1 lowers switching cost to near-zero and is table-stakes for incremental migration.
*Evidence:* Vite adopted Rollup's plugin API, fnm reads .nvmrc, zoxide imports z/autojump DBs, Bun reuses node_modules;
pnpm (drop-in) beat Yarn-PnP (broke node_modules, stalled). *Boundary:* reuse the **spec, not the materialized state** —
winners reinvent the on-disk layout (pnpm) and the plugin ecosystem (Biome). Anti-domain: when the incumbent's plugins
*are* the slow legacy you're escaping, reimplement.

**Match the incumbent's surface; spend novelty underneath** · *conditional*
For a drop-in *substitute*, copying the incumbent's API/syntax removes the relearning tax and is table-stakes for entry.
*Evidence:* SolidJS kept JSX/Hooks-shaped primitives over fine-grained reactivity, esbuild/SWC mirrored Babel's API, Bun's
high Node compat; **but** Preact/Inferno/Zepto matched syntax and stayed niche, and React/Svelte/Rust won with *unfamiliar*
syntax. *Boundary:* spreads only if the under-the-hood payload is a measurable order-of-magnitude win. Syntax-matching is
**entry permission, not a growth engine**, and is a liability for category-creating tools and new languages.

---

## Cluster 5 — How to position & earn trust (for an adversarial audience)

> The audience re-runs your claims. Honesty and verifiability are the currency.

**Anchor to the incumbent: "X but N× better" / "open-source alternative to Z"** · *conditional*
A verifiable one-line delta lets a developer self-qualify in one sentence and import the incumbent's mental model.
*Evidence:* ripgrep's enumerated-incumbents title, eza "modern ls", Supabase "open-source Firebase"; **but** RethinkDB
anchored to MongoDB and the anchor *capped/hurt* it, and awesome-alternatives lists are full of identically-framed
also-rans. *Boundary:* a cheap entry ticket that buys a click, not survival. The anchor is a **promissory note graded
on the incumbent's strongest axis** — only works if you dominate it. Do NOT anchor a new category, language, or framework
(Rust dropped "systems programming" to escape the follower frame).

**Category reframing changes the axis (only on top of a real advantage)** · *conditional (myth'd by survivorship lens, downgraded)*
For paradigm tools whose evaluation axis is genuinely ambiguous AND that ship a working artifact on the new frame, a fresh
mental model collapses evaluation time. *Evidence:* Tailwind's dependency-direction essay, Docker's shipping-container
metaphor; **but** Datomic and Linked Data shipped flawless reframes and stayed niche, and ripgrep/PostgreSQL won the
head-to-head with *no* reframe. *Boundary:* a communication aid that pays off **only on top of a comparison-surviving
advantage**. For direct substitutes that would *win* a head-to-head, the stronger move is the opposite — run the benchmark.
Never substitutes for substance.

**Lead with a reproducible, named-competitor benchmark — for speed-defined incumbents** · *conditional*
A benchmark converts a claim into a falsifiable experiment for an audience that trusts an experiment it can re-run.
*Evidence:* ripgrep's enumerated-competitor benchmark, uv's warm-vs-cold-cache disclosure, esbuild's chart; **but** Bun's
synthetic "fastest" benchmark was *exposed* yet it grew anyway on DX. *Boundary:* credibility comes from the
**reproducibility+honesty package, not the number**; a rigged benchmark is a reputational liability a skeptical audience
now actively distrusts (Turbopack's numbers were publicly dismantled). Earns launch-day *credibility*, not installs. In
the LLM era, disclose if any content is AI-generated.

**Honesty as a credibility weapon (defensive hygiene)** · *conditional*
Disclosing limitations and benchmark bias *alongside* a demonstrated win neutralizes a critic's strongest move and converts
scrutiny into durable trust. *Evidence:* ripgrep's "curated and biased" + anti-pitch, SQLite's "Appropriate Uses", Ruff's
"proof-of-concept" framing; Turbopack's dishonest benchmark publicly dismantled. *Boundary:* a trust-**retention** multiplier
on *real substance* among an *expert* buyer — not a growth lever. Conceding limits around a *mediocre* tool just documents
why not to adopt it. *(Reflexive corollary: this survey must hold its own numbers to the same standard — `epistemics.md`.)*

**Explain the mechanism so skeptics can self-verify** · *conditional*
Naming the concrete techniques (ripgrep's finite-automata/SIMD/Teddy; esbuild's Go+parallelism+multi-pass-AST) wins the
launch-thread argument. *Boundary:* a credibility/defense move, **not an adoption engine** — ag/sift/Hyperscan explained
mechanism and stayed niche; httpie/exa/fd spread on ergonomics with no deep-dive. Applies only to a benchmarkable claim a
skeptic will attack, in an adversarial forum, by a credible author.

**Controversy and identity as cheap amplification — channel-dependent** · *conditional*
A *substantive* polarizing thesis or a shareable identity object can amplify an already-good tool. *Evidence:* Tailwind's
separation-of-concerns fight, lazygit's git-UI flamewar, htmx memes, Rust's Ferris, Starship screenshots; **but**
ripgrep/SQLite/curl spread with none of it, and Gleam/Crystal had mascots+love and stayed niche. *Boundary:* a top-of-funnel
amplifier *parasitic on comment-ranked channels*; **channel-dependent** — tutorial-ranked surfaces (Qiita/Zenn) reward
usefulness, so the polarizing-thesis tactic can *backfire* off HN/Reddit. Confounded by pre-existing audience and corporate
backing. Empty contrarianism doesn't work; the disagreement must be real and defensible.

---

## Cluster 6 — How it's packaged & onboarded (the product surface)

**Opinionated defaults for shared-output commodity tools** · *conditional*
Excellent zero-config defaults are the dominant early-adoption driver for shared-output leaf tools; for *formatters
specifically*, deliberately **withholding** options is a separate social-coordination win (uniform output *is* the value).
*Evidence:* Prettier, gofmt, Black, ripgrep/fd's pre-enabled smart filtering; **but** JSLint→JSHint→ESLint *inverted* it for
linters, webpack out-adopted zero-config Parcel, CRA's withhold-options design got deprecated. *Boundary:* **defaults do the
causal work; withholding options pays off only where uniformity is the entire value**. For libraries/frameworks/build-tools/
editors/languages, configurability *is* the driver — ship good-defaults-PLUS-escape-hatch (Vite, Tailwind config, Neovim distros).

**Single static binary multiplies embedding, self-distribution, and audit-trust** · *conditional*
For a CLI/embeddable tool whose audience lacks a shared runtime, one dependency-free binary removes install/vendoring friction
AND minimizes supply-chain audit surface (an *enterprise security argument*, distinct from convenience). *Evidence:* the
Go/Rust/Zig CLI cohort, Bun-in-Claude-Code, ripgrep-in-VS-Code via @vscode/ripgrep; **but** npm-native ESLint/Prettier are
ubiquitous with *no* binary, most static binaries die obscure, and Debian/Fedora *penalize* vendored static binaries.
*Boundary:* a friction+audit-surface reducer, not a demand-creator. Buys little when the audience shares a ubiquitous runtime
(npm/pip/JVM). The "multiplies distro packaging" claim is **overstated** — helps `curl|sh`/Homebrew, can *hurt* apt/dnf.

**The README is a landing page — for visual tools, on arrived traffic, and decreasingly for humans** · *conditional*
For interactive/visual CLI/TUI tools, once a channel is sending traffic, a README whose first screenful answers
what/why/show-me (in the medium that *proves* the value) improves conversion of arriving *human* visitors. *Evidence:*
lazygit's GIF-first README, HTTPie's in-action GIF, Tailwind's docs-as-product; **but** curl/SQLite/ripgrep won with
prose-only READMEs, lazygit's author credits an HN flamewar (not the GIF) for breakout, and Tailwind's *human* docs traffic
*dropped* as agents read docs. *Boundary:* a conversion aid on *arrived human* traffic, **not a discovery engine**. "Animated
GIF" is over-specified (ripgrep won with tables, requests with a snippet; large GIFs are an a11y/perf liability). Forward
corollary: **machine-legible docs/types/structured metadata are becoming the agent-facing landing page.**

**Error messages and self-documenting UX as a retention surface** · *conditional*
Where the user is a newcomer with real substitutes and low switching cost AND the product surface *is* the interaction loop
(compilers/linters for learners; discoverability-first TUIs), machine-actionable diagnostics (precise spans + suggested
fixes) and visible affordances reduce first-session abandonment. *Evidence:* Elm's "Compiler Errors for Humans" → Rust's
diagnostics, lazygit's on-screen keybindings; **but** C++ and Git dominate with catastrophic errors, and Elm's best-in-class
errors didn't prevent its plateau. *Boundary:* a within-category *retention* amplifier, not a cross-category spread cause.
The transferable mechanism is **structured tool-actionable feedback (spans + autofix), not anthropomorphic tone**.

---

## Cluster 7 — Why now & how to sustain (timing, governance, failure)

**Enter through a narrow wedge that expands to a category default** · *conditional*
For an unsponsored single-maker tool, a deliberately narrow beachhead along one sharp value axis with a low-risk swap-in
minimizes the adoption decision and produces dense word-of-mouth. *Evidence:* Vite (Vue-only → framework-agnostic), Astral
(Ruff → uv), esbuild's deliberate "sweet spot". *Boundary:* **DROP the "over-expanding pre-PMF dilutes" universal** — Bun
launched maximally broad and the breadth *was* the viral hook; Kubernetes/Terraform/Deno launched broad and won. Reframe to
"single sharp value axis + low-risk swap-in." Inverts when the maker owns distribution/funded velocity, or when all-in-one
consolidation *is* the wedge.

**Prerequisite-unlock: a platform shift opens (but does not pick) the window** · *conditional*
For OSS strictly impossible without a platform prerequisite, that prerequisite is a *necessary* gate — but it does **not**
select the winner. *Evidence:* Vite needed native browser ESM, the Rust CLI cohort needed mature Rust/SIMD, llama.cpp needed
Apple Silicon + 4-bit quantization, the current wave needs capable LLMs; **but** Snowpack arrived *first* after the ESM
unlock and faded, Vite arrived later and won. *Boundary:* once the unlock is commodity it stops differentiating; the winner
is then chosen by distribution/ecosystem/execution. Some "unlocks" are author-built (llama.cpp's quantization = good
engineering). Meta: the *entire survey* is conditioned on the GitHub + package-manager + aggregator unlock.

**Incumbent feature-accretion manufactures the next challenger's wedge** · *conditional*
The felt-pain threshold a challenger exploits is usually reached by the incumbent's *own* growth — yesterday's lean winner
accretes config, plugins, and slowness until it's the heavyweight the next zero-config/fast entrant displaces. *Evidence:*
webpack's config sprawl → Vite/Parcel; ESLint+Prettier+Babel+TSC fragmentation → Biome/Ruff/oxc; nvm's slowness → fnm;
Babel's plugin weight → SWC/esbuild; CRA's stagnation → Vite. *Boundary:* the wedge is **generated by the incumbent**, so
the challenger's "why now" is often "the incumbent finally got bad enough." Caveat — this is the **rewrite-in-Rust
treadmill**: a pure-speed wedge has a short half-life; durable wins pair it with consolidation, correctness, or a
network/registry position the next rewrite cannot copy.

**Adoption manufactures an unfunded maintainer obligation (bus-factor-1 risk)** · *conditional (myth'd by survivorship lens, downgraded)*
For a bus-factor-1, unfunded, dependency-position project, adoption creates an asymmetric obligation (users gain a free asset
+ support expectation; the maintainer gains liability) that can break the maintainer or become an attack surface. *Evidence:*
core-js (broke the maintainer), XZ (burnout exploited as a backdoor vector), faker/colors, left-pad; **but** SQLite/curl/OpenSSL
ran bus-factor near 1 for years and criticality *magnetized* funding/governance rather than collapsing it. *Boundary:* **DROP
the "capacity collapse is the modal cause of OSS failure" over-reach** — most projects die of indifference/obsolescence at the
long tail. Strongest only at bus-factor-1 + zero funding + hard-dependency position. Sponsorship platforms (GitHub Sponsors,
Tidelift, Open Collective, thanks.dev) *soften* but rarely *solve* this — they fund a thin minority.

**License design trades spread for capture (the COSS lever)** · *conditional*
The license is a spread-vs-defensibility dial: permissive maximizes adoption/embedding; copyleft/source-available maximizes
capture but taxes adoption and invites forks if applied *retroactively*. *Evidence:* Apache/MIT maximized spread (ripgrep,
Vite, K8s); AGPL as a capture lever (Grafana, MongoDB pre-SSPL); BSL/SSPL *retroactive* relicenses triggered well-funded
forks (Terraform→OpenTofu, Redis→Valkey, Elastic). *Boundary:* choose permissive for reach (revenue from an adjacent surface);
copyleft/source-available *up front* against a real hyperscaler-resale threat. **The fatal move is relicensing AFTER
adoption** — it forfeits the trust that drove adoption, and a credible fork sponsor captures the base.

**Legible neutral governance as adoption insurance for infra substrates** · *conditional (myth'd by survivorship lens, downgraded)*
For high-switching-cost infra substrates evaluated by risk-averse enterprises in the post-2018 relicensing era, credibly-neutral
governance + supply-chain provenance functions as adoption *insurance* that raises retention. *Evidence:* Terraform→OpenTofu and
Redis→Valkey relocations, RFC processes, CNCF-retrofitted Kubernetes, SBOM/sigstore in procurement; **but** SQLite/Next.js/MongoDB
dominate under *non-neutral* governance. *Boundary:* a **defensive insurance/hygiene factor, NOT a primary driver of spread and
NOT the strongest moat** (the real moats are ecosystem gravity, switching cost, distribution, DX). "Trust is not forkable" is
undercut — trust *did* re-point to OpenTofu/Valkey, so a well-funded fork sponsor must actually exist for the insurance to pay out.

**Convert users to contributors — a sustainability mechanism, not a spread cause** · *conditional*
For community-governed projects that are *already* reviewer-throughput-bound, a contributor pipeline (groomed
good-first-issues, fast kind triage, per-module architecture, OWNERS/RFC delegation) turns a user base into a self-reproducing
maintainer base. *Evidence:* lazygit converted issue-filers into PRs, sharkdp's fd/bat/hyperfine family, Starship's
good-first-issue/i18n, Kubernetes' OWNERS; **but** SQLite refuses outside PRs and is among the most-deployed databases.
*Boundary:* a *sustainability* mechanism for an *already-adopted* project with a real review bottleneck — silent on (sometimes
negatively correlated with) initial adoption. **AI-generated low-effort PRs are now inverting the open-funnel cost asymmetry**,
pushing serious projects toward gatekept contribution.

---

## Cluster 8 — The epistemic frame (how to read all of the above)

Two `robust` principles — the only two that survived without a regime caveat. Full treatment in `epistemics.md`.

- **Most spread stories are survivorship-biased; the spike is largely non-reproducible** · *robust*. Separate the LAUNCH
  SPIKE (author audience / aggregator lottery / timing / funded DevRel — non-reproducible) from DURABLE ADOPTION (reproducible
  mechanism — order-of-magnitude speed, drop-in compat, copyable integration). Invest in the mechanism; treat the spike as a
  lottery ticket.
- **The whole mechanism set is conditioned on the post-2008 platform regime** · *robust*. GitHub + universal package manager +
  comment-aggregator + (increasingly) LLM-discovery. Test any mechanism for era-invariance before generalizing.
