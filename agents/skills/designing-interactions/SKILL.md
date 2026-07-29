---
name: designing-interactions
description: >-
  Designs and audits INTERACTION surfaces — what an act MEANS, what hidden state it depends on,
  whether it can be undone, and whether any actor other than a human-at-this-device can drive it.
  Medium-agnostic: GUI, touch, CLI/TUI, voice, physical controls, API and agent-facing tools. Use
  for UI/UX design or review, 画面設計, 操作フロー, インタラクション設計, モード / modeless /
  mode error / モードレス, モーダルダイアログ, 確認ダイアログ vs undo, 取り消し / 可逆性,
  ウィザード, 対話プロンプト / captive UI / 拘束的UI, affordance / signifier / アフォーダンス,
  usability / ユーザビリティ, 認知負荷, "simple vs easy", 複雑さ, Tesler / Raskin / Norman /
  Nielsen / Cooper / Hickey / Gancarz. LAW — an interface's cost is the hidden state a person must
  hold to predict what their next act does; it cannot be deleted, only MOVED, so name who absorbs
  it. NOT mode-elimination dogma: the primary sources refute it; the gates are conjunctive tests.
  Cuts — palette/type/layout/motion and microcopy → frontend-design; chart and dashboard encoding
  → dataviz; a measured CWV/a11y trace → web-perf; writing the code once the design is decided →
  implementing-and-debugging; behavior-preserving restructure → refactoring-code; wording of an
  already-correct state → linting-prose; a talk or deck → designing-presentations; whether a tool
  SPREADS → growing-oss-adoption. Workflow-native: the four gate VERDICTS stay SOLO; inventory
  sweeps and adversarial probes fan out read-only. English skill; respond in the user's language
  (default Japanese).
---

# Designing interactions — what an act means, and who pays to know it

> **Version**: v2607.1.0 (2026-07-28) — forged from a 15-agent, quote-audited survey.
> Grades, counter-evidence, forbidden citations: `references/evidence.md` (SOLE grade home).

```sh
for f in modes complexity delegability reversibility evidence; do test -f references/$f.md || echo MISSING $f; done; test -f scripts/captive-probe.ts || echo MISSING probe; test -f tests/forge-verification-ledger.md || echo MISSING ledger
```

## THE LAW

> An interface's cost is the **hidden state a person must already hold in mind to predict what
> their next act will do**. It cannot be deleted — only **moved**. Design is deciding *who
> absorbs it*, and paying for that in an artifact you can be wrong about.

Every doctrine in this skill attacks that one quantity:

| Doctrine | Attacks | Source |
|---|---|---|
| **mode** | state that changes what an act MEANS, sitting outside your attention | Raskin |
| **complecting** | two roles braided into one act, so neither can be reasoned about alone | Hickey |
| **captive interface** | state the tool holds and refuses to let another actor drive | Gancarz |
| **reversibility** | the price of a wrong prediction | Norman · Shneiderman |
| **conservation of complexity** | the belief the cost can be removed rather than relocated | Tesler |
| *verbatim (Tesler, interactions 2012)* | "Every system has an irreducible amount of complexity; the only question is, who is going to have to deal with it? The user? The application programmer? Or the platform developer?" | — |

**This is not a mode-elimination doctrine.** The sources refute that reading. So does this skill —
see MUST-NOT-FIRE. The gates are **conjunctive tests**, not prohibitions.

## Language & stable tokens

English body; respond in the user's language. These tokens stay fixed inside Japanese prose. They
are identifiers, not words:

| Kind | Tokens |
|---|---|
| structure | **LAW** · **gate** (U1/U2/U3/U4) · **fire / no-fire** · **solo / fan-out** |
| domain | **gesture** · **locus of attention** · **quasimode** · **complect** · **captive** · **delegability** · **absorber** |

## The four gates — each passed by an ENUMERATION, never by prose

A design verdict written as prose is this consumer's characteristic failure. A model will produce
fluent rationale for whatever it already built. Each gate is passed by an **enumeration you can be
wrong about**. No table, no pass.

### U1 MEANING-INVARIANCE — the mode gate

