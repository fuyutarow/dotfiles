# Decision rules & anti-patterns

Parent: SKILL.md §3, §5. The judgment layer — the forks to resolve deliberately, and the failure modes that
sink *technically good* projects. SKILL.md carries the abbreviated tables; this file is the full set.

---

## The 14 decision rules

1. **Regime classification FIRST.** CLI/drop-in → solo DX + binary + benchmark playbook applies. LIBRARY/SDK →
   optimize snippet/API + Stack Overflow/tutorial coverage + transitive-dependency capture; no binary trial.
   RESEARCH → reproducible notebook + paper/leaderboard + lab/course inheritance; adoption is not solo. PROTOCOL →
   recruit independent implementers + a seeding sponsor; diffusion unit is implementers. GUI/EXTENSION → marketplace
   ranking + in-tool recommendation. **Do not transplant one regime's tactics onto another.**

2. **Drop-in replacement vs new category.** Be a DROP-IN when a usable incumbent exists, value is solo-adjudicable,
   and your edge is a measurable delta — match the surface, read the config, publish a head-to-head benchmark. CREATE
   A CATEGORY only when you would *lose* a direct feature/maturity comparison and can ship a working artifact on a
   genuinely different axis (SQLite/fopen, Docker/shipping) — then reframe and do NOT anchor.

3. **Speed as the wedge vs not.** Lead with speed ONLY if (a) it crosses ~10×/sub-400ms on the user's *real* workload,
   (b) switching cost is near-zero, (c) there is no output-correctness gate, AND (d) you pair it with something durable
   (consolidation, correctness, a registry/network position) — the bare speed wedge is short-lived. On a
   correctness-critical path or against an already-fast-enough incumbent, lead with consolidation/correctness/ergonomics.

4. **Launch artifact.** BENCHMARK when the incumbent's defect is one end-user-visible performance axis (ship the harness,
   disclose bias). LIVE DEMO/GIF when value is visual/experiential (lazygit, HTTPie). PARADIGM ESSAY when creating a
   category or selling a model (React, Tailwind). REPRODUCIBLE NOTEBOOK + PAPER for a research audience. IMPLEMENTER
   OUTREACH for a protocol.

5. **Anchor vs own a noun.** ANCHOR ("X but N× better", "open-source alternative to Z") for CLIs/self-hostable apps in
   an incumbent-dense category with one universal reference AND where you dominate the delta axis. OWN A NEW NOUN for
   languages, frameworks, greenfield categories, and protocols — an anchor caps your ceiling and brands you a follower.

6. **Defaults.** WITHHOLD options only for shared-output commodity tools where uniformity *is* the value (formatters)
   and a community authority can enforce it. For libraries/frameworks/build-tools/editors/languages, ship
   good-defaults-PLUS-escape-hatch.

7. **Distribution path.** FRAMEWORK DEFAULT/EMBEDDING when you have a natural higher-altitude host (esbuild→Vite,
   ripgrep→VS Code). MARKETPLACE RANKING for editor/GUI/extension OSS. The LLM PRIOR / AGENT DEFAULT (corpus presence,
   MCP server, hardcoded backend) as the emerging top altitude. VIRAL DEMO + DOTFILES + PACKAGE MANAGERS for a
   standalone CLI with no host (jq, fd, bat, zoxide). TUTORIAL/STACK-OVERFLOW/TRANSITIVE-DEPENDENCY for a library.

8. **Discovery channel by ecosystem.** Launch in the target community's own ranked surface, not reflexively on HN —
   Qiita/Zenn (Japan, tutorial-ranked), Juejin/V2EX/SegmentFault (China), velog (Korea), dev.to (cross-regional).
   Calibrate the controversy-vs-usefulness tactic to that channel's ranking dynamics; reach English channels later for
   global crossing.

9. **Single static binary.** Prioritize when the audience lacks a shared runtime and you want embeddability,
   `curl|sh`/Homebrew reach, AND an enterprise audit-surface argument. Deprioritize the "multiplies distro packaging"
   claim for apt/dnf (vendored static binaries penalized) or when a ubiquitous runtime already carries you.

10. **License design.** PERMISSIVE to maximize spread/embedding (revenue from an adjacent surface). COPYLEFT/SOURCE-AVAILABLE
    *up front* to deter hyperscaler resale (at adoption-review cost). **Never relicense an adopted base** — it forfeits trust
    to a fork.

11. **Governance + provenance investment.** Move to credibly-neutral governance AND supply-chain provenance (SBOM/sigstore)
    EARLY *only* for high-switching-cost infra substrates with risk-averse enterprise adopters and a plausible fork sponsor.
    For end-user CLIs, libraries, and single-author tools, BDFL/single-vendor is fine.

