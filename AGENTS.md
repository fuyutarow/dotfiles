# Dotfiles Project Guidance

This is the maintained project policy for agents using either Claude or Codex. The current
user request takes precedence. [README.md](README.md) owns the human-facing Architecture,
Design — the invariants, and Setup explanations; link to those descriptions rather than
duplicating inventories or machine status here. Configuration and task declarations own
their executable details.

## Topic ownership and configuration flow

- Keep one tool per topic directory. Adding or removing a tool touches its directory and
  `scripts/config-registry.ts`; do not create cross-topic `common`/`mac`/`wsl` buckets.
  A genuinely OS-specific topic may own a directory. Cross-OS variants belong inside their
  topic as `*.mac`, `*.wsl`, `*.win`, `mac.zsh` or `wsl.zsh`.
- Register every configuration surface in `scripts/config-registry.ts`, including source,
  deployment kind, consumer, single writer and verifier. `mise run config:map` displays this
  map; `mise run lint:config-map` checks coverage. Dotfile links belong in its `LINKS` table
  and are realized by `scripts/link-dots.ts`.
- Preserve declaration (repo) → render/deploy → home → runtime, with one writer per file.
  Edit the declaration, never the deployed generated file. Checks may compare runtime with
  declarations; runtime data must not become a second source of configuration.
- `scripts/render-home.ts` owns composed home files, including Claude settings, Codex hooks,
  global Claude guidance and the Homebrew prefix. Keep generated hook entries and dispatch
  blocks out of hand-written vendor sources. After changing render inputs, use
  `mise run link:dots` within the authorized deployment scope; `mise run lint:one-writer`
  checks source ownership. Registry and renderer declarations determine the current inputs.
- Paths rewritten by tools must be real tool-owned files, never links into the checkout.
  Keep the repo's readable half separate: `~/.config/git/config` beside tool-owned
  `~/.gitconfig`, and `~/.config/jj/conf.d/dotfiles.toml` beside tool-owned jj `config.toml`.
  Human-driven sheldon and Karabiner edits to declarations remain intentional exceptions.
- A value has one declaration: for example, `zsh/timezone` supplies shell and rendered
  agent timezone settings. Repo tasks live only in `mise.toml`; do not add a justfile.
- Tool parts may import only their own `tools/<name>/` directory and `tools/shared/`.
  For a tool release change, generate its changeset with
  `mise run changeset -- <tool> <patch|minor|major> "<entry>"`; do not hand-write a changeset
  or edit tool versions/changelogs in tickets. Landing applies pending release intent.

## Toolchains and consumer ownership

- Homebrew is the core utility installer across supported OSes. `Brewfile.core` and
  `Brewfile.ondemand` declare tiers; `Brewfile` is their union. Check `mise tasks` and the
  declarations before suggesting manual installs. Use `mise run tool:get <cmd>` for a
  declared on-demand formula, `mise run install:tools` for the full install, and `uvx` or
  `bunx` for one-shot CLIs. Prefer Bun for JavaScript tooling and uv for Python tooling.
- Experiment environments and versions belong to each consumer repo's `mise.toml`.
  Dotfiles supplies core development utilities; it must not install experiment toolchains
  globally or remove existing experiment runtimes while migrating core utilities.
