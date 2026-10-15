---
description: Alias — fire the `writing-technical-japanese` entrypoint (木下是雄『理科系の作文技術』) on one document/task. The entrypoint dispatches the craft to structuring-documents then linting-prose; talks add designing-presentations. All craft lives in those skills — this only triggers the pipeline.
argument-hint: [TASK]
disable-model-invocation: true
---

`writing-technical-japanese`（木下是雄『理科系の作文技術』の entrypoint）を起動し、その dispatch
に従って適用せよ。これから書くなら `structuring-documents`（設計）→ `linting-prose`（監査）の順。
既存文書の監査なら linting-prose（構造に難があれば
structuring-documents へ差し戻す）。

対象:
$ARGUMENTS
