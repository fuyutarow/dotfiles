# Keeping research notebooks — fire / no-fire set (F3)

Desk-check with the **name and description only**, against every plausibly matching description.
Rerun after any description or cut edit.

## Fires

| Ask | Expected |
|---|---|
| 「この runner、scratchpad に置いたまま run していい？」 | FIRE: N1 HOME; runner → apparatus record; scratchpad denied. |
| "Where should this new kernel go — the edition file or the shared library?" | FIRE: N2 retrieve, then N1 and editions §5. |
| 「launcher の dry-run は ok:true なのに modelCode が null。走らせていい？」 | FIRE: N3; FAIL even at exit 0; registration incomplete. |
| 「新しい edition を書き直したら parity が 1.0 から 0.487 に落ちた」 | FIRE: N5 LINEAGE; revise, not rewrite; numbers are diagnostics. |
| "Two agents keep committing to the same checkout and the commits race" | FIRE: N4 single COMMITTER; agents hand back paths. |
| 「run dir を commit したら実行中のものまで入った」 | FIRE: N4; finished run dirs only; `--records`. |
| 「model を登録したのに最初の公式 run が落ちた。どこが漏れてる？」 | FIRE: N5 registration table, all registries counted. |
| "The conformance test passes but it puts a label at every position" | FIRE: N5 (a); fixture-only conformance is red. |
| 「これどこに置けばいい？ 一元的な入口は？」 (in a gated research repo) | FIRE: homes LOOKUP and Act → ENTRY. |

## Near-miss no-fire

| Ask | Route |
|---|---|
| 「polysearch record finding の --verdict が拒否された」 | `driving-polysearch` alone. |
| "jj rebase left conflicts; how do I resolve them?" | `driving-jujutsu` alone. |
| 「mise の commit タスクの中身を書いて」 | `wiring-mise-tasks`. |
| "Set up a new repo with jj, mise and hooks" | `wiring-repositories`. |
| 「この edition の 0.99 は漏れ？ 退行と書いていい？」 | `validating-experimental-evidence` (EV2, EV4). |
| "Which hypothesis should we run next?" | `driving-bibifi-cycles`. |
| 「Julia の module に public を足して export を消して」 | `writing-julia`. |
| "Commit my fix in this small personal repo" (no gate, no records store) | `driving-jujutsu` or `driving-git` alone. |
| 「研究文書の正本はどれ？ 古い報告を廃止したい」 | `governing-research-documentation`. |

## Co-fire

| Ask | Order |
|---|---|
| "Add a revision that fixes the kernel, then run the official benchmark" | `implementing-and-debugging` and the language skill for the fix; HERE for N5 bump and N3 launch; `driving-polysearch` for the records. |
| 「結果を finding に書いて commit して」 | `driving-polysearch` writes the record; HERE for N4 landing; `driving-jujutsu` only for a jj failure. |
| "Is this new revision a regression, and may we keep measuring it?" | HERE for the N5 LINEAGE row and measurability; `validating-experimental-evidence` for the claim. |
