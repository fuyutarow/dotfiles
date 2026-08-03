# Declassified search-and-learn incident evidence — 2026-08-04

STATUS: BOUNDED-DECLASSIFIED-EVIDENCE

This packet preserves the exact source hashes, bounded observations, and short excerpts used by
`../SEARCH-LEARN-THROUGHPUT-POSTMORTEM.md`. The four raw transcripts were supplied by the operator
as local Codex attachments and are not copied into this repository. Consequently:

- a repository clone can reproduce the admitted observations and inspect the excerpts below;
- a repository clone cannot independently recompute the raw transcript hashes;
- the reported durations, token counts, and run counts remain transcript admissions rather than an
  independently metered denominator; and
- this packet is not authority for any scientific claim about the ternary-sparse mechanism.

## E1 — recognition did not alter admission

- Raw source: local operator-supplied attachment
  `f53ffa73-651b-4b6a-9a6a-d3f158703fe5/pasted-text.txt`
- Raw SHA-256: `f419281d06d41d575acb2f5dc542ad7998cfdc1d0b48c944d2a7089264cbf387`
- Admitted source ranges: lines 139–147 and 148–205
- Bounded observation: three negative readings were reclassified as measurement-invalid or
  confounded. After the process named construction-before-search as the failure, it created a new
  392-line workflow, launched ten arms, and continued four GPU sweeps.

Declassified excerpts:

> 三つの「否定的結果」は、全部測定が成立していませんでした

> 10腕。調査2本を先に置いてから、四経路が構築し、それぞれ独立の反証者が壊しにかかります。

> 並行して掃引4本が GPU で走っています。

## E2 — the human remained the effective control loop

- Raw source: local operator-supplied attachment
  `0b98ef1e-fed6-4e74-897e-4e0f49f9955f/pasted-text.txt`
- Raw SHA-256: `51d8c7fb5aefcd23a91a6bf59ac01045b3c703138b949c6f0151c64f7dd01767`
- Admitted source ranges: lines 2–36 and 37–70
- Bounded observation: the operator restated the belief and critical issue; the agent then admitted
  six frame changes, repeated rediscovery, failure to read the frozen success criterion, and welding
  together different machines.

Declassified excerpts:

> 固定された基準を読まずに、自分で関門を立て続けました。

> 発射前に検索する規律が、まだ私の側にあります。

> 三つの機械を一日中ひとつとして扱っていました。

## E3 — resource utilization overrode scientific dependency

- Raw source: local operator-supplied attachment
  `4996ff2d-3354-4b7d-a29b-fb423a3dc4ac/pasted-text.txt`
- Raw SHA-256: `9be1220af7f5f987a9c4be189d6ae84cff9cc5e9342d930e3ce29a769c06f11b`
- Admitted source ranges: lines 2–55 and 56–140
- Bounded observation: A4 was explicitly identified as able to invalidate A1–A3, while A5/A6 were
  identified as axis changes. Work still fanned out; later, idle CPU/GPU/RAM motivated seven longer
  jobs including four GPU jobs and full multi-seed sweeps.

Declassified excerpts:

> A4 が最優先です

> これが現行族に該当するなら、A1〜A3 は全部無効です。

> GPU 0%、CPU 負荷 0.39/12コア、RAM 45 GiB 空き。

> いま走っているもの 七本。うち GPU が四本

## E4 — execution was called search; existence came after scale

- Raw source: local operator-supplied attachment
  `ed10a43b-68a7-490f-93cf-d1eccbb2b6e5/pasted-text.txt`
- Raw SHA-256: `b44ece664a34ea2dc7b251163e45f5fce5a7e272246db013dd906befe54de565`
- Admitted source ranges: lines 2–37 and 43–116
- Bounded observation: the agent admitted that fixed sweeps were called search, no machine changed
  its bet from accumulated evidence, the belief-claimed local-rule-only learner was never trained,
  and slope/GPU/component/capacity work preceded a one-point existence test. It reported roughly
  twelve hours and eight million tokens with zero goal-direct measurements; those totals are not
  independently metered here.

Declassified excerpts:

> sweep を search だと思っていました。

> この programme で、データを増やしたときに賭け先を変える機構が一台もありません。

> 今日一度も、局所則だけの機械を訓練していません。

> 一点なら CPU でも測れます。

> 十二時間、GPU をほぼ遊ばせ、約 800 万トークンを使い、狙いに対する測定をゼロ件で終えました。

## Admission statement

The postmortem may rely on E1–E4 only for the bounded process observations stated above. It may not
upgrade them into a complete run denominator, exact causal allocation, independent cost accounting,
or a scientific verdict. Any future stronger claim must admit durable primary evidence separately.
