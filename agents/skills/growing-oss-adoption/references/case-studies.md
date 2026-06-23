# 14 case studies — what to steal

Parent: SKILL.md reference index. Concrete, copyable moves from 14 exemplars, grouped so you can read the ones
that match your regime. Each project's wedge is named; the bullets are tactics with a track record. Pair every
move with the boundary in `principles.md` — these are *what winners did*, sampled on winners (`epistemics.md`).

---

## CLI / drop-in cohort

### ripgrep (rg) — Andrew Gallant / BurntSushi
*Wedge:* collapsed grep's-speed-vs-ag's-ergonomics into one tool, proven by a brutally honest self-curated benchmark
from an author who already maintained Rust's regex engine — so "it's fast" arrived pre-credentialed.
- The enumerated-competitor title: name every incumbent in the headline so the artifact is self-positioning in any feed.
- Honesty-as-marketing: a "why you shouldn't use this" section + showing losing benchmark rows raises trust more than it costs.
- Pick a felt, two-sided tradeoff to collapse rather than a vague "better" — and *name* the tradeoff so users recognize their pain.
- Explain the *mechanism*, not just metrics, so the skeptical can self-verify and become advocates.
- A long-form benchmark post on known public corpora WITH a reproducible harness is a durable, re-shareable asset.
- Frictionless cross-platform static binaries + saturate package managers; treat the least-served OS (Windows) as a wedge.
- Author shows up in launch threads and answers the hardest objection in public.
- Factor reusable libs out and advertise them to recruit a contributor flywheel; design to be embeddable (→ VS Code).

### eza (formerly exa) — the fork that inherited a dead tool's base
*Wedge:* a maintained fork of an abandoned-but-loved tool; "maintained" is itself the pitch.
- Wedge math: value = (per-use delta) × (uses/day). `ls` maximizes the second term, so even a small delta wins. Choose targets by frequency.
- "Saner defaults" is a *positioning*, not a feature — the cheapest possible differentiator for a CLI clone.
- Continuity engineering for forks: inherit semver, inherit the name (or a near-anagram), inherit the binary name via symlink.
- The migration channel is the distro/package-manager graph, not your homepage. Win the packagers; users follow.
- A fork's launch credibility = (speed after abandonment) × (most-hated bug fixed) — both within the forker's control.
- Governance as marketing: "community-maintained" is a defensible claim against any single-maintainer incumbent.

### The modern-Unix cohort — fd, bat, zoxide, dust, procs (sharkdp et al.)
*Wedge:* a shared template — claim one universal command's slot, ship opinionated defaults + a correctness axis the incumbent skips.
- The one-line README slot-claim: "<name>, a <adjective> alternative to <command everyone runs>" — the highest-leverage sentence you write.
- Ship the always-typed flags as defaults; call them "opinionated defaults" and list exactly which incumbent flags they replace.
- An adversarially-fair, reproducible launch benchmark that shows your losses and discloses bias.
- Pick a correctness axis (Unicode/git/color/safety) the incumbent turns off for performance, and ship it on-by-default and free.
- Single static binary + PRs into every package manager early (Homebrew/AUR/nixpkgs/scoop/winget) — each channel is *discovery*.
- Embed an animated terminal demo (asciinema/VHS/svg-term) at the top of the README.
- Zero-cost migration: drop-in invocation, import the old tool's state/DB, hand users the exact alias line, `init` subcommand.
- Make output composable (pipe-friendly, clean `--color=always`); document fzf/pager/editor integrations so you pull neighbors in.
- A consistent multi-tool house style compounds reputation across launches; get into the canonical awesome-list.

### fzf — junegunn
*Wedge:* a STDIN→interactive→STDOUT primitive that hijacks a key the user already presses (CTRL-R).
- The primitive-not-app pattern: design for the pipe; endless composability.
- Keybinding hijack: replace the SAME action the user already does, so learning cost is zero.
- Single static binary + auto-selecting install script kills the #1 abandonment point.
- First code block in the README = shortest path to the "aha"; one-liners over prose.
- A generic "run command on current item" hook (`--preview`/`--bind`) outsources your integration roadmap to the community.
- First-party integrations for the top 3–6 environments close the install-to-delight gap yourself.
- Rewrite the hot path for latency when invocation frequency is high — startup time can be the whole product.