- A mise-managed tool is reachable only where declared. Never use `mise use -g`, add a
  second login-shell version manager, or expose mise shims on interactive PATH.
  INV-6 allows no global tool rows. A-class agx and dx are Homebrew core tools from the
  shared public tap; release procedures check `agx -V` and `dx --version` on PATH.
  See [README's Tool installation kinds](README.md#tool-installation-kinds).
  `mise activate` serves interactive per-directory shells; the shim directory serves only
  non-interactive shells. Homebrew-managed core Bun/uv remain available in every cwd.
  Verify scope changes with `mise run test:mise-scope`.
- Machine-wide operator tools (A) are installed from the pinned root package through
  `bun install` / `bun link`, with agx and dx supplied by Homebrew core. Repository contract
  tools (B) are copied and pinned in each consumer and updated only by explicit pull.
  Consumer gates must work on a fresh clone:
  they must not depend on an A tool, symlink to dotfiles, or name a dotfiles checkout path.
  README's Tool installation kinds owns the classification inventory.
- Named repo CLIs use root `package.json` bin entries and `bun link` (`mise run deps`),
  never hand-made TypeScript links into `~/.local/bin`. Dotfiles tasks and gates invoke
  their local skill scripts through repo-relative Bun paths so they work before linking.
- Consumer repositories own their configuration and workloads. A worker's brief determines
  its writable files and actions; do not edit consumers or mutate, stop, restart or retune
  workloads you do not own without authorization. Approved `coredev deploy <alias>` runs
  the target checkout's declared tasks, with no local fallback, cloning, or transfer of
  profiles or credentials. README Setup and the host registry own deployment details.

## Portability and shell runtime

- Detect macOS, ordinary Linux and WSL at runtime; never assume the current machine.
  Shared shell logic uses `IS_MAC` / `IS_WSL`, computed once in `zsh/aliases.zsh`; do not
  add inline `uname` / `$OSTYPE` checks. Guard OS commands and optional paths by existence.
  Shared files must not contain machine-absolute `/Users/...` or `/home/...` paths.
- Windows-host `*.win` declarations are copied by the owning WSL task, never symlinked.
  Keep native plain `codex` separate from the WSL `codex.exe` Windows Desktop launcher and
  Windows configuration home; never replace Herdr's `codex` function with that launcher.
  README Setup and `Brewfile.core` own provider/install details. Use VS Code's declared
  launchers; do not reintroduce Cursor.
- `zsh/mac.zsh` and `zsh/wsl.zsh` load after common aliases and may override them.
  Sheldon sources only `zsh/aliases.zsh`, never a `*.zsh` glob.
- Keep `zsh/zshenv` tiny and quiet: it runs for every invocation, including SSH commands.
  Preserve user/Bun bin access, the rendered Homebrew prefix and existing rustup proxies
  for non-login shells. Bash SSH commands read the same prefix. Do not add `brew shellenv`,
  plugins, prompts, completions, printing or blocking work to zshenv.
- Preserve `GRAVEYARD` and `RIP_GRAVEYARD` under `$XDG_DATA_HOME` or `~/.local/share` in
  zsh/bash and the linked `environment.d` fallback for user services. Recoverable removal
  must refuse tmpfs/ramfs graveyards. Startup debug output is gated by `DOTFILES_DEBUG=1`
  through `_dbg`.
- Repair terminal state by writing known-good modes, never by querying the terminal.
  Preserve both mouse and Kitty keyboard reporting cleanup, prompt repair and SSH failure
  alternate-screen recovery. Reads can hang, consume type-ahead or suspend background SSH.
  Verify changes with `mise run test:zsh`, which uses a real pty and treats hangs as failure.
- Keep clipboard commands portable, including WSL UTF-8/UTF-16 handling. Alias, tmux,
  terminal and editor inventories belong to their topic declarations and README.

## Agent assets and dispatch

- `mise.toml` declares deployment: `mise run agents:link` links commands and Codex guidance;
  `mise run skills:sync` installs skill copies into Claude and Codex skill homes. No skill
  directory is linked into a tool home. `agents/codex/AGENTS.md` owns personal Codex guidance.
- Declare third-party skill source/name pairs in `agents/skills.thirdparty.toml`; install
  with `skills:add` / `skills:sync`. Sync removes old links into this checkout. If a global
  skill still resolves into another repo, `skills:migrate` copies it into a tool-owned
  directory before add/sync. Never edit a deployed copy as the maintained source.
- Invoke in-house skills by bare name; `dotfiles:` is reserved for hook slugs. Skill
  directory and frontmatter `name` must match; use gerund activity names, lowercase letters,
  numbers and hyphens, at most 64 characters. Shared skill names must not contain reserved
  `claude`/`anthropic` words. Keep tool/trigger keywords in third-person what-and-when
  descriptions. Read `forging-skills` before skill work. Retired skills are historical
  references indexed by `archives/skills/README.md`, not callable registrations to restore.
- In-house skill packages must not contain a nested `agents/` entry. Do not generate
  `agents/openai.yaml` or another vendor UI scaffold inside them. `lint:skills-wiring`
  rejects this layout, and skill sync refuses it before copying or installing a package.
- Use ordinary agx tickets and capability routing for worker selection. Add no fixed model,
  effort or roster unless the task owner requires it. Do not infer hook enforcement on
  dispatch paths the active hook does not cover. Workers stay within their brief's scope.
- Treat root `.agents/` as coordinator working state. Promote durable conclusions explicitly to
  their owned tracked documentation; do not make a coordinator working file a record by tracking it.
- Durable systemd worker dispatch must forward `CLAUDE_CODE_SESSION_ID` and
  `CODEX_SESSION_ID` with `-E`; use `agx worker run --session ID` when forwarding is unavailable.
  Preserve the naming, ownership and legacy-access rules declared by agx and described in
  README's invariants, rather than creating a second task/dispatch vocabulary here.
- Declare repository searches through `rr` with the appropriate query shape; known-symbol
  definitions/references belong to Serena. Agents must never run `rr index --accept-plan` or
  raw `ccc index`: both bypass the admission gate that protects the shared GPU and host. For
  first registration and the gated indexing procedure, see
  [Bringing a new root into retrieval](tools/repo-retrieve/README.md#bringing-a-new-root-into-retrieval).
  Do not bypass a blocked route. An empty result does not prove absence.

## Publication, safety and verification

- Agents do not run Git in this colocated jj repo. Use jj with `driving-jujutsu`; record
  through `mise run commit -- -m "<msg>" [--push] -- <path>...` and sync through
  `mise run pull`. These tasks supply checks/hooks jj itself does not run. The default
  bookmark is `alpha`; mise tasks may call Git internally. Human lazygit remains supported.
- Shared jj policy belongs in `jj/config.toml`; repo-specific overrides use
  `jj config set --repo` only for genuinely repo-specific values. Per-OS Git settings remain
  in the declared local include. Code, comments and commit subjects/bodies are English;
  Japanese is acceptable in documentation and conversation.
- Use recoverable `rip` for deletion; never raw `rm`. `mv`/`cp` refuse overwrites loudly;
  intentional overwrites use `mvf`/`cpf`. Never suggest ambiguous `git checkout`; for human
  Git use, distinguish branch switching from file restoration.
- Use the narrowest relevant declared verification and report the exact command/result.
  `mise run doctor` compares deployment with declarations; do not deploy or repair runtime
  merely to inspect it. Consult `mise.toml` for applicable checks. Include
  `mise run gate:land` when preparing a change for landing, subject to the worker brief's
  permitted verification scope. Do not broaden a documentation-only task into runtime work.
