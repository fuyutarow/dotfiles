---
name: practicing-unix-philosophy
description: >-
  Applies Unix philosophy / UNIX哲学 to software design and review: small single-purpose tools,
  filters and portable data, reuse and script composition, noncaptive interfaces, early prototypes,
  the three systems and the 90-percent solution. Use for an explicit Unix-philosophy review or
  when choosing how to build an adaptable tool from reusable parts. CLI contracts and structural
  edits stay with their domain owners. English skill; respond in the user's language.
---

# Practicing Unix philosophy

Apply Gancarz's nine major principles and ten lesser principles to software design and review.
Keep each principle visible with the practical decision it informs.
Their connected purpose is useful software that stays flexible as needs change.

> その本質は柔軟でありつづけることだ。

For design, start with the user's outcome and show a small composition that achieves it.
For review, locate the requirement that is trapped in presentation, duplicated,
needlessly specialized, or delayed by speculative completeness.
Use the principles below to choose the smallest change that restores usefulness and adaptability.

## Nine major principles

### 1. Small is beautiful

Keep components understandable and independently useful as needs change.
Examine understanding, maintenance, resource use and recombination when choosing their size.
Use these as properties to examine, not a line-count or screen-size target.

### 2. Make each program do one thing well

> 小さなプログラムは、目的を絞らなければならない。言い換えると、一つのことを上手くこなすことに専念すべきだ。
> 一つのプログラムでひとつの問題を解決することをモットーにしてほしい。

State what the tool does, what enters it and what leaves it.
When adding a feature, ask whether it belongs to that job or can be obtained from another tool.
In particular, separate acquiring data, transforming it, and presenting it when each can be useful
elsewhere. A user should be able to take a needed part without taking every other part.

A coherent command may have several options. Split where independent reuse or change becomes easier,
and keep together work whose invariant or transaction must remain indivisible.

### 3. Build a prototype as soon as possible

> 試作を作ってみれば、何がうまくいくか、そしてより重要なことに、何がうまくいかないかがわかる。

A prototype is the concrete vehicle for discovering the design.
Write enough specification to state the goal and present uncertainty, then produce a working path.
Use reactions to that path to choose the next change.
Keep cycles short while changes are still cheap.

#### Carry the idea through three systems

| Stage in Gancarz's account | What it contributes | What to carry into the next iteration |
|---|---|---|
| First: an individual or small group works under constraints | A lean, working concept that exposes a new possibility; some needed functions are absent. | Preserve the concept and learn which omissions matter in use. |
| Second: the proven concept attracts contributors and requirements | Necessary features and useful expertise, together with unused features and excess cost. | Separate demonstrated needs from accumulated wishes; retain useful improvements. |
| Third: experience makes the purpose and mechanisms understood | The original idea with genuinely needed features, balanced resource use and performance. | Consolidate what worked; remove burdens without losing needed capabilities. |

> 第三のシステムだけが、第一のシステムが発見したアイディアと第二のシステムの中で見つかった必要な機能をバランスよく取り入れて、やっと役に立つシステムを構築することができる。

Pursue that balance through the author's sequence:
short functional specification → implementation → repeated test/rewrite → detailed documentation when needed.
His third system is a learning goal, not just a warning about bloat.
The source argues that the first two stages supply necessary experience.
Applying that insight means compressing the learning cycles, not deliberately commissioning three
products, inventing pressure, or treating the three-stage account as a measured universal law.

### 4. Choose portability over efficiency

> そこで、試作では効率より移植性を優先させる。

Prefer interfaces and representations that preserve useful work across platforms.
Keep platform-specific code behind a narrow adapter.
If current performance meets the need, spend the next effort on usefulness and feedback.
If it does not, measure the bottleneck before specializing.

### 5. Store data in flat text files

Portable code with trapped data is only half portable.
Prefer documented, inspectable text at interchange and debugging boundaries.
Specify encoding, record framing, fields and numerical precision; text does not mean an ad-hoc format.
When binary storage or device-specific computation is necessary, preserve a usable inspection or
export path. This is a present-day adaptation of the author's stronger text-first preference.

