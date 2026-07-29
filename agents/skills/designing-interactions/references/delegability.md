# Delegability — the interface that only one actor can drive

> Scope: gate **U3**. The captive-interface critique, generalized past the terminal; the concrete
> rules per medium; and the honest limits of the doctrine. The irreversible-action carve-out that
> both Gancarz and this skill grant is owned by `reversibility.md`.

## 1. The critique, in its own words

Gancarz, *The UNIX Philosophy* / *Linux and the Unix Philosophy*, Tenet 8 — "Avoid captive user
interfaces." His literal definition:

> "a CUI is a style of interaction with an application that exists outside the scope of the
> highest-level command interpreter present on the system… you are, in effect, held captive within
> the user interface of the application until you take actions that cause it to release you."

Five arguments, each verified against the chapter, and each of which transfers to any medium:

| His argument | Verbatim anchor | The general form |
|---|---|---|
| **CUIs assume the user is human** | "even the speediest typists do not type much more than 80 words per minute… not very fast at all" | the surface runs at the throughput of the slowest possible actor and cannot exceed it |
| **Hard to combine** | "Programs with CUIs are hard to combine… This deadly spiral feeds on itself" | the surface cannot be an input to anything; every integration becomes bespoke |
| **Do not scale** | the `adduser`-several-thousand-users case | cost is linear in a human's attention, so N× the work is N× the humans |
| **No software leverage** | CUIs "cannot multiply their effects — and the effects of their developers — on the computer world" | work done once cannot be replayed, shared, or amortized |
| **Grow big to compensate** | "GUIs tend to adopt a big is beautiful approach" — menus, creeping featurism | unable to compose, the surface absorbs every adjacent need internally |

Only three tenet titles are reproduced here because only three were verified verbatim: Tenet 1
"Small is beautiful," Tenet 8 "Avoid captive user interfaces," Tenet 9 "Make every program a
filter." Do not invent the other six.

The supporting canon: McIlroy's summary — "Write programs that do one thing and do it well. Write
programs to work together. Write programs to handle text streams, because that is a universal
interface." — and Raymond's *The Art of Unix Programming*, whose seventeen rules (Modularity,
Clarity, Composition, Separation, Simplicity, Parsimony, Transparency, Robustness, Representation,
Least Surprise, Silence, Repair, Economy, Generation, Optimization, Diversity, Extensibility) and
interface bestiary (Filter, Cantrip, Source, Sink, Compiler, ed, Roguelike, **Separated
Engine-and-Interface**) are the pattern vocabulary. Rule of Silence, verbatim in spirit: programs
that babble should "not emit unrequested data at all."

**Separated Engine-and-Interface is the pattern U3 actually wants.** It resolves the whole tension:
the engine is drivable by anything; the interface is one of several front ends.

## 2. Who the other actor is

The critique is usually read as "make it scriptable." That is one row of five, and the narrowest.

| Actor who cannot drive a captive surface | What they need instead |
|---|---|
| a script, a scheduled job, a CI step | a non-interactive path for every value the surface can prompt for |
| **assistive technology** — a screen reader, a switch device, voice control | programmatic structure and state announcements, not visual arrangement alone |
| an API caller / another product | a stable machine contract that survives cosmetic changes to the human path |
| an autonomous agent | all of the above, plus errors that teach the next call |
| **a colleague resuming your session, or you tomorrow** | state that is inspectable and re-enterable, not held only in the live session |

The accessibility row is the one most often forgotten and the one that makes the gate
domain-agnostic: a screen-reader user is an actor driving your surface through a different channel.
If the only way to know the current state is to look at a particular pixel region, you have built a
captive surface whether or not a terminal is involved.

## 3. The legitimacy carve-out — and its honest status

**A captive surface is legitimate when the interactivity IS the deliverable** — live triage,
exploration, or authorship, where the human's judgement enters continuously and there is no batch
answer being withheld. A REPL, a debugger, a drawing canvas, `htop`, a game.

**It is a defect when it wraps a batch-computable result** — when a machine could have produced the
same outcome and a prompt is standing in for a parameter nobody exposed.

Two tests, in order:

1. **Is there a batch twin?** Many canonical interactive tools have one: `gdb -batch` /
   `-batch-silent`; `less` detecting a non-terminal and degrading to pass-through; `git rebase -i`
   driven by `GIT_SEQUENCE_EDITOR`. If you are building a new interactive surface, ask whether a
   headless equivalent can produce the same effect.
