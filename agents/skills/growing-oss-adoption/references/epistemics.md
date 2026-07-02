# The epistemic frame — how to read all of the above

Parent: SKILL.md §6. The two `robust` principles (the only ones that survived without a regime caveat), the
forces re-parameterizing the whole frame, a 14-item research agenda, and the multi-agent execution map (§5).
This is the reflexive layer: *the survey demands hostile re-running of every tool author's claims, so it must
hold its own claims to the same standard.*

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

---

## 5. Running this skill on a multi-agent harness — hold agents to the survey's own standard

Scope: developer-facing OSS diagnosis, verification, and launch-readiness work executed with
subagents — WHO runs each step of this skill, nothing more. Harness mechanics (spawn tools,
permissions, hooks) belong to the `operating-the-harness` skill. Agents are **channel inspectors
and hostile readers, never diffusion oracles**. The evidence boundary: **Tier-1** — present,
observable channel state (a registry page, a ranking, a command's output today) — is admissible
from an agent **with provenance** (URL or command output); **Tier-2** — future or counterfactual
adoption ("this will spread", "X would have won") — is inadmissible from agents *by construction*:
no fetchable source can exist for it. Operating guidance from a frontier model (Fable 5, 2026-07):
if a constraint here feels unnecessary, that feeling is the failure mode.

**The map — what fans out, what stays solo:**

| Step | Mode | Why / how |
|---|---|---|
| Regime classification (SKILL.md §1) | **SOLO** | the precedence rule; seconds, and every downstream tactic depends on it |
| Decision forks (SKILL.md §3) | **SOLO** | the modal invocation of this skill — zero agents |
| Diagnosis: channel sweep | **FAN-OUT, one agent per channel** | package managers (brew/cargo/npm/AUR) · marketplace listing + ratings · tutorial/SO/awesome-list coverage · transitive-dep + flagship-repo configs · LLM-prior probe (ask a clean model what it recommends for the task) · repo health |
| Hostile verification | **FAN-OUT, refutation-framed, read-only** | re-run the published benchmark harness · clean-room <5-min trial · README vs `playbook.md` Phase 3 — "did not reproduce" is the default verdict the agent must overturn with evidence |
| Plan/README audit | **FAN-OUT, one SURVEY LENS per agent** | survivorship · regime-mismatch · era-boundedness — the lenses that forged this skill, reused at runtime |
| Two-gate verdict (§0 DISCOVERY vs ADOPTION) | **BARRIER on the sweep, then SOLO** | which gate failed is a judgment over the whole channel picture, not any shard of it |
| Prescription / positioning / drafting | **SOLO** | one voice; the slot-claim sentence is one judgment |
| Adoption outcome / wedge commitment | **NOT DELEGABLE** | a forward bet reality has not priced — hand it to the acting-on-hypotheses skill |

The channel sweep IS this skill's inspection duty, internalized — every "is it discoverable /
adopted" claim rests on a channel actually inspected, whoever executes the sweep.

**The agent contract** — five elements per spawn, mirroring the systematizing-knowledge
orchestration reference: (1) exact inputs — repo URL, registry names, file paths, never "look into
the project"; (2) the bar — the named reference file of THIS skill the agent reads itself
(`regimes.md` for regime checks, `playbook.md` Phase 3 for README audits), never a paraphrase;
(3) structured return: `{channel, fact, number, source_url_or_command_output, verdict}`;
(4) read-only declaration for every audit/verify agent — read-only with respect to the project/repo
under audit; scratch-workspace execution (benchmark re-run, clean-room trial install) is in-bounds;
(5) the final message is data, not a report.

| Anti-pattern (orchestration-scoped) | Fix |
|---|---|
| **SYNTHETIC SURVIVORSHIP** — fanning out "will this spread?" opinion agents and vote-counting | N concurring agents = ONE correlated launch story (§1 applied to agents); agents report present-state facts and refutations only — the diffusion judgment is solo |
| **UNPROVENANCED CHANNEL STATS** — agent-asserted stars/downloads/spike medians entering advice unsourced | anti-pattern 7 (`decisions.md`) at machine speed: fetchable source or quarantine |
| **DELIBERATED ADOPTION** — reading an agent consensus pass as validation of the wedge/launch bet | reality has not voted; route the commitment to the acting-on-hypotheses skill — agents may CHEAPEN the test (run the trial), never replace the signal |
| **CORPUS CREEP** — a diagnosis mutating into a re-survey of the adoption literature | that is the systematizing-knowledge pipeline, not a fan-out of this one |

| Task shape | Fleet |
|---|---|
| Single question / one decision fork | solo, zero agents — the modal case |
| Full adoption diagnosis or launch-readiness audit of ONE project | 3–8 channel/lens agents + a solo verdict |
| Corpus-scale adoption-research question (§4 agenda) | the systematizing-knowledge map, not this one |

No harness? The channel sweep degrades to a serial inspection checklist walked personally; the three
lenses become sequential self-review passes; provenance-or-quarantine is unchanged.