### 6. Use software leverage to your advantage

> 他人のソフトウェアをレバレッジにしなさい．

> ソフトウェアを自作するなら，自分の目的に照らして大きなレバレッジを得られるところに絞って開発しなさい

Inspect available tools and modules before implementing a familiar capability.
Compare reuse, a thin adapter, composition and new implementation against the actual need.
Avoid rejecting an adequate tool merely because someone else wrote it.
Write the missing value; let existing software do the work it already does well.

The leverage goes both ways: give others a usable interface to your component.
Keep reusable mechanics independent of one workflow's policy or one screen's presentation.
Turn repeated, settled manual work into a replayable operation within the user's authorization.

### 7. Use shell scripts to increase leverage and portability

Prefer a thin composition over reimplementing all stages.
Gancarz recommends shell scripts because they connect already-debugged programs and shorten the
edit/test loop. Preserve that reason while following the repository's declared scripting language.
Choose a compiled or in-process implementation when measured execution cost makes the script unsuitable.

### 8. Avoid captive user interfaces

> しかし、ユーザーとモジュールとを大量の「スパゲッティ」コードで結びつけるのではなく、その溝を少しずつ小さな塊または層にして減らしていこうとする。

Make routine computation callable with all necessary parameters and without a live dialogue.
A human-facing interface can make the same engine convenient without owning all its capabilities.
Ask whether another program, a batch of records, or a different front end can perform the same work.

Captivity blocks composition, limits work to human response speed, obstructs scaling, and encourages
the application to absorb every missing function.
Gancarz also permits a dedicated human interface and confirmation for destructive operations.
Interactivity is useful when human judgment is part of the work; preserve its reusable engine where applicable.

### 9. Make every program a filter

> すべてのプログラムは、何らかの形式のデータを入力として受け入れ、何らかの形式のデータを出力として生成する。

Name input → selection/transformation → output before designing the surrounding interface.
Expose parameters and results so another program can supply or consume them.
Keep information content separate from the particular way it is displayed.

Gancarz's broad filter model includes sensor readings, GUI events and error statuses.
A stdin/stdout pipeline is one concrete implementation of that model.
For a generator, include its seed, model, parameters and external information.
For a stateful operation, include the prior state and the resulting state or effects.
Identify provenance and transformation instead of hiding inputs behind “the application creates it.”

## Ten lesser principles