12. **Monetization timing.** Ensure free permissionless individual adoption FIRST, then monetize an ADJACENT org-level
    surface — but only assume revenue follows when the tool runs usefully solo at near-zero vendor marginal cost. For
    per-tenant-cost platforms, frameworks, and languages, expect a separate top-down artifact or no direct revenue.

13. **Sustainability funding.** Pursue VC for funded velocity if the monetization surface exists; otherwise treat GitHub
    Sponsors/Tidelift/Open Collective as partial bus-factor relief that softens but rarely solves the solo-maintainer
    attack surface — plan succession regardless.

14. **Reading any spread claim.** Separate the LAUNCH SPIKE (audience / aggregator lottery / timing / funded DevRel —
    non-reproducible) from DURABLE ADOPTION (reproducible mechanism). Discount by the platform era assumed and by whether
    the channel was Anglophone. Invest in the reproducible mechanism; treat the spike as a lottery ticket.

---

## The 20 anti-patterns — how good tools die

1. **Applying the CLI playbook to a library, research tool, or protocol** — there is no 5-minute binary trial for
   `requests`, scikit-learn, or LSP; the single-binary and magic-moment creed actively misleads three of the four regimes.
2. **Confusing a magic moment with a traffic source** — a flawless demo converts *arriving* developers but cannot create
   demand; create-react-app and Meteor nailed the moment and still died.
3. **Leading with raw speed on a correctness-critical output path** (linker, prod runtime, codegen) or where switching
   cost is real — mold and Bun-in-production lost despite the multiplier.
4. **Treating a pure-speed wedge as durable** — short half-life on the rewrite treadmill; without
   consolidation/correctness/network position you are the next incumbent displaced.
5. **Differentiating on a speed delta below human perceptibility** — between two already-instant tools (Alacritty vs
   Kitty/WezTerm) further speed sells nothing.
6. **Shipping a synthetic or rigged benchmark to a forum that will re-run it** — Turbopack's cherry-picked numbers were
   publicly dismantled; AI-generated benchmark content now compounds this distrust.
7. **Holding tool authors to reproducible benchmarks while citing your OWN headline statistics without provenance** —
   re-run or downgrade your own numbers (this survey included).
8. **Breaking the incumbent's config/state to assert a new model** — Deno's no-npm stance stalled adoption until it
   reversed; Yarn-PnP's broken node_modules capped uptake.
9. **Breaking compatibility at peak adoption** — Python 2→3, AngularJS→Angular, Perl 6/Raku reset the chasm and bled the
   base; a hard compat break is a self-inflicted adoption reset.
10. **Asking developers to relearn syntax for a tool meant to be a drop-in** — and conversely, copying syntax while
    delivering only a marginal payload (Preact/Inferno/Zepto matched the API and stayed niche).
11. **Withholding configuration for tools whose value is fitting heterogeneous workflows** — optionless designs lose
    (JSLint→JSHint→ESLint; CRA deprecated), though withholding works for formatters.
12. **Treating a polished GIF or clever name as a discovery engine** — it converts *arrived human* traffic only;
    irrelevant for infra libraries (curl, SQLite) and for LLM-mediated discovery that never renders a README.
13. **Assuming HN/Reddit is the universal gateway** — tutorial-ranked channels (Qiita/Zenn) reward usefulness over
    controversy, and large ecosystems (Vue in China) win through non-English channels first; porting the
    polarizing-thesis tactic across channels backfires.
14. **Anchoring to an incumbent on its strongest axis when you would lose the head-to-head** (RethinkDB vs MongoDB on
    speed), or anchoring a new language/framework/category at all (Rust dropped "systems programming").
15. **Over-claiming with a uniformly positive pitch to an expert, adversarial audience** — concede your limits first.
16. **Reading a funded team's velocity as a reproducible solo itch** — Astral's cadence is partly bought; an unfunded
    maintainer cannot copy it.
17. **Relicensing an adopted base to capture revenue** — BSL/SSPL retroactive relicenses repelled the community and a
    well-funded fork captured the base (OpenTofu, Valkey); choose the license up front instead.
18. **Running a critical project at bus-factor-1 with no funding or succession** — the modal slow death (core-js) and the
    modal attack surface (XZ backdoor via an exhausted maintainer); sponsorship platforms soften but rarely solve this.
19. **Leaving the contribution funnel fully open in the AI-PR-spam era** — low-effort generated PRs invert the cost
    asymmetry and can swamp a reviewer-bound project.
20. **Reading your own launch story as proof of mechanism, or reading any mechanism here as timeless** — survivorship bias
    and the post-2008 platform regime both inflate apparent universality; the LLM-discovery shift may already be obsoleting
    the README/demo/aggregator playbook.
