# Reversibility — the price of a wrong prediction

> Scope: gate **U4**. The confirm-vs-undo decision, the mechanisms that make undo real, and the
> latency budgets that decide whether feedback lands. Forcing-function *types* are defined in
> `modes.md` §4 and only referenced here.

## 1. The decision procedure

Three traditions with opposite priors converge on the same rule. That convergence — not any one
source's authority — is why this is stated without hedging.

1. **Can the action be made undoable? Then ship it undoable, with no confirmation.**
2. **Genuinely irreversible, or reversible only at real cost? Then a gate** — and name its
   forcing-function type (interlock / lock-in / lockout). A gate matching none of the three is
   unjustified captivity.
3. **Never both.** A confirmation on a frequently-repeated action is destroyed by habituation.

The three anchors:

| Tradition | Anchor |
|---|---|
| **Consumer usability** (NN/g) | "consider a confirmation dialog before actions that cannot be undone"; reserve them "for the most dangerous and rare actions," because overuse "loses its power to make the user think through the consequences"; and "do go to great lengths to provide undo, because some user errors will remain despite even the best of confirmation dialogs" |
| **Platform HIG** (Apple) | avoid alerts for common, undoable destructive actions (deleting a mail or a file — the user can undo); reserve the alert for uncommon, non-undoable ones |
| **Unix minimalism** (Gancarz) | from inside a chapter devoted to *avoiding* captive interfaces: "Most [Unix commands] only prompt the user when they are about to take some potentially irreversible action such as 'repairing' a file system by deleting files" — and he explicitly endorses a GUI confirmation for a `FORMAT`-class command, "to get users to slow down and think about what they're doing" |

Norman states the same design principle as a single instruction: "Make it possible to reverse
actions — to 'undo' them — or make it harder to do what cannot be reversed," with **multiple
levels** of undo/redo, not one. Shneiderman's golden rules carry it twice: "permit easy reversal of
actions" and "support internal locus of control." His 1983 direct-manipulation properties make
reversibility constitutive rather than optional — continuous representation of the object of
interest, physical actions rather than complex syntax, and **rapid, incremental, reversible
operations whose effect is immediately visible**.

**Three boundaries on the procedure.**

- **Cost of undo is a slider, not a boolean.** An action technically undoable only via a support
  ticket and three days is, for gate purposes, irreversible.
- **"You cannot undo burnt toast."** For physical-world or already-transmitted effects (an email
  sent, a payment captured, a message posted), the lever shifts from reversibility to constraint —
  make it harder to trigger — or to a delay window, which is undo in disguise and usually the
  better answer.
- **The stop is a hazard too.** "A gate is always safer" has a documented counter-pattern:
  fail-operate versus fail-safe, in exactly the safety-critical domain most associated with
  mandatory interlocks. Evaluate the interlock's own failure mode before adding it.