2. **When there is no twin, is the interactivity the deliverable?** `htop` had no batch mode at all
   for years, and its later `-b` is a degraded snapshot rather than a substitute — because live
   re-sorting, drilling into a tree, and killing by cursor selection *are* the product.

**Status disclosure.** No named authority states either test. Gancarz draws **no** exception for
editors, debuggers, pagers or REPLs, and by his literal definition every one of them is captive.
Present these tests as inference from precedent, naming the precedent tools. Never attribute them
to Gancarz, Raskin, or "the Unix philosophy."

## 4. Command surfaces — the concrete rules

Converging, independently-authored: clig.dev, the 12-Factor CLI essay, POSIX Utility Syntax
Guidelines, GNU Coding Standards.

| Rule | Source anchor | Why it is a U3 rule |
|---|---|---|
| Payload to **stdout**, logs and errors to **stderr** | clig.dev; 12-Factor: "stdout is for output, stderr is for messaging" | `cmd \| jq .` must get clean data; a captured transcript must not force a consumer to filter prose out of its payload |
| Ship `--json` (or equivalent) on every data-returning command and treat **that** as the stable contract | clig.dev | improving the human-facing default must never be a breaking change for machine consumers |
| Gate colour and animation on `isatty(stdout)`; honour `NO_COLOR` when "set and not empty" | clig.dev | a piped spinner becomes a scroll of carriage returns; an explicit `--color=always` should still win |
| **Every promptable value must also be settable by flag or stdin.** Check `isatty(stdin)`; when false or `--no-input`, fail fast naming the exact flag | clig.dev: "Never require a prompt" | this is the single highest-value rule in the gate |
| Exit code is the sole truth of success/failure — never print an error and return 0 | clig.dev | a caught-and-logged exception falling through to exit 0 is invisible to every non-human caller |
| `-h` / `--help` identical at every subcommand level; bare invocation of a command needing required args prints help, not a parse error | clig.dev; GNU (`--help`/`--version` unconditional) | help is the first probe any unfamiliar driver makes |
| Destructive actions: interactive `y`/`yes` gate **when stdin is a TTY**, plus an unconditional `-f`/`--force` when it is not; scale the difficulty of `--force` to severity | clig.dev's mild/moderate/severe tiers | keeps the U4 gate without making the surface captive |
| Re-running the identical invocation after a crash resumes or safely no-ops | clig.dev robustness / crash-only | agents and retry loops re-run blindly; genuinely non-idempotent effects need an idempotency key or a dry-run |
| Prefer named flags to positional args past one or two operands | clig.dev; 12-Factor | a wrong positional order fails silently; a wrong flag name fails loudly |
| Ordinary arguments are **inputs**; output goes to an explicit `-o`/`--output` | GNU | prevents clobbering when argument order shifts |
| Options end at the first non-option token or an explicit `--`; **"Option-arguments should not be optional"** | POSIX Guideline 7 | ambiguous `-o[FILE]` lookahead is exactly what a machine-constructed argv gets wrong |
| SIGINT handler acknowledges immediately, bounds cleanup with its own timeout, treats a second Ctrl-C as abort-cleanup | clig.dev | a harness reclaiming a hung child needs the process to actually die |

A widely-used composite default: when stdout is a TTY, print a formatted table with colour; when it
is not, default to JSON.

## 5. Agent-facing surfaces — one regime, with first-party guidance

This regime differs from the others in one respect worth stating plainly: it is the only one where
the vendors have written the guidance down explicitly. The four CLI documents above predate LLM
agents and never name them; do not claim they anticipated this. MCP's spec and Anthropic's
engineering posts do name it.

Anthropic, *Building Effective Agents*: "Think about how much effort goes into human-computer
interfaces (HCI)… agent-computer interfaces (ACI)," plus "**Poka-yoke your tools**" and "test how
the model uses your tools." And from *Writing effective tools for AI agents*: "instead of writing
tools and MCP servers the way we'd write functions and APIs… we need to design them for agents."