### fnm — Gal Schlezinger
*Wedge:* one reproducible benchmark number vs nvm, a config-file drop-in, and Windows support nvm lacked.
- The "one benchmark headline": compress your value to a single reproducible number against the named incumbent.
- Consume-the-incumbent's-config drop-in: read .nvmrc/their lockfile verbatim so switching cost is ~0.
- "Make the 50×/day verb disappear" UX (auto-on-cd) instead of just a faster version of the manual command.
- Substrate-matches-the-promise: don't build a "fast" tool on a slow runtime; kill the prototype that reintroduces the pain.
- Turn the incumbent's structural blind spot (Windows) into your lead feature.
- Launch on a fun/fast stack for author velocity, then migrate to the big-ecosystem language to unlock contributors — and *blog the rewrite* ("Why fnm was rewritten in Rust" became marketing).

### Starship — cross-shell prompt
*Wedge:* one structural limitation shared by ALL incumbent prompts (cross-shell), made the entire identity.
- The "one eval line" install: `eval "$(mytool init zsh)"` — universal, reversible, self-documenting (also zoxide/atuin/direnv/mise).
- `curl|sh` on your own short domain for the demo path PLUS first-class package-manager presence for the real path. Have both.
- README leads with a hero GIF + six one-word benefit bullets + a Repology packaging-status badge to advertise ubiquity.
- A `presets` gallery of named, screenshotted, one-command-apply configs — turns the tool into a screenshot funnel.
- Single declarative config file (TOML) checked into dotfiles → copy-paste virality.
- Crowdin docs i18n + "good first issue" + Discord to manufacture a contributor pipeline from your user base.

### lazygit — Jesse Duffield
*Wedge:* a self-documenting TUI wrapping git (zero migration), launched into a topic with strong opposing priors.
- Outcome-framed launch headline (sell the result, hide the product name).
- GIF-above-the-fold README that proves the core claim in seconds.
- Lead with one universal micro-pain, not your flagship feature.
- A line of quotable, villain-naming personality in the README to generate shareable comments.
- Launch into a topic with strong opposing priors so disagreement drives comment volume.
- Wrap the incumbent (zero migration cost, fully reversible trial); self-documenting UI (on-screen keys + cheatsheet).
- Single static binary + saturate Homebrew/AUR/Scoop/apt/Nix; advertise coverage with a Repology badge.
- Convert issue-filers into PR-authors; graduate a small core team; a tasteful in-app star prompt at the moment of delight.
- Replicate a working launch formula across adjacent pains under one brand family ("lazy*").

---

## JS / frontend toolchain & framework cohort

### Vite — Evan You
*Wedge:* assumed native ESM + esbuild had just crossed the viability line, making webpack/CRA suddenly look slow.
- The platform-shift wedge: build the tool that ASSUMES a capability that just became viable, so the old default looks needlessly slow.
- Hybrid not purist: the elegant new approach where it shines (dev), the boring proven one where it must (prod) — same tool, no asterisk.
- The "extract your framework into a plugin" relaunch: the move that converts competitors into adopters when your tool was born inside one ecosystem.
- Anchor extensibility to an existing plugin ecosystem (Rollup) to inherit plugins + mental models for free.
- Court the layer above you (framework authors) — transitive adoption + shared maintenance beats chasing end users.
- One-command `create-*` scaffolder doubling as onboarding and a "we support your stack" signal.
- Win migrations by fitting a competitor's specific hard problems better; credit prior art publicly to earn author endorsements.

### SolidJS — Ryan Carniato
*Wedge:* React's API surface 1:1, with all novelty spent on fine-grained reactivity underneath; the author taught the *problem* for months.
- Match the incumbent's API surface 1:1 so familiarity carries adoption; spend ALL novelty on the engine, none on syntax.
- Win a reproducible third-party benchmark *before* you publish the performance claim — evidence over assertion.
- Blog/stream to teach the PROBLEM (not pitch the product) for months before launch; the author's writing is the top-of-funnel and the credibility.
- Build a demo that visualizes the exact thing that makes you different ("see the compiled output") — trying it = understanding the thesis.
- Own and name the underlying idea/category so competitors adopting it market for you.
- Sequence community infra (Discord, hackathons, fellowships, meta-framework) AFTER organic traction, as amplifiers.

