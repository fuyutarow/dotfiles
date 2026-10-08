# Deploy characterization (ticket 1)

These are observations of the current checkout, not desired behavior. `static` means the ordered
actions were transcribed from implementation/task source because the entry point has no injected
runner or dry-run surface. No entry point was run against a real host. Line references point to the
implementation that owns the action order.

## Ordered actions

| Entry point | Mode | Ordered actions (source path:line) |
| --- | --- | --- |
| `bootstrap-linux.sh` | static | Remove forced root environment overrides (7); create user and sudoers if absent (8-11); copy root authorized keys if present (12); apt update/install procps, curl, git, zsh (13); call mise installer if absent and clone dotfiles if absent (16); run `linux-init.ts` as target user, forwarding `--rented` only when requested (14-16); set target login shell to zsh (17). |
| `linux:init` / `linux-init.ts` | static | Validate args and measure/write rented host declaration if eligible (83-112); read Brewfile.core (114-119); install core tools plus agy using mise (137-142); create bin directories and link each mise executable to `.local/bin` or runtime bin (143-160); trust dotfiles mise config and run deps (162-165); run link:dots (167-168); set git hooks path (170); colocate jj and track alpha if needed (171-180); install agent CLIs then MCPs (182-188); conditionally install sshd drop-in and HUP listener (190-214); lock sheldon plugins (216-217). |
| `wsl:init` / `wsl-init.ts` | static | apt install zsh (4); brew install sheldon/topgrade (5); run deps (6); link dotfiles (7); brew bundle full Brewfile (8); install tmux plugins (9); run topgrade (10); enable ccc daemon and capacity service (11-14); set login shell (15). |
| `mac:init` | static | brew install sheldon/coreutils (637); brew bundle full Brewfile (638); mac:rosetta (639); deps (640); link:dots (641); link:skills (642); tmux:plugins (643); mac:defaults (644); mac:obsidian (645); mac:iterm2 (646); print completion (647). |
| `install:tools` | static | `brew bundle --file=~/dotfiles/Brewfile` (mise.toml:602-604). |
| `link:dots` | static | Run `scripts/link-dots.ts --force` (mise.toml:686-688); the implementation resolves config registry links and renders home settings (scripts/link-dots.ts:1-5, 23-24). The registry, not this fixture, owns the link list. |
| `doctor` | static | Run read-only `scripts/doctor.ts` (mise.toml:702-704); its check order is implementation-owned and the task has no injected command runner. |
| `box:init` / `buildPlan` | injected plan | `scripts/box-init.ts:143-220, 221-317, 318-329`; default order: reach probe; auth:push; codex host check/declare; dotfiles index; then, per requested repo, clone, mise trust/install, jj setup/colocation, setup, doctor; finish doctor:remote. `scripts/tests/box-init.test.ts` exercises plan ordering without SSH. `--root-host/--root-port` adds bootstrap as the reach action. |
| `auth:push` / `pushAuth` | injected runner | For each selected CLI in order: read source; remote hash probe; transfer only if different and allowed; remote login-status probe. See `scripts/auth-push.ts:139-184`; the runner and file reads are injected. |
| `secrets:push` | static | Validate one host (129-145); remote fnox/config probe (146-154); refuse existing config unless a valid `--rotate` path, then rotate/verify and return (156-179); otherwise reject rotate-without-config and check age-keygen (181-189); generate temporary identity/config (191-212); read and age-encrypt each declared secret locally (213-229); send identity and config over SSH stdin (231-242); verify each secret opens remotely (244-258); clean temporary directory (192-195). Existing tests characterize argument/security guards; the command runner is not injected here. |
| `agent-dispatch-host.ts` | injected probes | Check existing declaration; probe container; probe user namespace; require `--rented`; create directory and exclusive mode-0600 file; validate the written declaration (66-114). Probe functions are injectable. |
| `doctor:remote` | static | Run `scripts/doctor-remote.ts` for the host (mise.toml:715-717); implementation checks reach, SSH command tools, interactive shell/herdr behavior, auth, fnox, timezone and forwarding through ordered finding checks (scripts/doctor-remote.ts:90-124 and subsequent check functions). |
| `wsl:wslconfig` | static | Verify WSL and source (62-82); query Windows user profile via PowerShell and map with wslpath (88-114); read requested memory and Windows RAM, refuse unsafe sizing (116-144); compare destination, then back up drift and copy source when needed (146 onward). |
| `wsl:wake` | static | Parse options/check ssh (134-168); probe host candidates in order and read distro state (170-183); `--status` probes guest and exits (188-193); otherwise start a stopped distro with detached anchor, wait and re-read state (195-219); probe guest; if unreachable start sshd through host, wait, and probe again (224-249). Host-selection helpers are injected/tested; process execution is not injected. |

## Existing characterization seams

- `scripts/tests/box-init.test.ts` calls the pure `buildPlan` and asserts step order.
- `scripts/tests/auth-push.test.ts` supplies `AuthPushDependencies` to `pushAuth`.
- `scripts/tests/agent-dispatch-host.test.ts` injects measured probes and a temporary home.
- `scripts/tests/bootstrap-linux.test.ts` uses a fake PATH and captures argv passed to linux-init.
- `scripts/tests/wsl-wake.test.ts` covers candidate selection helpers, not host commands.
- `scripts/link-dots.ts` has `HOME`, `DOTFILES`, and `--check` fixture seams; the task itself invokes `--force`.

## Inventory

`inventory.path-line.txt` is the exhaustive `rr regex` result reduced to `path:line`, using the
combined literal-name expression in the ticket. It is extension blind and includes tests, docs,
comments, and configuration references. Re-run `rr regex` after later migration edits; do not
interpret an empty ccc semantic search as absence.