These supplement the nine major principles and retain their separate numbering.
Use the relevant item when its decision arises; they are not ten equally binding rules for every task.
The actions below are operating adaptations. Read the
[source guide's lesser-principle table](references/unix-philosophy.md#the-ten-lesser-principles-distinct-roles)
for the source's meaning and differing emphasis.

### 1. Allow the user to tailor the environment

When users need different workflows, defaults or presentation, identify the useful variation.
Expose it through parameters, documented configuration or a replaceable front end.
Keep required invariants explicit while allowing local choices of policy and presentation.
Check that the same engine serves a second legitimate configuration without editing its computation.

### 2. Make operating system kernels small and lightweight

When adding a kernel facility, identify the responsibility that requires the privileged core.
Keep optional services outside it when a usable interface permits this.
For application adaptation, identify the essential shared core and place optional integrations around it.
Compare boundary overhead and failure behavior before extracting;
smallness alone does not justify a new process, service or plugin system.

### 3. Use lowercase and keep it short

For commands and names people repeatedly type, prefer established lowercase names that are concise
and still distinguish their purpose. Choose abbreviations the intended reader can recognize.
Follow language and ecosystem conventions, and preserve an existing public naming contract.
Check help and examples for confusing names before shortening further.

### 4. Save trees

When information must be reviewed, searched or reused, keep a searchable electronic source.
Preserve the data behind a rendered report or figure.
Provide links and an inspectable export so another person or tool can retrieve and transform it.
Check that a needed fact can be located and reused without manual transcription.

### 5. Silence is golden

When a result will feed another program, keep routine chatter out of its data channel.
Report failures and meaningful waits through a separate diagnostic channel.
For a CLI, `designing-command-line-interfaces` owns stdout/stderr and outcomes.
Check redirected or piped output for clean payloads and keep failure distinguishable from empty success.

### 6. Think parallel

When work appears concurrent, identify independent tasks, dependencies and shared mutable state first.
Run independent work in parallel within explicit resource bounds.
Keep dependent steps and indivisible state changes in their required order.
Inspect every result and failure before combining outputs.
Actual agent dispatch, resource admission and acceptance belong to `orchestrating-agents`;
this principle supplies no additional authorization to delegate or allocate resources.

### 7. The sum of the parts is greater than the whole

When a new use case appears, first try recombining existing components.
Change the producer, consumer or arrangement before adding another built-in feature.
Expose the interface needed for that recombination and keep workflow policy with the caller.
Check one useful new combination with an independently replaceable consumer.
Reuse the existing producer or transformation without a rewrite, as in the composition example below.

### 8. Look for the 90-percent solution

> どんなことであれ、100％上手くやることは大変だ。90％のことだけを上手くやれるようにするほうが、はるかに能率的であり費用対効果も最も高い。

Identify the frequently useful work and the costly requirements that few users need.
Deliver a coherent capability for that scope; expose composition points for extensions.
Say which cases are supported, which are deferred and how a deferred need can be met.
The source cuts feature breadth; it does not prescribe randomly incorrect results.
Keep explicit required correctness and consequential recovery requirements.

> ソフトウェアに完成はない。ただリリースが有るだけだ

A release meets a stated need and gives the next round of learning somewhere to begin.

### 9. Worse is better

When architectural completeness delays adoption, compare a minimal usable implementation with the elaborate one.
Include installation, learning, deployment and maintenance burdens.
Prefer broad availability and low adoption cost while meeting required correctness, interoperability and recovery.
Defer refinements whose practical value is still speculative.
Check the intended user's complete path to a useful result.
Preserve required guarantees; known incorrect results do not become acceptable through this principle.
Item 8 selects scope; this item selects implementation and delivery trade-offs within that scope.

### 10. Think hierarchically

When names, configuration or responsibilities become hard to navigate, group them into coherent levels.
Give each level a parent responsibility and each item a clear home.
Keep dependencies and authority visible across levels, with one home for each value or rule.
Check where a new item belongs and whether a local change stays local.
A hierarchy organizes containment and responsibility; inspect the actual data flow separately.

## Check the composition and return the result

An independently constructed example, with newline-delimited names:

```sh
printf '%s\n' bob alice bob | LC_ALL=C sort | uniq -c
```

The source supplies records, sorting groups them, and counting summarizes them.
Replacing `uniq -c` with `uniq` serves a new consumer without rewriting the source or sorter.
For an implemented change, run the useful path and one relevant changed consumer or failed stage.
Inspect intermediate data and make a failed stage observable to the caller; an upstream failure
must not look like a successful empty result. In a shell pipeline, check stage statuses or use the
shell's pipefail option, accounting for deliberate early termination by a consumer.
For design-only work, state the proposed check without claiming execution.

Return the design or scoped change requested: its responsibilities, data path, reused capabilities,
prototype lesson and supported scope. Do not require a new reporting artifact for ordinary work.

## Boundaries and sources

Use this entry for an explicit Unix-philosophy request or an unsettled reusable-tool design.
Detailed CLI channels and outcomes belong to `designing-command-line-interfaces`;
interaction behavior to `designing-interactions`; implementation to `implementing-and-debugging`
and the language owner; behavior-preserving structural edits to `refactoring-code`.
Read [the source guide](references/unix-philosophy.md) when tracing a principle to its source,
interpreting the supplied quotations, or applying one of the ten lesser principles.
It maps all nine major principles and distinguishes the author's claims from present-day adaptations.
Japanese quotations are user-supplied; the published translation's exact wording remains unverified.
Verification and admission notes live in [the review record](tests/forge-verification-ledger.md).