### The JS-speed wave — esbuild (Wallace), SWC (Kang), Bun (Sumner)
*Wedge:* an existence-proof that a 10–100× gap is real, then drop-in API mirroring + embedding inside a popular host.
- The existence-proof launch: ship an incomplete tool whose ONE job is to prove a 10–100× gap is real, and say so explicitly.
- Benchmark-as-headline: the first README screen is a reproducible number that recategorizes the space, with the command to reproduce it.
- Drop-in API mirroring: copy the incumbent's CLI flags and signatures verbatim so migration = find-and-replace.
- B2B2Dev distribution: embed as infrastructure inside a popular framework; win the maintainer, inherit the userbase.
- Trust-through-honesty: a mechanistic "why it's fast" doc plus an explicit "what this will never do" list.
- Hook/retention split: be honest about which feature *acquires* (speed) vs *retains* (consolidation/DX); invest in both.
- Find the NEW job a platform shift created (ESM transition, ubiquitous TS) where no incumbent is entrenched, and own it first.

---

## Formatter / CSS / language / Python-tooling cohort

### Tailwind CSS — Adam Wathan
*Wedge:* reframed the CSS axis with a substantive, defensible essay, and shipped a curated finite option set as the product.
- The reframe-the-axis pattern: don't win the incumbent's argument, change which question is being argued.
- Defaults are a product. A curated finite option set ("p-4/p-6/p-8", not arbitrary pixels) is differentiation, especially for non-experts.
- Controversy is free distribution IF substantive — a real technical disagreement that forces people to take a side. (Empty contrarianism fails.)
- Build-in-public works best when the tool is a *byproduct* the audience discovers, not a thing you announce — pull beats push.
- Make the docs/playground the growth engine and instrument it — but a docs-traffic-dependent revenue model is fragile to search, then LLMs.
- Co-opt your loudest critic's best fix (PurgeCSS) into core to convert your #1 objection into a headline feature.

### Prettier — opinionated zero-config formatter
*Wedge:* named a *social* pain ("stop arguing about style"), reprinted from the AST, and landed one high-status reference adopter.
- Tagline names the social pain ("stop arguing about X"), not the mechanism.
- In-browser instant playground as the hero CTA for any transform tool.
- Reprint-from-AST > patch-existing-text when you can afford a parser — the stronger guarantee is the marketing.
- Two-pronged integration: per-dev habit (on-save) + per-org ratchet (CI `--check` exit code).
- Compose-with-incumbent adapters (eslint-config-prettier) to zero out switching cost.
- Refuse the most-requested option if granting it would re-create the problem; say why publicly.
- Get one high-status reference adopter (React/Jest) before broad outreach; defaults cascade downhill.

### uv / Ruff — Astral, Charlie Marsh
*Wedge:* a viscerally-better speed magic moment + drop-in-first compatibility + a funded team's velocity (credit the confound).
- The viscerally-better magic-moment test: only ship the wedge if early users *disbelieve* the result. "Nice, a bit faster" is not spreadable.
- Drop-in-first, opinionated-later: win on a zero-cost compatibility layer, then layer your real vision under a reserved namespace.
- Name the incumbents you replace, in your one-liner ("Replaces pip, pip-tools, pipx, poetry, pyenv, twine, virtualenv").
- Publish one specific repeatable benchmark number people can re-run and brag about (80–115×), not "blazing fast."
- Launch humble: enumerate your own limitations in the launch post/HN comment to convert skeptics into allies.
- If VC-backed: make the free-forever promise explicit; monetize an adjacent paid surface — the core tool is the funnel.
- Single static binary that doesn't require the runtime it manages; install via the incumbent ecosystem's own channel.
- Treat marquee-repo adoption as a distribution channel — their public configs advertise you for free.

---

## Language + ecosystem

### Rust — the language and its community-marketing machine
*Wedge:* errors-as-onboarding, batteries-included tooling cloning a beloved package manager, and a content/RFC engine that re-tells its own growth.
- The "one mechanism, two named campaigns" play — re-market the same core feature to a second audience under a new slogan.
- Errors-as-onboarding: budget real engineering for compiler/CLI diagnostics (span + what/why + suggested fix) before docs.
- Day-one batteries-included tooling that clones the DX of whatever package manager your audience already loves (Cargo ⟵ Bundler/npm).
- Public numbered RFCs + a broadcast Final Comment Period + a weekly digest ("This Week in Rust") as a trust-and-content engine.
- Editions/epochs + an automated codemod (`cargo fix`) to evolve syntax without breaking existing users — kills the "too risky" objection.
- Engineer a recurring quantified external win (a survey/ranking) so the press re-tells your growth story annually for free.
- Court named lighthouse adopters and publish their measurable before/after — flamegraphs over testimonials.
- An early, enforced Code of Conduct as a deliberate adoption wedge against an abrasive incumbent culture.
