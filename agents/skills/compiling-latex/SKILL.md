---
name: compiling-latex
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
- Get the base TeX distribution from Homebrew via the repo `Brewfile` (`mactex-no-gui` on mac, `texlive` on linuxbrew); get non-TeX tools (`tex-fmt`, `poppler`) from Homebrew too. See **Environment** below.
- Use `tlmgr` for extra TeX Live packages — but on linuxbrew it MUST be **user mode** (`tlmgr --usermode install`), not system mode (which is blocked there). See **Environment**.
- Put generated PDFs and aux files under a build directory whenever possible.
- For papers/slides in `papers/`, prefer `{yymm}_{seq}-{title_name}` directories, where `title_name` uses underscores.

## Environment (toolchain install)

Install differs by OS. **Rule: Homebrew owns the base distribution; `tlmgr` only adds extras.** Probe first — `which lualatex latexmk tlmgr chktex kpsewhich` (all should resolve) and `tlmgr --version`. If anything is missing, `brew bundle --file=~/dotfiles/Brewfile` installs the base + `tex-fmt` + `poppler`.

- **macOS** — `mactex-no-gui` cask (full TeX Live, no GUI). Binaries via `/Library/TeX/texbin` (stable across year upgrades; add once to shell PATH). Add packages with `sudo tlmgr install <pkg>` — the tree is root-owned, so **sudo is required** (running without it fails).
- **WSL / linuxbrew (default)** — `texlive` formula. Effectively full TeX Live: complete `texmf-dist` tree incl. Japanese (`luatexja` + Harano Aji), only docs stripped. All binaries are already on PATH at `$(brew --prefix)/bin` — **no TEXBIN, no PATH export, no sudo**. Update the base with `brew upgrade texlive`, never `tlmgr update`.
- **WSL escape hatch** — only when you need full *system-mode* `tlmgr` (`update --self --all`) or a package that ships executables (user mode can't): TUG `install-tl --texdir="$HOME/texlive/<year>"` (user-owned → sudo-free), then add `…/bin/<arch>-linux` to PATH (glob the year/arch — not added automatically on Unix). Not captured by `Brewfile`.

### tlmgr: system vs user mode (the linuxbrew gotcha)

Under brew `texlive`, system-mode `tlmgr install` / `update --self` / `update --all` are **BLOCKED** (`tlmgr: action not allowed in system mode`) and **`sudo` does NOT bypass it** — the keg is replaced wholesale on `brew upgrade` anyway. Add extras in **user mode**:

```sh
tlmgr init-usertree              # once (this action IS allowed in system mode)
tlmgr --usermode install <pkg>   # → TEXMFHOME; found automatically; survives brew upgrade
```

`TEXMFHOME` is OS-dependent (`~/texmf` on Linux, `~/Library/texmf` on mac) — resolve with `kpsewhich -var-value TEXMFHOME`, never hardcode. User-mode limits: relocatable packages only (no executable/core packages → use `install-tl`/MacTeX for those), no auto dependent-collections, and `--usermode` must be passed on every call. MacTeX and `install-tl` have full system-mode tlmgr instead (`sudo tlmgr install <pkg>` on MacTeX). Note: the brew `texlive` full tree already ships the standard set (beamer, pgf, luatexja, collections), so on WSL extra installs are rarely needed.

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
4. Install it the right way for the platform: `sudo tlmgr install <pkg>` on MacTeX/`install-tl`; `tlmgr --usermode install <pkg>` on linuxbrew (system mode is blocked there — see **Environment**).
5. Add the package to the repo’s setup task if it is a stable project dependency.

If the TeX installation itself is broken, report the failing command and stop before inventing broad system-repair procedures.
