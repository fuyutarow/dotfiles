# Keeping research notebooks — fire / no-fire set (F3)

Desk-check with the **name and description only**, against every plausibly matching description.
Rerun after any description or cut edit.

## Fires

| Ask | Expected |
|---|---|
| 「この runner、scratchpad に置いたまま run していい？」 | FIRE: N1 HOME; runner → apparatus record; scratchpad denied. |
| "Where should this new kernel go — the edition file or the shared library?" | FIRE: N2 retrieve, then N1 and editions §5. |
| 「launcher の dry-run は成功したのに model の解決結果が null。走らせていい？」 | FIRE: N3; FAIL even at exit 0; registration incomplete. |
| 「新しい edition を書き直したら、前の版が解けていた member が大きく劣後した」 | FIRE: N5 predecessor row; revise, not rewrite; numbers are diagnostics. CO-FIRE `validating-experimental-evidence` for any regression claim. |
| "Two agents keep committing to the same shared checkout of our notebook and the commits race" | FIRE: N4 single COMMITTER; agents hand back paths. `driving-git` S1–S8 only for a git-only repo. |
| 「run dir を commit したら実行中のものまで入った」 | FIRE: N4; finished run dirs only; `--records`. |
| 「model を登録したのに最初の公式 run が落ちた。どこが登録漏れ？」 | FIRE: N5 registration table, all registries counted. `writing-julia` co-fires only for package mechanics. |
| "The conformance rows pass on a fixture, but the official run uses another label layout" | FIRE: N5 (a); fixture-only conformance is red. CO-FIRE `validating-experimental-evidence` (EV0, EV2) for what the row must assert. |
| 「これどこに置けばいい？ 一元的な入口は？」 (in a gated research repo) | FIRE: homes LOOKUP and Act → ENTRY. |
| 「複数 project が同居して論文まで書く。ディレクトリ構成はどうあるべき？」 | FIRE: homes §0; packages under `packages/`, papers under `deliverables/papers/`, nothing package-shaped at the root. |
| "Our notebook repo has Project.toml, src/ and test/ at the root — is that right?" | FIRE: homes §0 predicate; move the package under `packages/`. CO-FIRE `writing-julia` PK0 for the workspace root. |
| 「論文の図は手元で作った PNG を papers に置いていい？」 | FIRE: homes §1 paper-figure row; the figure comes from a run artifact cited by run id. |

## Near-miss no-fire

| Ask | Route |
|---|---|
| 「polysearch record finding の --verdict が拒否された」 | `driving-polysearch` alone. |
| "jj rebase left conflicts; how do I resolve them?" | `driving-jujutsu` alone. |
| 「mise の commit タスクの中身を書いて」 | `wiring-mise-tasks`. |
| "Set up a new repo with jj, mise and hooks" | `wiring-repositories`. |
| 「この edition の高いスコアは漏れ？ 退行と書いていい？」 | `validating-experimental-evidence` (EV2, EV4). |
| "Which hypothesis should we run next?" | `driving-bibifi-cycles`. |
| 「Julia の module に public を足して export を消して」 | `writing-julia`. |
| "Commit my fix in this small personal repo" (no gate, no records store) | `driving-jujutsu` or `driving-git` alone. |
| 「研究文書の正本はどれ？ 古い報告を廃止したい」 | `governing-research-documentation`. |
| "Where does this design report go?" (a document, not code or a record) | `governing-research-documentation`; HERE's homes row only points there. |
| 「単体の Julia ライブラリ。src/ と test/ はどう切る？」 (no records store, one package) | `writing-julia` PK2 alone. |
| 「論文ディレクトリの名前の付け方と latexmk の設定」 | `compiling-latex` alone. |

## Co-fire

| Ask | Order |
|---|---|
| "Add a revision that fixes the kernel, then run the official benchmark" | `implementing-and-debugging` and the language skill for the fix; HERE for N5 bump and N3 launch; `driving-polysearch` for the records. |
| 「結果を finding に書いて commit して」 (notebook repo) | `driving-polysearch` writes the record; HERE for N4 landing; `driving-jujutsu` only for a jj failure; `driving-git` defers in a house jj repo. |
| "Is this new revision a regression, and may we keep measuring it?" | HERE for the N5 LINEAGE row and measurability; `validating-experimental-evidence` for the claim. |
