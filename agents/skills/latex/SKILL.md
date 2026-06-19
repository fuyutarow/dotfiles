---
name: latex
description: Use when working on LaTeX, LuaLaTeX, Beamer, papers, TeX build setup, PDF generation, LaTeX formatting/linting, or LaTeX repository hygiene. Prefer modern repo-native task setup: mise tasks, tex-fmt formatting, ChkTeX linting, latexmk builds, Poppler visual PDF verification, and deliberate .gitignore rules. Trigger for “compile/build PDF”, “LaTeX error”, “Beamer”, “format/lint TeX”, “tlmgr”, “tex-fmt”, “chktex”, “latexmk”, “papers directory”, or “gitignore for LaTeX artifacts”.
---

# Modern LaTeX / Beamer Workflow

Use executable repo configuration over long natural-language procedures. For project setup, prefer adapting the bundled templates in `assets/`:

- `assets/mise-latex.toml`: task template for `latex:*` commands.
- `assets/tex-fmt.toml`: formatter config for `tex-fmt`.
- `assets/latexmkrc`: LuaLaTeX build config that routes outputs to `build/`.
- `assets/latex.gitignore`: ignore snippet for generated TeX artifacts.

## Core Decisions

- Use `mise` as the single task surface. Do not introduce a second LaTeX task surface; migrate legacy shell/build wrappers into `mise` unless the user explicitly asks to preserve them.
- Use `latexmk` for builds; do not hand-roll repeated `lualatex`/`bibtex` loops for normal projects.
- Use `tex-fmt` as the formatter for new LaTeX setup.
- Use `chktex` for LaTeX linting, with explicit suppressions for known Beamer noise rather than accepting arbitrary warnings.
- Use `tlmgr` for TeX Live packages. Use Homebrew/Cargo/binary release for non-TeX tools such as `tex-fmt`.
- Put generated PDFs and aux files under a build directory whenever possible.
- For papers/slides in `papers/`, prefer `{yymm}_{seq}-{title_name}` directories, where `title_name` uses underscores.

## Setup Workflow

1. Inspect existing `mise.toml`, `.gitignore`, paper directory layout, and build files.
2. If LaTeX tasks are missing or fragmented, add/adapt `assets/mise-latex.toml` into the repo’s `mise.toml`.
3. Add/adapt `assets/tex-fmt.toml` at the repo root.
4. Add/adapt `assets/latexmkrc` into the paper/slides directory.
5. Add/adapt `assets/latex.gitignore` into `.gitignore`.
6. Remove obsolete LaTeX build wrappers when `mise` is the repo’s task runner.
7. Run the task surface, not ad-hoc commands:
   - `mise run latex:fmt:check`
   - `mise run latex:lint`
   - `mise run latex:check`

If the repo already uses a prefix such as `slides:*` or `paper:*`, keep that naming but preserve the same underlying toolchain.

## Verification

After meaningful edits:

- Run format check, lint, and build through `mise`.
- Inspect the LaTeX log for `Overfull`, `Underfull`, and warnings.
- Render representative PDF pages with Poppler (`pdftoppm`) and inspect PNGs visually when layout matters.
- Check generated artifacts are ignored or intentionally tracked.

## Gitignore Policy

Ignore reproducible TeX byproducts broadly (`*.aux`, `*.bbl`, `*.blg`, `*.fdb_latexmk`, `*.fls`, `*.out`, `*.synctex.gz`, etc.) and build directories (`**/build/` when appropriate). Do not blanket-ignore all PDFs in repositories that store source/reference PDFs; instead route generated PDFs to ignored build directories or use targeted ignores.

## Recovery

If `latexmk` fails because a package is missing:

1. Identify the missing `.sty`/`.cls` in the log.
2. Use `kpsewhich` to confirm absence.
3. Use `tlmgr search --global --file <name>` to find the TeX Live package.
4. Add the package to the repo’s setup task if it is a stable project dependency.

If the TeX installation itself is broken, report the failing command and stop before inventing broad system-repair procedures.
