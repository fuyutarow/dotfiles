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

Design useful software that can grow with needs you cannot predict.
Use Gancarz's principles as a connected approach: small responsibilities make composition possible;
portable interfaces and data keep the parts useful; reuse multiplies effort; early prototypes reveal
what to keep; user feedback turns a promising idea into a balanced system.

> その本質は柔軟でありつづけることだ。

The Japanese quotations are the user's supplied passages. Their ideas were compared with the
English chapter text; the published Japanese translation's exact wording remains unverified.
Read [the source guide](references/unix-philosophy.md) for the nine major principles, ten lesser
principles, source locators, and fuller explanations.
The canonical survey is `urn:uuid:01a12617-62e2-7590-a783-533a10598156`.
The directions here are operating adaptations of that survey.

## 1. Start small; give each part one clear job

> 小さなプログラムは、目的を絞らなければならない。言い換えると、一つのことを上手くこなすことに専念すべきだ。
> 一つのプログラムでひとつの問題を解決することをモットーにしてほしい。

State what the tool does, what enters it and what leaves it.
When adding a feature, ask whether it belongs to that job or can be obtained from another tool.
In particular, separate acquiring data, transforming it, and presenting it when each can be useful
elsewhere. A user should be able to take a needed part without taking every other part.

Gancarz connects smallness to understanding, maintenance, resource use and recombination.
Use these as properties to examine, not a line-count target.
A coherent command may have several options. Split where independent reuse or change becomes easier,
and keep together work whose invariant or transaction must remain indivisible.

## 2. Design the data path as a filter

> すべてのプログラムは、何らかの形式のデータを入力として受け入れ、何らかの形式のデータを出力として生成する。

Name input → selection/transformation → output before designing the surrounding interface.
Expose parameters and results so another program can supply or consume them.
Keep information content separate from the particular way it is displayed.

Gancarz's broad filter model includes sensor readings, GUI events and error statuses.
A stdin/stdout pipeline is one concrete implementation of that model.
For a generator, include its seed, model, parameters and external information.
For a stateful operation, include the prior state and the resulting state or effects.

> プログラムはデータを作らない。人間がつくる

Preserve the source's point about where information enters the system.
The author's claim about creative information is stronger than a type signature:
do not present it as a proved impossibility of computational generation.
Identify provenance and transformation instead of hiding inputs behind “the application creates it.”

## 3. Make code and data travel together

> そこで、試作では効率より移植性を優先させる。

Prefer interfaces and representations that preserve useful work across platforms.
Keep platform-specific code behind a narrow adapter.
If current performance meets the need, spend the next effort on usefulness and feedback.
If it does not, measure the bottleneck before specializing.

Portable code with trapped data is only half portable.
Prefer documented, inspectable text at interchange and debugging boundaries.
Specify encoding, record framing, fields and numerical precision; text does not mean an ad-hoc format.
When binary storage or device-specific computation is necessary, preserve a usable inspection or
export path. This is a present-day adaptation of the author's stronger text-first preference.

## 4. Use existing software, and make your work reusable

> 他人のソフトウェアをレバレッジにしなさい．

> ソフトウェアを自作するなら，自分の目的に照らして大きなレバレッジを得られるところに絞って開発しなさい

Inspect available tools and modules before implementing a familiar capability.
Compare reuse, a thin adapter, composition and new implementation against the actual need.
Avoid rejecting an adequate tool merely because someone else wrote it.
Write the missing value; let existing software do the work it already does well.

The leverage goes both ways: give others a usable interface to your component.
Keep reusable mechanics independent of one workflow's policy or one screen's presentation.
Turn repeated, settled manual work into a replayable operation within the user's authorization.

Prefer a thin composition over reimplementing all stages.
Gancarz recommends shell scripts because they connect already-debugged programs and shorten the
edit/test loop. Preserve that reason while following the repository's declared scripting language.
Choose a compiled or in-process implementation when measured execution cost makes the script unsuitable.

## 5. Let the human interface be a layer

> しかし、ユーザーとモジュールとを大量の「スパゲッティ」コードで結びつけるのではなく、その溝を少しずつ小さな塊または層にして減らしていこうとする。

Make routine computation callable with all necessary parameters and without a live dialogue.
A human-facing interface can make the same engine convenient without owning all its capabilities.
Ask whether another program, a batch of records, or a different front end can perform the same work.

Captivity blocks composition, limits work to human response speed, obstructs scaling, and encourages
the application to absorb every missing function.
The supplied heading “心地よいモーダルを追求する” should therefore be read as avoiding captive interfaces.
Gancarz also permits a dedicated human interface and confirmation for destructive operations.
Interactivity is useful when human judgment is part of the work; preserve its reusable engine where applicable.

## 6. Prototype to learn; carry the idea through three systems

> 試作を作ってみれば、何がうまくいくか、そしてより重要なことに、何がうまくいかないかがわかる。

A prototype is the concrete vehicle for discovering the design.
Write enough specification to state the goal and present uncertainty, then produce a working path.
Use reactions to that path to choose the next change.
Keep cycles short while changes are still cheap.

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

## 7. Deliver the useful common case

> どんなことであれ、100％上手くやることは大変だ。90％のことだけを上手くやれるようにするほうが、はるかに能率的であり費用対効果も最も高い。

Identify the frequently useful work and the costly requirements that few users need.
Deliver a coherent capability for that scope; expose composition points for extensions.
Say which cases are supported, which are deferred and how a deferred need can be met.
The source cuts feature breadth; it does not prescribe randomly incorrect results.
Keep explicit required correctness and consequential recovery requirements.

> ソフトウェアに完成はない。ただリリースが有るだけだ

A release meets a stated need and gives the next round of learning somewhere to begin.

## Apply and check

For design, start with the user's outcome and show a small composition that achieves it.
For review, identify where a concrete requirement is trapped in presentation, duplicated,
needlessly specialized, or delayed by speculative completeness.
Recommend the smallest change that restores usefulness and adaptability.

An independently constructed example, with newline-delimited names:

```sh
printf '%s\n' bob alice bob | LC_ALL=C sort | uniq -c
```

The source supplies records, sorting groups them, and counting summarizes them.
Replacing `uniq -c` with `uniq` serves a new consumer without rewriting the source or sorter.
For an implemented change, run the useful path and one relevant changed consumer or failed stage.
Inspect intermediate data. For design-only work, state the proposed check without claiming execution.

Return the design or scoped change requested: its responsibilities, data path, reused capabilities,
prototype lesson and supported scope. Do not require a new reporting artifact for ordinary work.
Consult the lesser principles in the source guide when they affect the decision.

Use this entry for an explicit Unix-philosophy request or an unsettled reusable-tool design.
Detailed CLI channels and outcomes belong to `designing-command-line-interfaces`;
interaction behavior to `designing-interactions`; implementation to `implementing-and-debugging`
and the language owner; behavior-preserving structural edits to `refactoring-code`.
Verification and admission notes live in [the review record](tests/forge-verification-ledger.md).