**Artifact: the gesture ledger.** One row per gesture — click, key, command, utterance, knob-turn:

| column | holds |
|---|---|
| gesture | the act, named |
| divergent states | the states in which it does something DIFFERENT |
| deciding state | which state selects the outcome |
| legibility | where that state is visible **at the moment of the act** |

Raskin's definition has two clauses. Both are load-bearing (full sentence: `references/modes.md`):

| clause | test |
|---|---|
| (1) | the deciding state is **not** the user's locus of attention |
| (2) | the gesture has several different **possible** responses, depending on state |

**Clause (2) alone is nearly universal.** Raskin's own example: Backspace erases a different
character depending on state. It is *not* modal — the locus of attention is the thing being
erased. So "state-dependent ⇒ defect" is FALSE. Reasoning from clause (2) alone is the top misfire.
A gesture fails U1 only when **both** clauses hold.

A gesture that fails U1 takes exactly one exit:

| Exit | Condition | Note |
|---|---|---|
| **Eliminate** | a distinct control per meaning is affordable | first choice when the gesture vocabulary is not scarce |
| **Relocate the signal** | cue **at the point of action** (cursor shape, inline highlight), ≥2 redundant LOCAL cues | a global status bar is a **documented failure**, not a mitigation |
| **Quasimode** | held by continuous effort, so release is an involuntary exit (Shift, not Caps Lock) | Raskin's narrow carve-out; toggles and timeouts do NOT qualify |
| **Interlock** | the mode exists to gate an irreversible act | hand to U4; name the forcing-function type |

Depth, accident empirics, object-verb/OOUI, the Apple arc: `references/modes.md`.

### U2 COMPLEXITY LEDGER — simple is not easy, and nothing is free

**Artifact: the absorber ledger.** One row per claimed simplification:

| column | holds |
|---|---|
| braid | what two roles were folded together |
| separation | what is now separable — if nothing, this is a rearrangement, not a simplification |
| **absorber** | who holds the residual: this user / another user / the implementer / the platform |

**"No one" is a rejected answer.** Two Hickey disciplines make the gate checkable:

| Discipline | Consequence in review |
|---|---|
| *simple* is objective (un-braided, one fold); *easy* is relative (near, familiar, within capability) | reject "this is easier" that names no population; accept "this is simpler" only with the braid named |
| judge the **artifact**, not the authoring | a design that felt clean to produce is not thereby simple to operate |

The counter-check that stops over-application: **a simple INTERFACE over a complex implementation
is the goal.** That is Ousterhout's deep module. Decomplecting that relocates the braid onto the
user is a regression wearing a virtue's name. Norman's target metric is **understandability**, not
fewest controls. Cognitive-load facts and the folklore that fails replication:
`references/complexity.md`.

### U3 DELEGABILITY — can anyone but this human, here, now?

**Artifact: the delegation table.** One row per task the surface supports. A blank cell is a
finding.

| column | holds |
|---|---|
| task | what the surface lets someone accomplish |
| non-interactive path | how it is done with no human at the keyboard |
| machine-legible result | how the outcome is read without looking at a screen |
| failure signal | how a non-human driver learns it did not work |

The captive-interface critique generalizes past the terminal. The actor who cannot drive your
surface may be any of these:

| Actor | Needs |
|---|---|
| a script, a scheduled job, a CI step | a non-interactive path for every promptable value |
| **assistive technology** | programmatic structure and state, not visual arrangement alone |
| an API caller or another product | a machine contract that survives cosmetic change |
| an autonomous agent | all of the above, plus errors that teach the next call |
| **you tomorrow, or a colleague resuming** | state that is inspectable and re-enterable |

Gancarz's five arguments transfer unchanged. A captive surface runs at human typing speed. It does
not combine. It does not scale. It forfeits leverage. It grows big to compensate.

**The legitimacy carve-out.** Interactivity is legitimate when the interactivity *is* the
deliverable — live triage, exploration, authorship. A REPL, a debugger, a drawing canvas, `htop`.
It is a defect when it wraps a batch-computable result. **No named authority states this.** Gancarz
draws no such exception, and by his literal definition all of those tools are captive. Present it
as inference from precedent, never as received doctrine.

