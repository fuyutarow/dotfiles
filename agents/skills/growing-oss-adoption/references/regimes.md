# The five regimes of developer-OSS spread

Parent: SKILL.md §1. **Read this before any tactical decision.** The internet's loudest OSS advice
("ship a single binary, post a benchmark to Show HN, lead with a GIF") is the *CLI* playbook. It is
genuinely strong — for CLIs. It **actively misleads** the other four regimes, which obey different
acquisition physics. Most OSS by count is libraries; the regimes most relevant to a scientist are
research software and protocols. Classify first.

> **The operational tell:** *Can ONE developer fully decide this is worth it from a short solo trial,
> with no one else needing to adopt?* **Yes** → developer experience recruits the first wave (the CLI
> regime). **No** → distribution, capability, or institutional inheritance recruits it, and a "5-minute
> magic moment" has nothing to run.

---

## 1. CLI / drop-in / self-hostable infra — *the solo-adjudicable regime*

**Diffusion unit:** the individual developer, in a ~5-minute solo trial they personally fund.
**Why DX is causal here:** early adopters are practitioners who feel daily-loop pain and respond to its
reduction, legible in a short trial. Abstract capability requires an evaluation no single person will pay for.

This is the *only* regime where the full SKILL.md playbook applies verbatim: zero-config defaults, drop-in
compatibility, a reproducible benchmark, a single static binary, an outcome-titled Show HN launch.
**Exemplars:** ripgrep, fd, bat, zoxide, fzf, fnm, eza, lazygit, uv/Ruff (CLI half), Starship.

