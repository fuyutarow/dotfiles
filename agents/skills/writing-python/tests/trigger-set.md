# writing-python — fire / no-fire trigger set (F3 artifact)

**Desk-check protocol**: judge every row from `name:` + `description:` ONLY (the fields the
matcher actually sees) — never from this file's own annotations, and never from SKILL.md's body.
Re-run this desk-check, against the FULL skill collection (not just this description in
isolation), after any description edit. If a row's real-world answer disagrees with the table,
the bug is in the **description wording**, not in this table — fix the description, then re-run
the desk-check before touching anything else. A no-fire row names which sibling (or no skill)
fires instead; a co-fire row states the order. Created v2607.1.0 (2026-07-12).

## FIRES

| Ask | Why |
|---|---|
| 「Pythonで新しいプロジェクトの環境構築して。パッケージ管理どうするのがいい？」 | PG0 env floor (`uv init` → pyproject.toml + uv.lock) + PG1 selection consult — environment.md + selection.md; no code yet but the decision surface is squarely PG0/PG1 |
| "add httpx retry logic to scraper.py" (project with pyproject.toml) | httpx is already the selection.md HTTP default; retry logic is tenacity's row, not a hand-rolled `time.sleep` loop (idioms.md) — PG1 + PG4. NOTE: as a feature change this also co-fires `implementing-and-debugging` FIRST (same ordering as the co-fire table below); it appears here because THIS skill must fire regardless |
| 「requirements.txt と poetry のプロジェクトを uv に移行したい」 | PG0 migration path — environment.md §migration (poetry 2.x is PEP-621-compliant but new work is still uv; requirements.txt's residual role is a uv-export artifact only) |
| "review this FastAPI endpoint for production readiness" | full gate sweep: PG2 types, PG3 boundary (pydantic model at the seam, not a raw dict), PG4 quality (ruff/pytest), aware datetimes |
| 「スクレイパー書いて。cron で毎日回すやつ」 (no headline keyword — kept script) | HONEST RISK ROW: no writing-python token is present, so the realistic outcome is `implementing-and-debugging` firing first (実装/機能追加) and THIS skill entering as its co-fire the moment the work turns out to be Python (language chosen → PG0/PG1 govern env+deps). Desk-check expectation: co-fire via the sibling, not a solo description match — if neither fires, that is a real miss |
| "mypy strict にしたら3000エラー出たんだけどどうすれば" | PG2 — typing.md strict-rollout discipline (migrate per-path, never a repo-wide flip) + the checker-landscape verdict (mypy vs pyright/ty) |
| "polars と pandas、新規の ETL はどっち？" (selection ask) | PG1 — selection.md dataframes row (polars default for new pipelines; pandas' honest niche stated, not "legacy") |
| "この dict をそのまま4関数に引き回してるコード、型付けたい" | PG3 boundary — raw-dict threading is the deny pattern; validate once into a model, then PG2 typed signatures on the four functions |

## MUST NOT FIRE (near-miss — same vocabulary, different owner)

| Ask | Route |
|---|---|
| "yt-dlp でこの動画落として" | `running-python-tools` — invoke-a-tool-NOW; nothing authored lives in a repo |
| 「uvx ruff check . を実行して結果見せて」 | `running-python-tools` — running a tool this instant, not authoring/reviewing the Python it checks |
| "uv run --with pypdf でこのPDFからテキスト抜いて" (one-off snippet) | `running-python-tools` — PURPOSE cut: a one-off snippet, not a kept script or project |
| "PyO3 で Rust 関数を Python に公開する設計を決めたい" | `writing-rust` — LANGUAGE cut: binding architecture FROM Rust stays there (a Rust dependency decision) |
| 「Julia から SymPy を呼ぶには」 | `writing-julia` — LANGUAGE cut: calling Python FROM Julia is a Julia dependency-architecture decision, even though the payload is Python |
| "GILって何？なくなるの？" (concept, no code) | no skill — ecosystem/history question, nothing to write |
| 「この Python プロジェクトの README を推敲して」 | `linting-prose` — prose ABOUT a Python project, not the code itself |
| "transcribe this m4a" (tool happens to be Python) | `transcribing-media` / `running-python-tools` — Python is only the tool's implementation language; nothing in a repo to author |
| "uvx で httpx 使って API 叩くワンライナー書いて実行して" | `running-python-tools` — bare `httpx` token appears, but the explicit one-off `uvx` framing resolves via the description Cut (run a tool NOW); second stress-test of the bare-keyword collision class beyond the ruff row |
| "wandbのダッシュボードで loss グラフの色を変えたい" | no skill — pure web-UI cosmetics; `wandb` appears in the description but there is no Python to write/review and no selection decision |
| 「この Python 関数の docstring の日本語おかしいから直して」 | `linting-prose` — wording of prose (even embedded in code) is its territory; this skill enters only if the CODE also changes |

## Co-fire order checks (not fire/no-fire — sequencing)

| Ask | Expected order |
|---|---|
| "この Python サービスの落ちてるバグ直して" | `implementing-and-debugging` DEBUG gate first (root-cause/edit-surface) → this skill for the Python inside (PG0–PG4 idiom/gates) |
| 「このモジュール、動作変えずに分割リファクタして」 | `refactoring-code` governs (two hats/oracle/deny-gate) → this skill supplies the Python oracle (ruff + type checker + pytest green bracket) + Python-safe transforms |
| "新しい依存足してこの機能実装して" | `implementing-and-debugging` BUILD gate first (intent/edit surface) → this skill (PG0 env + PG1 selection) for the new dependency, same turn — order declared, not implicit |
| "hydra の job submit 時に GPU が OOM になる。config 調整したい" | `implementing-and-debugging` DEBUG gate first (runtime failure, root-cause) → this skill for the config/experiment layer (research.md §1–§2: typed config, batch-size/memory knobs live in config-as-code, never a blind sweep) |

Adjudicated non-additions: 「Julia から SymPy を呼ぶには」 carries no writing-python description
cut on purpose (description budget) — writing-julia's own description claims that ask explicitly
("PythonCall/SymPyPythonCall from Julia stays here") and its tokens (Julia, SymPy) dominate the
lexical match; the cut lives in this skill's body Routing table only.