Cooper's framing is the useful bias for everything below the gate: "Interactive products should
stand by their convictions… It shouldn't second-guess us or itself" — **"Do, don't ask."** And his
*excise* concept names the audit: classify every step as goal-directed or excise (work serving the
tool or the organization rather than the user's goal), then hunt the excise.

## 2. Undo architectures and what each costs

Pick deliberately; retrofitting is the expensive path.

| Mechanism | Take it when | Cost / failure mode |
|---|---|---|
| **Command** (GoF: "Encapsulate a request as an object, thereby letting you parameterize clients with different requests, queue or log requests, and support undoable operations") | the operation vocabulary is small and fixed; state is large | every undoable action needs a matching inverse **designed up front**; actions with no natural inverse (send email) do not fit and need a delay window instead |
| **Memento / snapshot** | state is small and cheap to copy; operations are numerous or dynamic (a generic property editor) | memory and diff cost grows with document size |
| **Per-property last-writer-wins on a central server** | structured-object apps where fields are independently owned — design tools, boards, spreadsheets | the pragmatic default. Figma chose it and called OT "unnecessarily complex," citing a "combinatorial explosion of possible states" |
| **Operational Transformation** | linear text with a central server and a strong reason | the founding 1989 algorithm is known to violate the convergence/causality properties (TP1/TP2) formalized later. Pick a specific, verified transformation function — "OT" is not one algorithm |
| **CRDT** | genuinely decentralized, no authoritative server | verify your merge is actually commutative + associative + idempotent (state-based: a join over a semilattice), or that op delivery is genuinely duplicate-free and causal. You get strong eventual consistency, not consistency for free |

**Multiplayer undo is not a solved problem.** Yu & Ignat (DAIS 2015): "even after over two decades
of active research and development, support of undo for real-time collaborative editing is still
very limited." Do not promise "undo any past edit, including a collaborator's" without budgeting
research time. Ship "undo my last N actions" and say so.

Two design rules that fall out:

- **Decide explicitly whether undo is per-client or globally ordered.** Figma's undo is a local
  operation replayed as a *new* edit — cheap, and it avoids fights over whose undo wins. Their
  stated invariant is worth copying verbatim as a test: *if you undo a lot, copy something, and redo
  back to the present, the document should not change.* (Undo modifies redo history; a deleted
  object's properties must be retained client-side to make redo faithful.)
- **In a CRDT-backed app, undo is "append a compensating change to MY history," never "delete the
  change from shared history."** The latter breaks convergence for every peer that already merged
  it.

## 3. Autosave — killing the save mode without killing the work

Removing the save mode is a U1 win and an availability risk. What has to be true:

- **Two-phase commit against local disk, not fire-and-forget.** (1) write the pending change to
  local disk, (2) send to the server, (3) clear the local pending record **only on explicit server
  acknowledgement**. Clearing on send is the bug. Figma's stated correctness invariant: "node
  changes stored on disk are exactly equal to the pending node changes stored in memory."
- **Replay on reconnect must be ordered and versioned**, and must diff against the *current* server
  state before reapplying. A stale queued change overwriting a newer value is, in Figma's own
  words, "even worse than redundant changes."
- **Autosave breaks the abandon case.** "I want to throw away everything I did in this session" was
  free under explicit save and is not free under autosave. Design the replacement — named versions,
  revert-to-checkpoint, or a branch — before shipping autosave, not after the first complaint.

## 4. Optimistic UI

Optimistic update is **latency-hiding, not latency-eliminating**. The rollback path is where the
hidden latency reappears, and it is the path that gets shipped untested.

Two checks before applying it to an action:

1. Is there a real, always-available rollback if the server rejects it?
2. **Does the momentarily-wrong optimistic value get READ by the user to make a further decision
   before confirmation lands?** If yes, do not go optimistic — you are inviting a decision made on
   a value that may be retracted.

## 5. Latency budgets — the numbers feedback has to hit

Nielsen's response-time limits (tracing to Miller 1968 and Card et al. 1991), used as engineering
budgets rather than adjectives:

| Window | Perceived as | What to ship |
|---|---|---|
| **< 0.1 s** | instantaneous — direct manipulation feels real | **no loading indicator**; one would be more distracting than the delay |
| **0.1 – 1 s** | noticeable, flow unbroken | at most a lightweight cue (cursor or button state); not a spinner |
| **1 – 10 s** | attention held with effort | a visible but unintrusive indicator; determinate if you can |
| **> 10 s** | attention lost; the user leaves | give a percent-done estimate and make the operation abandonable — and treat it as a candidate for delegation (U3), not a thing to watch |

The RAIL budgets are the implementation-side counterpart: input handlers under a 50 ms JS ceiling
to hit a 100 ms response, animation work under ~10 ms per frame, idle work chunked to ≤50 ms slices
and preempted by input. Budget per bucket, not against a single global "make it fast."

## 6. Local-first — reversibility and availability as one architecture

Kleppmann et al., *Local-first software* (Ink & Switch, 2019). The seven ideals, as the paper's own
§2.1–2.7 headings: **No Spinners: Your Work at Your Fingertips** · **Your Work Is Not Trapped on One
Device** · **The Network Is Optional** · **Seamless Collaboration with Your Colleagues** · **The
Long Now** · **Security and Privacy by Default** · **You Retain Ultimate Ownership and Control**.

Use them as the paper does — a **scorecard**, marking each ✓ / partial / ✗, not a binary label.
The paper's own finding is that **no** surveyed technology achieves all seven, so the design act is
naming which ideal you are sacrificing. (Read the paper's Table 1 carefully: it distinguishes
"partially meets" from "does not meet," and summaries that collapse the two misreport it — Google
Docs fails Privacy outright but is *partial*, not failing, on Fast and Offline.)

Scope boundary the authors state themselves: the ideals target personal and creative productivity
software — documents, design files, notes. Banking, e-commerce, social networking and ride-sharing
are excluded as "well served by centralized systems." Do not carry the scorecard into those.

## 7. When a wizard is the right answer

A wizard is a deliberate, forced sequence — a mode by construction — so it belongs here rather than
in the mode gate. NN/g's condition: use one "for novice users or infrequent processes (e.g.,
configuration or setup)," where the rigidity means it "can be faster to just power through…
instead of having to ponder which steps are needed, and users are often happy to delegate the
decision of step order to the computer." Use a regular form instead for repetitive tasks,
domain-expert users, or tasks needing cross-step comparison.

**Evaluate frequency per user role, not per task category.** A process that is rare for the
organization may be run fifty times a week by one specialist, for whom the wizard is pure excise.

Once chosen, NN/g's construction rules are checkable pre-ship: "Communicate a clear mental model of
the process by displaying a list or a diagram of the steps… Enforce a clear sequential order of the
steps. Do not allow users to pick [a] step before completing the steps preceding it… Allow users to
exit the wizard midway and save state… Wizard steps should be self-sufficient and not require
information available elsewhere in the app."

And validate the step order against users' own mental model before shipping. Eventbrite's
event-setup wizard is NN/g's named case of failure by mismatch: users' model of "setting up an
event" did not include the steps the wizard forced, and they dropped out. Cooper's harsher framing
is worth keeping in view — he describes wizards as often "grafted on to meet the marketing
department's perception" of ease rather than a user's actual need. Before defaulting to one, check
whether a single well-defaulted automatic action with edit-after would serve better.