| Rule | Note |
|---|---|
| Namespace tools with a consistent prefix or suffix when many are loaded | Anthropic reports the prefix-vs-suffix choice measurably moves tool-use accuracy — A/B it, do not assume it is cosmetic |
| Default list/search tools to a bounded page size; on truncation, append explicit next-step text (how to page, how to narrow) | a bare "…(truncated)" teaches nothing; responses are capped at 25,000 tokens by default in Anthropic's own tooling |
| Write errors as instructions for the **next** call: name the bad field, the expected format, a corrected example | MCP's canonical example: "Invalid departure date: must be in the future. Current date is 08/08/2025." |
| Return business/validation failures as a tool **result** with `isError: true`; reserve JSON-RPC protocol errors for "your code called me wrong" | mixing the two destroys the self-correction signal the two-channel design exists for |
| Prefer human-legible fields (name, url, type) over raw UUIDs; expose technical IDs behind an explicit `response_format=detailed` | unless the ID *is* the value the next call needs (a commit SHA, a pod name) |
| Write each tool description as onboarding for a competent stranger — units, ranges, edge cases | "think of how you would describe your tool to a new hire"; but description tokens are in the context budget, so terse-plus-teaching-error can beat exhaustive |
| Put the confirmation gate in the **client/host**, not in the tool's stdin | MCP: there "SHOULD always be a human in the loop." A well-designed agent tool is non-interactive; the harness enforces the gate |
| Never treat a caller's annotations as a security boundary | MCP's own warning: an untrusted server "can claim `readOnlyHint: true` and delete your files anyway." Non-interactivity is a usability property, not a safety one |

**The documented failure this regime exists to prevent** is mundane and real: a subprocess hits an
interactive prompt and hangs until the harness times out. It is reported against real tools (a
gemini-cli issue on a shadcn overwrite prompt; practitioner write-ups noting "an agent cannot type
`y`"). The canonical pre-existing escape hatches — `GIT_PAGER=cat`, `DEBIAN_FRONTEND=noninteractive`,
`CI=true`, AWS's `--no-cli-pager`, `NO_COLOR`, `--yes`/`--force` — exist because this failure long
predates agents; agents only made it constant. And note the ecosystem has *not* converged: the same
issue thread proposes teaching the harness to answer prompts as a competing fix.

The plan-then-apply pattern is the other half: `terraform plan`, `kubectl diff`, apiserver dry-run.
Kubernetes documents the motivation as "it can be difficult to know how your object is going to be
applied by the server" — mutating admission makes the outcome non-obvious. Any surface whose effect
is not predictable from the invocation owes its drivers a dry-run.

There is a small named discourse here — Biilmann's "AX" ("the holistic experience AI agents will
have as the user of a product or platform"), `llms.txt` — but it is thin. Cite it as emerging
practitioner vocabulary, not as an established field.

## 6. GUI and accessibility — delegation through a different channel

The ARIA dialog pattern is the concrete case where **structural modality is mandatory**: focus
moves into the dialog on open, Tab/Shift+Tab are trapped inside it, Escape closes it, and it
carries `role="dialog"`, `aria-modal="true"`, and an accessible name. Visual dimming conveys
"blocked" to sighted users and nothing at all to anyone else.

This produces the irony worth internalizing: **an accessible modal needs more modality machinery,
not less.** So distinguish the two things a "reduce modality" goal can mean —

- **perceived modality** — surprising, undiscoverable state changes. This is what U1 attacks.
- **structural modality** — focus traps and `aria-modal`. This is what genuine blocking *requires*,
  and removing it makes the surface less delegable, not more.

For any bulk-selection surface: each row's selection control needs a unique, item-naming accessible
name (not a repeated generic label), and selection-count and bulk-action results must be pushed
through a live region — otherwise the state exists only for the actor looking at the screen.

## 7. Counter-evidence — where this doctrine loses

Hold these ready; a designer who has not met them will over-apply the gate.

- **Worse Is Better** (Gabriel). The MIT/New-Jersey priority orderings, and the barb that "Unix and
  C are the ultimate computer viruses" — spread, not correctness, is what the composable-tools
  tradition actually optimized.
- **Text is a lossy universal interface.** Pike's *cat -v Considered Harmful* is the internal
  version of the complaint; the sharper external one is that a universal text pipe throws away
  structure and forces every consumer to re-parse. It is a seductive abstraction, not a free one.
- **The counter-examples are the winners.** git, docker, and kubectl are not small single-purpose
  programs. Hipp's "many small tools, loosely joined" critique names Apache, Python and ZFS the
  same way. Monolithic tools with excellent internal composition beat composable ecosystems often
  enough that "small and composable" is a preference, not a law.
- **Consolidation can be right for agents too.** Anthropic's own guidance suggests shipping one
  composite tool for a workflow an agent will predictably chain — explicitly cutting against
  small-sharp-tools, and explicitly a judgement call to be settled by evaluation.
