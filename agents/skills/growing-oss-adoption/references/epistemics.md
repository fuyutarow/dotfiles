# The epistemic frame — how to read all of the above

Parent: SKILL.md §6. The two `robust` principles (the only ones that survived without a regime caveat), the
forces re-parameterizing the whole frame, and a 14-item research agenda. This is the reflexive layer: *the survey
demands hostile re-running of every tool author's claims, so it must hold its own claims to the same standard.*

---

## 1. Survivorship bias is the dominant honest finding · *robust*

Any single "it spread because of X" claim must be discounted by the **invisible base rate** of equally-good tools
that died of indifference, lucky timing, a pre-existing author audience, or funded velocity — **except** where the
mechanism is independently reproducible and resolves an under-served pain.

We study only tools that achieved newsworthy adoption, so famous launches **over-attribute outcome to merit** when
distribution accidents, platform timing, the author's prior credibility, and paid engineering were load-bearing.

- ripgrep's author already maintained Rust's regex crate. eza inherited exa's orphaned base. Tailwind/Vite launched
  onto warm audiences. Astral's velocity is partly VC-funded. Aggregator launches over-attribute outcome to merit.
- The boundary (where mechanism *is* load-bearing): fzf and Homebrew spread from cold-start authors on a reproducible
  mechanism.

**The operational split — burn this in:**

| LAUNCH SPIKE (largely non-reproducible) | DURABLE ADOPTION (reproducible) |
|---|---|
| author's prior audience · aggregator lottery · timing · funded DevRel | order-of-magnitude speed · drop-in compatibility · copyable integration |
| dominant for frameworks / ecosystem-lock tools | load-bearing for CLIs / single-binary utilities (ripgrep, fzf, Homebrew) |
| treat as a lottery ticket | **invest here** |

"Mechanism is not winning" is **FALSE** as a blanket claim — it holds mainly for high-switching-cost, network-effect
tools, not for low-switching-cost, solo-adjudicable utilities.

**Reflexive corollary.** The often-cited aggregator-launch statistics (a large median spike that then flatlines, a weak
spike-to-stars correlation, low week-one survival) point in the right *qualitative* direction but circulate **without a
firm published source**. Treat them as illustrative estimates, not measurements — and apply "your benchmark will be
re-run by a hostile reader" to this survey's own numbers.

---

## 2. The whole mechanism set is conditioned on the post-2008 platform regime · *robust*

Every mechanism here assumes the **GitHub + universal-package-manager + comment-aggregator + (increasingly)
LLM-discovery** stack. Pre-GitHub OSS spread through different channels; the LLM shift may re-parameterize or invalidate
parts of the frame. **None of this is timeless.**

- Pre-aggregator era: Linux/Apache spread via mailing lists + distro inclusion; Perl/CPAN via the registry + O'Reilly
  books; Python via stdlib-batteries + education; Git via Linux-kernel necessity.
- The corpus is sampled almost entirely 2018–2024 from JS tooling + Rust CLIs.

**Test any mechanism for era-invariance before generalizing:**

| Clearly era-bound (decay risk) | Plausibly era-invariant |
|---|---|
| single static binary · `curl\|sh` · Show HN launch · animated-GIF README | reduce switching cost · reproducible proof to a skeptical audience · scratch a real pain · distribution beats love |

The honest stance: these are **regularities of one platform era**, robustly observed within it, with explicit decay risk
as discovery moves to agents and as non-Anglophone ecosystems are properly sampled.

---

## 3. The LLM-era discovery inversion (the live, under-measured force)

Discovery is shifting from human aggregators to **LLM recommendation + agent tool-calling**. This is promoted to a
first-class principle in `principles.md` (Cluster 3) because it may invert the field's core dynamic:

- An LLM recommends, and an agent invokes, the tool it **already knows** — so training-cutoff and corpus-frequency become
  a moat. This **rewards well-blogged incumbents and penalizes brand-new tools**, inverting "newest-fastest-wins."
- Being an **agent's hardcoded default** (ripgrep, Bun in Claude Code) converts the host's entire install base into your
  invocations with no human discovery event — the modern silent-embedded-engine play.
