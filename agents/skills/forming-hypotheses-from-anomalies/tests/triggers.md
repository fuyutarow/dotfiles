# Trigger set — fire / no-fire / co-fire (gate F3)

Desk-check protocol: read ONLY `name` + `description` (the model's stage-1 view) and answer
fire / no-fire / co-fire. Re-run after ANY description edit. A wrong answer is a description bug
or a badly designed query — decide which, in writing, before editing.

Last desk-checked: 2026-09-05 (reorganization). Result: **19/19**, run blind by an agent that read
only `name` + `description`. Four rows fired on SEMANTIC match with no lexical hook at all — F2, F4,
F6, and the anomaly half of C3. That is by design: those are the messy no-keyword rows. It is
recorded because a later description trim needs to know they have no token left to lose.

Previous desk-check, 2026-09-05 (forge). Result: **15/16 on the first pass — F5 failed.**
Cause: F5's query turns on 語彙, and the description carried only the English `vocabulary`.
Matching is lexical, so the row could not fire. Fixed by adding 語彙の外 to the description's
doublet list, inside that same forge. Re-checked: 16/16.

## The two forms of one failure (worked example — generalised 2026-09-05)

A skill fails to fire when it should in two ways. They look unrelated and are not:

| Form | Cause | Catchable by | Tell |
|---|---|---|---|
| **TAIL LOST** | the description exceeds the listing's truncation window, so its trailing clauses — typically the language directive — never reach the matcher | a script: length against the window is a number | description length > ~1520 chars |
| **TOKEN ABSENT** | a rule inside the skill keys on a token the description never carried, so no query containing it can match | a reader: only the desk-check compares rules against the trigger surface | a `Why` cell citing a token, and the description not carrying it |

**Both pass a green floor.** The skill is well-formed, its references resolve, its scripts run —
and it does not fire. That is why the desk-check is not optional after a description edit, and why
"we shortened three descriptions for budget" is not a safe operation on its own: shortening for
length is exactly the edit that can drop the token a rule keys on, converting TAIL LOST into
TOKEN ABSENT.

This skill's F5 above is a TOKEN ABSENT instance, caught at forge time. Its own description
measures 1,382 chars — 138 under the observed window — so it is not a TAIL LOST instance.

## Should FIRE (≥5; realistic-messy, ≥1 Japanese, ≥1 with no headline keyword)

| # | Query | Expected | Why |
|---|---|---|---|
| F1 | 「実験結果が既存モデルの予測と真逆になった。どう仮説を立てればいい?」 | FIRE | anomaly + no hypothesis; 仮説 doublet present |
| F2 | "our retry rate spiked on one shard only. every metric we track looks identical across shards." | FIRE | contrast implicit, closed route already smells exhausted; no headline keyword |
| F3 | 「創造的なアブダクションをやりたい。既存の枠の中の変種じゃなくて」 | FIRE | アブダクション doublet + explicit request to leave the frame |
| F4 | "we've proposed the same three causes four times and none of them survive the data" | FIRE | A3 is exactly this state |
| F5 | 「この現象、いまの語彙だと言葉にできないんだよね」 | FIRE | new-predicate introduction is on the table; 語彙の外 is in the description — added BY this desk-check, see header |
| F6 | "Q4 sales final FINAL v2.xlsx — the north region beat forecast by 40% and nothing in the model says why" | FIRE | messy real filename, anomaly against an explicit account |
| F7 | 「なんでこれ説明つかないんだろう。仮説が欲しい」 | FIRE | the plainest form of the core ask; 説明がつかない and 仮説 are both in the description |

## Should NOT fire (≥5 near-miss; each names the sibling that fires instead)

| # | Query | Expected | Fires instead |
|---|---|---|---|
| N1 | "TypeError on line 42, undefined is not a function — fix it" | NO-FIRE | `implementing-and-debugging`; the account predicts this |
| N2 | 「この計画、どんな前提を置いてる? 洗い出したい」 | NO-FIRE | `surfacing-blind-spots`; artifact audit, no anomaly |
| N3 | "here's the frozen donor set and the selected frame — give me 5 candidates" | NO-FIRE | `forging-novel-theses`; frame + seed already in hand |
| N4 | 「この数字、そもそも合ってる?」 | NO-FIRE | `raising-resolution`; establishing the fact, not explaining it |
| N5 | "we picked hypothesis 3. it's a two-month build. commit or not?" | NO-FIRE | `acting-on-hypotheses`; one selected costly tree |
| N6 | "what does the literature say about retrieval-augmented generation?" | NO-FIRE | `systematizing-knowledge`; corpus, not anomaly |
| N7 | 「アブダクションって何?」 | NO-FIRE | a definition question about the subject — answer directly, no skill ceremony |
| N8 | "the deploy failed. haven't looked at logs yet." | NO-FIRE | `implementing-and-debugging`; "haven't looked" is not an account (boundaries.md, deferral risk 2) |
| N9 | "retry rate spiked on one shard only; we've already fixed the frame as scheduler affinity and frozen a donor set of three similar writeups. give us an explanation." | NO-FIRE | `forging-novel-theses` — BOTH entry conditions hold at once, and the cut is checked in order: precondition first (boundaries.md, deferral risk 3) |

N7 and N8 are the two most dangerous near-misses: N7 shares every keyword and needs none of the
machinery; N8 reads like an anomaly and is not one — nothing predicted the opposite outcome.
N9 is the third, and the only one a keyword cannot settle: it IS an anomaly, and it fires the other
skill anyway because the precondition test comes first. It was missing until the 2026-09-05
adversarial pass built it (ledger §8).

## CO-FIRE (order matters)

| # | Query | Order |
|---|---|---|
| C1 | "the benchmark says 3x but I'm not sure the harness is measuring the right thing — and if it IS 3x we have no explanation" | `raising-resolution` FIRST (is the fact real), THEN here |
| C2 | 「文献をまとめた上で、そこに説明できない観測がある」 | `systematizing-knowledge` FIRST (signed position), THEN here — the position becomes the `Supplied:` row |
| C3 | "this plan assumes X; also the pilot data contradicts X" | `surfacing-blind-spots` for the premise audit, THEN here for the anomaly; the Blind-spot packet may supply `Supplied:`, never `Contrast:` |
| C4 | "give me one explanation now, and a batch of candidates after" | here FIRST (one `HYPOTHESIS` packet), THEN `forging-novel-theses` — one-way handoff. No frame or `DONOR SET` is stated, so the precondition test does not divert it |