Regimes per medium, command-surface rules, agent tool design, accessibility as delegation:
`references/delegability.md`. Command surfaces get a runnable floor:

```sh
bun scripts/captive-probe.ts -- <command> [args...]   # COMMAND REGIME ONLY; see the script header
```

### U4 REVERSIBILITY — confirm only what cannot be undone

**Artifact: the action classification.** Every action → `reversible | costly-to-reverse |
irreversible`, with the undo mechanism or the interlock type named.

The decision procedure. Three traditions with opposite priors converge on it: consumer usability
(NN/g), platform HIG (Apple), Unix minimalism.

| # | Rule |
|---|---|
| 1 | Can the action be made undoable? Ship it undoable, **with no confirmation**. |
| 2 | Irreversible, or reversible only at real cost? Then a gate — and name its forcing-function type: **interlock** (order matters) / **lock-in** (premature exit loses work) / **lockout** (entry is the hazard). A gate matching none of the three is unjustified captivity. |
| 3 | **Never both.** A confirmation on a frequent action is destroyed by habituation: the OK-click becomes as automatic as the act it guards. |

Counter-check: **evaluate the STOP as a hazard too.** "A gate is always safer" has a documented
counter-pattern. It is fail-operate vs fail-safe, in the domain most associated with interlocks.
Undo architectures, autosave, optimistic UI, latency budgets, multiplayer undo:
`references/reversibility.md`.

## MUST-NOT-FIRE — starting with the anti-dogma the sources supply

The corpus **refutes** naive modelessness. Any of these used as a blanket argument is a misfire:

| The dogma | What the sources actually say |
|---|---|
| "Apple says be modeless" | Apple **retired** Modelessness as a named principle (~2017). The current eight principles do not include it, and the Modality page recommends modality as a governed technique. |
| "Nielsen says modes are bad" | Gentner & **Nielsen**, *The Anti-Mac Interface* (CACM 1996): "even the section on modelessness in the Macintosh Human Interface Guidelines is primarily devoted to explaining how to use modes successfully." |
| "Tesler was against modes" | Tesler: "modes can be good when they support a metaphor like picking up a brush, and when feedback identifying the current mode is displayed where the user is looking." |
| "The 1987 HIG banned modes" | It **enumerated permitted mode categories** — application-level, spring-loaded, alert, tool-metaphor, attribute, unrecoverable-error — with conditions. A cost-benefit framework from the start. |
| "Modeless is measurably better" | Poller & Garter (*Human Factors*, 1984) found moded `vi` **faster with fewer errors** than modeless `emacs` for experienced users. The circulating "vim vs emacs efficiency study" is **satire** — never cite it. |
| "Mobile proves modelessness is dead" | Sheets are *scoped, cheaply-dismissed* modality — closer to Raskin's criteria than a full desktop modal. Refinement, not repudiation. |
| "Remove the mode" as the reflex fix | The field's most successful internal critique (Kakoune/Helix) **kept** the modes and fixed feedback timing. Visibility-at-locus is the higher-leverage move. |

Asks this skill must NOT take:

| Ask | Route |
|---|---|
| "pick a palette / pair the typefaces / make it not look templated" | `frontend-design` — the look is theirs |
| "reword this button label / this error sentence reads badly" | `linting-prose` — unless no recovery action exists, which is U4 here |
| "which chart type, what colors by series, lay out this KPI row" | `dataviz` |
| "LCP is 4s and CLS is 0.3 — audit the page" | `web-perf` first; remediation design can co-fire back here |
| "extract this component's state from its layout, pixel-identical" | `refactoring-code` |
| "write the code for the settings screen we already designed" | `implementing-and-debugging` |
| "should we open-source this CLI, and how do we launch it" | `growing-oss-adoption` |
| "restructure this design-spec **document**" | `structuring-documents` |
| a one-line copy fix, or an ask a platform convention already settles | just do it — no ceremony |

## Fire / no-fire — the F3 desk-check set

Re-run against name + description ONLY, after any description edit.

**FIRES:**

