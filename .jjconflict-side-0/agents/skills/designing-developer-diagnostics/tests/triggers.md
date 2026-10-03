# Fire / no-fire desk-check — F3

Read only the name and description of plausible skills before answering each row.

| id | User ask | Expected result | Why |
|---|---|---|---|
| F1 | `CLI が失敗したとき、ユーザーが次に何をすればいいか分かるエラーメッセージを設計して` | fire | Developer diagnostic + recovery. |
| F2 | `config validator の unknown key エラーに span と suggestion を付けたい` | fire; co-fire governing-configuration-systems only if authority is also undecided | Locus/recovery design is owned here. |
| F3 | `Rust compiler-like diagnostics の note と help をどう分ける？` | fire; co-fire writing-rust for API mechanics | Structured developer diagnostic. |
| F4 | `CI の stderr が読めない。exit code と machine readable output を壊さず改善して` | fire | Human/machine failure contract. |
| F5 | `permission denied のエラーを helpful にしたいが、原因を断定できない` | fire | Cause confidence and investigate recovery. |
| F6 | `この一文、自然な日本語に直して: file not found` | no-fire → linting-prose | Wording only. |
| F7 | `なぜ config loader がクラッシュするか調べて修正して` | no-fire → implementing-and-debugging first | Failure class/root cause is not established. |
| F8 | `TOML の override はどれが authoritative か決めたい` | no-fire → governing-configuration-systems | Authority contract, not diagnostic design. |
| F9 | `削除確認モーダルの失敗時の UX を設計して` | no-fire → designing-interactions | End-user interaction/recovery. |
| F10 | `OpenTelemetry の error span と alert routing を設計して` | no-fire → domain implementation/observability owner | Observability architecture. |