**It still fails** when the tool delivers genuinely novel capability with no friction-light substitute
(Kubernetes, Git's distributed model, early TensorFlow won *despite* hostile DX), when adoption is
org/top-down funded (Bazel, Nix, k8s), or when brand/network effects do the recruiting. DX is the
*relative advantage* in a parity-capability substitute category — not a universal law.

---

## 2. Library / SDK — *spread by being the answer, and by being depended-upon*

**Diffusion unit:** the Stack Overflow answer, the tutorial, the transitive dependency, the framework default.
There is **no binary to run** and **no benchmark wedge**; the product *is* the API surface.

- **Discovery path:** a developer reaching a library has a *task*, not a tool-evaluation. The library that
  produces a working snippet in the fewest, most obvious lines gets pasted, blogged, and answered-with —
  compounding into *the default answer* for that task. **The "magic moment" is a copy-pasteable snippet, not
  a demo.** Exemplars: `requests` ("HTTP for Humans" displaced urllib on ergonomics), FastAPI/pydantic
  (type-hint ergonomics + auto-docs), axios over fetch, day.js as a smaller moment.js, Flask/Express
  minimal-surface defaults, serde/tokio as idiomatic-Rust defaults.
- **Transitive-dependency capture:** a library can spread with **zero direct user decision** by becoming a
  dependency of a widely-adopted host — appearing source-level in users' lockfiles. Each popular dependent
  drags its entire install base into your download count; dependents-of-dependents inherit you. Exemplars:
  core-js (everywhere via Babel), lodash, tokio under most async-Rust crates, certifi/urllib3 under requests.
  **But** transitive ubiquity converts to *neither* mindshare *nor* revenue (core-js's maintainer broke;
  left-pad showed the fragility), and the modern enterprise "too many transitive deps = audit surface"
  backlash actively penalizes deep trees.

**What misleads you here:** "single static binary", "5-minute binary demo", "lead with a benchmark." The
analogues are *smallest correct snippet* and *one import, zero config*. A faster/cleaner library with worse
Stack Overflow/tutorial coverage **loses** to the worse-but-better-documented incumbent — which makes
libraries acutely sensitive to the **LLM-training-prior shift**: a model recommends the library it was
trained on (see `epistemics.md`).

---

## 3. Research / scientific software — *the lab, the course, the paper*

**Diffusion unit:** the lab, the course, the paper — **not** the individual developer. "Adoption is a solo
decision" is **FALSE** here.

A method's reference implementation becomes the citable, reproducible artifact reviewers expect. Once a
leaderboard or a flagship paper uses it, replication pressure and course syllabi inherit it to the next
cohort; a model/dataset hub creates registry-layer network effects on top.

- **Discovery:** arXiv + papers-with-code + conference tutorials. **Adoption:** a PI / course / reviewer
  decision driven by reproducibility and citation pressure. **The "magic moment" is a reproducible
  notebook/Colab or a leaderboard entry**, not a binary demo.
- **Exemplars:** PyTorch (won the research loop vs TensorFlow 1.x on eager-mode DX, then was inherited by
  courses/labs), Hugging Face `transformers` + model hub (a modern registry-layer lock-in: the network effect
  is *shared weights*, not a protocol), scikit-learn (course/tutorial inheritance), NumPy/SciPy/Pandas/Jupyter/JAX
  (institutional substrate). TensorFlow's hostile DX lost the research loop *despite* Google's backing — DX
  matters even here, but only as a tiebreaker among lab members.

**What misleads you here:** the CLI creed (binary demo, `curl|sh`, Show HN) actively misleads a scientific-tool
author. Network effects live at the **model/dataset hub** (Hugging Face), a distinct registry layer from npm.
*(Note for the AI4S reader: this is your regime. The advice that fits a Rust CLI is the advice that fits your
tool least.)*

---

## 4. Protocol / standard-track — *recruit implementers, not users*

**Diffusion unit:** independent **implementers**. You win by getting many tools to build to your *interface*;
the moat is the N-implementers × M-consumers combinatorial complementarity — **not** a registry, **not** a binary.

Each new implementer multiplies value to every consumer and vice versa; once enough independent tools speak the
interface, it is cheaper to conform than to compete. No central registry is required — the spec itself is the
coordination point.

- **Exemplars:** LSP (one protocol, N editors × M language servers — arguably the decade's most consequential
  dev-OSS spread), OCI image/runtime spec, OpenTelemetry, Tree-sitter grammars, OpenAPI. **MCP is the live
  2025–2026 instance** (recruiting tool/server implementers).
- **Requires** a credible first set of *independent* implementers and usually a sponsor with reach to seed them
  (Microsoft for LSP, the container ecosystem for OCI, Anthropic for MCP). **A spec with one implementer is just
  a library with extra steps** — the mechanism only fires once adoption is multi-vendor.

**What misleads you here:** "registry", "binary", "benchmark." Your launch artifact is *implementer outreach* and
a reference implementation, and your "second-user" milestone is a *second independent implementation*.

---

## 5. GUI / editor extension / desktop app — *marketplace ranking and in-tool recommendation*

**Diffusion unit:** marketplace discovery ranked by install count + reviews, plus in-tool recommendation.

Users browse and install *inside the tool they already live in*; ranking algorithms reward install count and
ratings (a rich-get-richer social-proof loop), and "recommended extensions" / workspace configs propagate picks
peer-to-peer. **Exemplars:** VS Code Marketplace, JetBrains plugins, Chrome Web Store, Raycast/Alfred/Obsidian
plugin stores, Neovim via lazy.nvim, Homebrew casks for GUI apps.

**What misleads you here:** the CLI surfaces (README-as-landing-page, `curl|sh`, single binary) only partly
transfer. Your landing page **is the marketplace listing** — its screenshots and ratings. Ranking is gameable
and incumbency-biased (review counts compound), so a better late entrant faces a *social-proof moat* (distinct
from a true network effect). An early lead compounds independent of ongoing merit.

---

## Cross-regime: who actually crosses the chasm

The pragmatic majority **inherits** tools rather than choosing them — via a higher-altitude default, a silent
embedding, a marketplace placement, a creator endorsement, a network effect, or (increasingly) the LLM's prior.
These distribution mechanisms span regimes and are detailed in `principles.md` (cluster *"What crosses the
chasm"*). The one cross-regime law: **distribution beats love.**

| Your artifact is… | Then your real distribution channel is… |
|---|---|
| a CLI with a natural host | the framework default / silent embedding (esbuild→Vite, ripgrep→VS Code) |
| a CLI with no host | viral demo + dotfiles + saturated package managers (jq, fd, bat, zoxide) |
| a library | tutorial / Stack Overflow answer / transitive-dependency capture / framework default |
| research software | paper + leaderboard + model-hub presence + course/lab inheritance |
| a protocol | recruited independent implementers + a seeding sponsor |
| a GUI/extension | marketplace ranking + in-tool "recommended" |
| **any of the above, 2026+** | the LLM's training prior + the agent's hardcoded default + an MCP server |