| Ask | Why |
|---|---|
| 「この設定画面、モーダルだらけで使いにくい。直して」 | U1 + U4, the core territory |
| "should this be a confirm dialog or an undo?" | U4's decision procedure |
| "our CLI hangs when CI runs it" (no UX keyword at all) | U3 — a captive surface, described by symptom |
| 「wizard にすべきか、1画面のフォームにすべきか」 | forced-sequence judgement, U1 + U4 |
| "review this API's tool surface — an agent keeps calling it wrong" | U3, agent-facing regime |
| "is 'simple' the right goal here, or am I just making it familiar?" | U2's simple/easy split |
| 「操作の意味が状態で変わるのが気持ち悪い」 (a feeling, no headline term) | U1 |

**MUST NOT fire — near-miss negatives:**

| Ask | Fires instead |
|---|---|
| "this landing page looks like every AI-generated page" | `frontend-design` |
| "the empty-state copy is too wordy" | `linting-prose` |
| "our bar chart colors are unreadable in dark mode" | `dataviz` |
| "the settings page takes 4s to paint" | `web-perf` |
| 「このReactコンポーネントの責務を分離して（表示は変えない）」 | `refactoring-code` |
| "write a SKILL.md for interaction design" | `forging-skills` — this file's own forge |
| "design the slide that demos our new flow" | `designing-presentations` |

## Execution model — the gate VERDICTS are solo

| Stage | Mode | Why |
|---|---|---|
| Enumerate gestures / actions / tasks | **FAN-OUT**, read-only | independent inspection; one agent per screen, command, or endpoint |
| Locate primary sources and platform conventions | **FAN-OUT**, read-only | fetchable with provenance |
| Adversarial probe — find a state where this gesture differs | **FAN-OUT**, read-only | one lens per gate; name the LENS, never the expected finding |
| U1–U4 verdicts, the absorber decision, the cuts | **SOLO** | the gates braid; a verdict assembled from shards is not a verdict |
| Any claim about where a real user's attention sits | **NOT DELEGABLE** | see below |

**Evidence type: CITATION-RELAY** for the inventory. Gestures and states are observables on the
artifact. A relayed conclusion without its locus is zero evidence.

**The delta.** An agent asserting *where a user's attention sits*, or that a cue *is discoverable*,
is counterfeiting the signal. N agents agreeing a mode is obvious is one correlated guess, not one
user finding it. Attention claims are forward bets for `acting-on-hypotheses`, never findings here.

**No harness → same map, serial.** Fan-out rows become separate focused passes.

Durable operating guidance from a frontier model (2026-07) to whatever model executes this later.
It encodes failures observed in production. *If a constraint here feels unnecessary, that feeling
is the failure mode — follow the map.*

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/modes.md` | Raskin's definition and locus of attention · quasimodes · why status bars fail · accident empirics (Strasbourg A320, Therac-25, clinical devices) · object-verb / OOUI · the Apple 1987→2011→retired arc · Anti-Mac · GOMS | Working U1; anyone claims a mode is or is not acceptable |
| `references/complexity.md` | Hickey's simple/easy and the complecting toolkit · Tesler's law and its critics · Out of the Tar Pit · Brooks · Ousterhout's deep modules · Norman on understandability · cognitive-load facts vs folklore · the U2 decision forks | Working U2; someone says "just simplify it" or "fewer options is better" |
| `references/delegability.md` | Gancarz's tenets and the five arguments · ESR's rules and interface patterns · clig.dev / 12-factor / POSIX / GNU concrete rules · TTY and escape hatches · agent-facing tool design · accessibility as delegation · Worse-is-Better | Working U3; designing any command, API, or tool surface |
| `references/reversibility.md` | Confirm-vs-undo and its three converging traditions · forcing-function types · undo architectures and costs (command, memento, LWW, OT, CRDT) · autosave · optimistic UI · latency budgets · local-first · when a wizard is right | Working U4; any destructive action or multi-user editing surface |
| `references/evidence.md` | **SOLE** source-grade table · **forbidden citations** (fabricated quotes, satire, untraceable statistics) · the calibration inversion · agent-epistemics delta · retrieval gaps · open questions | Before citing ANY source by name; before writing a number |