- **MCP servers** are a wholly new distributable artifact type with their own discovery (registries) and adoption dynamics.
- The **README-as-landing-page is partly bypassed** — agents read structured docs/types, not screenshots (Tailwind's
  reported drop in *human* docs traffic). Make the machine-facing surface first-class.
- **AI-generated benchmark/README content erodes the honesty-as-credibility signal** a human author once earned — disclose
  provenance.

Practical takeaway already folded into the playbook: seed the LLM channel deliberately (corpus presence + a clean
machine-facing API + an MCP server), and do not assume the human launch playbook still carries you.

---

## 4. The research agenda — 14 open questions

Genuine unknowns this survey could not resolve. For a researcher, these are the falsifiable hypotheses worth a study.

1. **LLM-mediated discovery re-parameterization.** If models recommend what they were trained on and agents invoke
   hardcoded defaults, does this permanently advantage well-blogged incumbents and agent-default holders? Does "be the
   silent engine for AI agents" + ship an MCP server become THE dominant new channel? Does AI-generated content collapse
   the honesty signal?
2. **Are MCP servers a genuinely new project TYPE** with their own discovery and adoption dynamics, or do they collapse
   into the protocol/embedded-engine principles? What is the actual diffusion unit — server author, bundling host, or the
   model that knows to call it?
3. **Does the LLM shift ERASE or PRESERVE non-English-community advantage?** Do English-trained models surface
   English-channel tools and erase the Vue-in-China path, or do localized models preserve it?
4. **Does "comment-ranked aggregator controversy" generalize beyond HN/Reddit,** or do tutorial-ranked surfaces
   (Qiita/Zenn) and other platforms (Juejin/V2EX/velog) reward fundamentally different tactics? Is there a tool that broke
   out FIRST on a non-English aggregator?
5. **Can the launch spike ever be made reproducible,** or is the honest position to optimize only the slow-burn engine
   (substance + package-manager saturation + one embedding deal + LLM-corpus presence) and treat the front-page event as variance?
6. **What is the actual base rate of drop-in-compatible, fast, well-documented tools that still die** — the size of the
   invisible graveyard — and how would we measure it without conditioning on visible winners? What is the firm source (if
   any) for the aggregator-launch survival statistics this survey leans on?
7. **How much "great DX won" is actually FUNDED VELOCITY** (Astral, Vercel-backed tooling) an unfunded maintainer cannot
   reproduce? Is there a clean way to decompose the organic-itch contribution from the bought-engineering contribution?
8. **Where is the boundary between "breadth is the viral hook" (Bun, Kubernetes) and "over-expanding pre-PMF dilutes"?**
   The discriminating variable (audience ownership? consolidation-as-wedge? funding?) is under-specified.
9. **Does credibly-neutral governance CAUSE enterprise adoption or merely RETAIN locked-in adopters?** Given that trust
   re-pointed cleanly to OpenTofu/Valkey, is "trust is not forkable" simply false — making a well-funded fork sponsor the
   real insurer rather than the original steward's neutrality?
10. **For embedded-engine / transitive-dependency projects** (esbuild, Babel, ripgrep, core-js), is there ANY move that
    converts huge invocation/install count into durable position or revenue before the host vertically integrates and
    evicts you, short of being SQLite/zlib-class irreplaceable?
11. **Do sponsorship platforms** (GitHub Sponsors, Tidelift, Open Collective, thanks.dev) materially change the
    bus-factor-1 failure rate, or do they fund a thin minority and leave the modal critical-but-unfunded maintainer
    (core-js, XZ) exactly as exposed?
12. **How does AI-generated low-effort PR/issue spam change the user→contributor funnel** — does the open contribution
    model survive, or do all serious projects move to gatekept contribution, and what does that do to the
    self-reproducing-maintainer mechanism?
13. **Is the regime taxonomy itself stable,** or are agentic coding workflows collapsing the distinctions — an agent can
    trial org-scale tooling on a developer's behalf (eroding the solo-vs-org line) and read a paper's companion code
    without the lab decision?
14. **For the protocol regime, what is the minimum viable implementer count + sponsor reach** that tips a spec from
    "library with extra steps" to self-sustaining N×M complementarity, and can an unsponsored author ever ignite it?
