# Unix philosophy — source guide

## Read the principles as a connected design

The central question is how useful software survives changing needs.
Small, focused parts can be combined beyond their original use.
Interfaces and data representations make that composition possible.
Portability keeps the investment useful on another platform.
Reuse makes each developer's work reach further.
Prototypes turn uncertainty into concrete experience; selective growth keeps useful scope.

> 一方、小さなプログラムの開発者は、未来の予測など最初からあきらめている。
> 彼らの予測することは、明日作られるものは今日作っているものとは違うということでしかない。

The Japanese quotations in this package come from the supplied text.
The English chapter passages were inspected for their ideas and context.
Do not claim verification of a particular published translation or invent its page numbers.
The table below uses paraphrased labels, not a reproduction of the English tenet list.

## The nine major principles: complete coverage

| Gancarz tenet | Question it settles | Result in a design | English locus |
|---|---|---|---|
| 1. 小さく作る | Can each part remain understandable and independently useful? | Small components whose work and limits are visible. | [§2.1](https://flylib.com/books/en/2.506.1.15/1/) |
| 2. 一つの仕事に集中する | Does a new function belong in this tool? | Move general formatting, acquisition or unrelated work to suitable companions. | [§2.4](https://flylib.com/books/en/2.506.1.18/1/) |
| 3. 早く試作する | What needs a concrete trial rather than more specification? | A working artifact that tests the idea and elicits useful reactions. | [§3.2](https://flylib.com/books/en/2.506.1.20/1/) |
| 4. 移植可能な価値を優先する | Will this useful work survive a platform change? | Portable logic with isolated platform dependencies. | [§4.1](https://flylib.com/books/en/2.506.1.28/1/) |
| 5. データも移せる形で保持する | Can people and other tools inspect and carry the data? | Text-first interchange and visible intermediate values. | [§4.2](https://flylib.com/books/en/2.506.1.29/1/) |
| 6. 既存のソフトウェアを梃子にする | What can be borrowed, and what new value remains to be built? | Reuse plus a useful missing capability; interfaces others can reuse. | [§5.1](https://flylib.com/books/en/2.506.1.31/1/) |
| 7. 接続の記述で成果を増やす | Can existing programs do the work with thin glue? | A replayable composition and a short edit/test cycle. | [§5.2](https://flylib.com/books/en/2.506.1.32/1/) |
| 8. 独自の対話に閉じ込めない | Can the engine cooperate without waiting for a person? | Noninteractive computation beneath a dedicated human-facing layer. | [§6.1](https://flylib.com/books/en/2.506.1.34/1/) |
| 9. 入力の変換として設計する | What enters, how is it changed, and where can the result go? | An explicit data path usable by another component. | [§6.2](https://flylib.com/books/en/2.506.1.35/1/) |

The data-format and script-composition principles complete the supplied selection.
They are not replaced by a generic “compose things” slogan.

## Smallness is valuable because users can recombine it

> 小さなプログラムはわかりやすい
> 小さなプログラムは保守しやすい
> 小さなプログラムはシステムリソースに優しい
> 小さなプログラムは他のツールと組み合わせやすい

> 単独ではたいしたことができなくても、他の小さなプログラムと組み合わせて使うことで、
> プログラマは--最も銃なことに--ユーザーが自分で短時間のうちに、新しいアプリケーションを作ることが出来る。

The benefit extends beyond the original developer.
A user can assemble only the functions needed, replace one, and add another.
Gancarz's [§7.7](https://flylib.com/books/en/2.506.1.44/1/) compares components with an integrated
application that initially has the same capabilities: the difference appears when needs change.
This is the reason to examine recombination, rather than merely count lines or executables.

## Filters: the broad model and its concrete realization

> コンピュータは、データを一つの係止から別の形式に変換する。

In [§6.2](https://flylib.com/books/en/2.506.1.35/1/), the author includes real-world samples,
GUI events and error statuses as inputs.
A sensor is not an exception to his broad model; neither is a GUI.
A result may be a changed display, stored state or diagnostic.
A standard-stream filter narrows this general model into a convenient program-to-program contract.

The claim that computers cannot originate information belongs to the author's account of creativity.
Preserve its actual meaning before adapting it: inspect the source information and transformation.
That account is not a proof about all simulations or generative systems.

## Portability preserves accumulated work

> 成長したソフトウェアを新しいハードウェアにも移植できれば、そのソフトウェアの価値は上がる。
> 新しいアーキテクチャは頻繁に現れる。
> 移植性の高いソフトウェアは、すぐにその新しいアーキテクチャの長所を利用できる。

Code, data, learned usage and reusable tools are all investments.
The text-data principle adds inspection and ordinary-tool access to the code-portability principle.
The author's hardware-growth argument explains his priority in its historical context.
Present work still needs to meet the stated performance requirement; the source itself discusses
specialized workloads and measuring frequently executed routines.

## Leverage is borrowing, contributing and automating

> 既存のApplicationをゼロから設計し直すことは模倣であっても創造とは言わない。 むしろこれを避ける事で、新しい、わくわくするような設計世界への扉が開かれる。

[§5.1](https://flylib.com/books/en/2.506.1.31/1/) treats rejecting outside software because it is
outside as NIH. Reusing a working capability leaves time for genuinely new value.
The chapter also asks developers to make their own code available for others to build upon
and to automate settled manual tasks.
These are three directions of the same principle: borrow effort, let it travel, and replay it.

[§5.2](https://flylib.com/books/en/2.506.1.32/1/) recommends script composition for its reuse
and rapid feedback. It expressly allows a compiled implementation when the runtime difference matters.
Source-line counts behind a small script illustrate borrowed implementation; they are not a
measured multiplier of productivity.

## Captivity, usability and human judgment

> モジュールの数が増えれば増えるほど、取り扱いも煩雑になる。
> そこにソフトウェア設計者にとってのジレンマがある。アプリケーションに最大の柔軟性を求めて、数多くの小モジュールから構築する。
> しかし、一方では、ソフトウェアを使いやすいものにするという要件も無視できない。

> コンピューターが人間の限界に制約され、システムがユーザー入力を待つ必要があると、
> キーボードの前に座る人間と同じ早さでしか動作できない。つまり、全く早くないということだ。

The resolution is layered interaction: tools cooperate beneath a convenient front end.
The author's [§6.1](https://flylib.com/books/en/2.506.1.34/1/) discusses not only throughput,
composition and scale, but the self-reinforcing tendency to absorb features when cooperation is hard.
It also accepts a GUI for a destructive operation and a separate human interface above components.
Calling the whole argument “all modality is bad” loses both the problem and the resolution.

## Three systems: preserve discovery, select features, find balance

> 第一のシステムは、一人もしくは少人数が、時間に追われる中で創造性を発揮し、勢い良く作ったシステムだ。
> 時間追われたために、足りない機能もあるが無駄はなく効率的に動く。

The [first system](https://flylib.com/books/en/2.506.1.22/1/) shows that the idea can work.
It has a concentrated purpose and exposes possibilities that excite other people.
Its missing features are information for the next iteration, not proof that its idea was worthless.

> 第二のシステムは第一のシステムに目をつけた多くの参加者からなる委員会が機能を決定する。
> その結果として、多くの人の意見(独自技術症候群を持った意見も含む)を取り込みすぎるため、機能は多いが、無駄のある遅いシステムができあがる。

The [second system](https://flylib.com/books/en/2.506.1.23/1/) discovers useful features as well as
excess. Gancarz acknowledges worthwhile expert work and design clarification.
Its lesson is to distinguish these from additions made for prestige or imagined completeness.

> Systemの目的はしっかり把握され、使用する技術もすでに証明済みであるため、リスクは小さい。意思決定の段階で、正格な予算を組み、正確なスケジュールを建てることができる。
> 第三のシステムの設計者には、ようやく「正しく」やることが出来る時間が与えられる。

The [third system](https://flylib.com/books/en/2.506.1.24/1/) retains the original concept,
the features that experience showed to be necessary, and the experts' useful improvements.
Its value is a balance among capability, performance and resource demand.
The statement about accurate budgets and schedules is the author's expectation once work is
understood, not a guaranteed forecast for any mature project.

> 1 短い機能仕様書を書く(3〜4枚程度)
> 2 ソフトウェアを書く
> 3 テストして書き直す。満足できるまで、これを繰り返す。
> 4 詳細なドキュメントを(必要なら)書く

[§3.8](https://flylib.com/books/en/2.506.1.26/1/) gives this order to shorten the passage through
the first two systems. It explicitly retains adequate goal-setting for large work.
The practical lesson is to acquire the needed experience quickly and consolidate it,
not to maximize discarded implementations.

## The ten lesser principles: distinct roles

These supplement the nine major principles.
The author introduces them as unevenly shared cultural preferences in
[§1.4](https://flylib.com/books/en/2.506.1.13/1/); do not give them all the same force.

| Lesser principle, paraphrased | Distinct contribution | How to use it |
|---|---|---|
| 利用者が環境を調整できる | Agency over policy and presentation. | Expose mechanisms and allow useful local choices. |
| Kernelを軽く保つ | A limited central responsibility. | Keep optional functionality outside the irreducible core where practical. |
| 短い小文字の名前 | Historical conventions and typing economy. | Follow established names; preserve intelligibility for the reader. |
| 紙に依存せず情報を扱う | Electronic access and transformation. | Keep information searchable and usable by tools. |
| 不要な出力を控える | A quiet compositional interface. | Keep routine chatter out of the data path; report failure and meaningful waits. |
| 並行に考える | Independent work can proceed together. | Establish dependencies and resource bounds before execution. |
| 組合せで用途を増やす | Novel applications from existing capabilities. | Evaluate new combinations and replaceable parts. |
| よく使う範囲に集中する | Scope versus expensive rare requirements. | State useful supported scope and deliberate omissions. |
| 普及できる簡素さを重視する | Availability and reach under practical constraints. | Prefer an accessible effective implementation over exclusive perfection. |
| 階層で整理する | Names and containment make complexity navigable. | Organize coherent levels without conflating hierarchy with composition. |

For the scope principle, [§7.8](https://flylib.com/books/en/2.506.1.45/1/) explicitly excludes
work such as heart transplants where the missing cases are unacceptable.
Do not invent a satisfaction measurement or interpret the principle as ten-percent error tolerance.

## Historical grounding and interpretation

The [Bell Labs interview](https://www.nokia.com/bell-labs/unix-history/philosophy.html) connects
single-purpose programs with cooperation through streams.
McIlroy's [Research UNIX Reader](https://mcilroy.cs.dartmouth.edu/reader.pdf), PDF pp.5–6,
§1.3 and §2, gives concrete development history: pipes and grep helped establish stream
transformation; real use also changed cp/mv and expanded sort.
This reconciles principle with practice: useful behavior and interoperability guide evolution;
a fixed count of flags is not the philosophy.

Gancarz's chapter text was read through a third-party reproduction.
The [publisher preview](https://api.pageplace.de/preview/DT0400.9780080510347_A23526296/preview-9780080510347_A23526296.pdf)
provides reliable edition and contents metadata; the reproduction's footer metadata is inconsistent.
The content is the author's primary text, but the host is not the publisher and textual fidelity
has not been certified against a complete publisher copy.
The survey separates that limit from the completed reading of relevant passages.

The scope is Gancarz's connected account and McIlroy's tool history.
It is not an exhaustive account of every Unix thinker.
An inaccessible shell screenshot cannot establish a bash-versus-zsh verdict;
compare the actual interfaces, interoperability and user control instead.
