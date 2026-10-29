# btmp

For dotfiles maintainers: `btm` in interactive zsh is an alias for `btmp`.
Outside a herdr pane, btmp execs the executable returned by `Bun.which("btm")`,
preserving arguments and exit status. Inside a pane it runs that same binary
and reports the `btm` agent and CPU/RAM/tmpfs metadata. The alias cannot recurse:
executable lookup does not consult zsh aliases.

## Automatic presence

`herdr/config.toml` adds a **new server-side command timer**, immediately at
startup and every 5 seconds, calling `"$HOME/.bun/bin/btmp" ensure`. Successful
ensure emits no output, so it adds no visible tab-bar status text.
Herdr documents immediate execution, periodic execution, non-overlap, and socket
context in [UI and sidebar](https://herdr.dev/docs/configuration/#ui-and-sidebar).
This works on a headless server; no shell prompt or attached TUI is required.

Ensure requires an explicit `HERDR_SOCKET_PATH`. It locks per socket, reads
`herdr agent list`, and counts rows whose `agent` is exactly `btm`. If one exists,
it checks that agent's tab label and repairs it to `btm` with the documented
`herdr tab rename <TAB_ID> <LABEL>...` command (installed `herdr tab rename --help`).
Tabs already labelled `btm` need no rename; existing panes and processes remain.
The sidebar's configured `tab` token displays this label.
It creates one tab in each workspace that has not yet had a btm, or a
workspace if the server is empty. Herdr workspace metadata records that btm was
created; a closed btm tab stays closed until the Herdr server restarts. Killing
btm likewise does not recreate it during that server session. A new workspace
gets its own tab. Herdr discards the record when the workspace closes or the
server restarts, so a restored workspace can get a new btm after restart.
It launches using the documented
[layout.apply argv launch](https://herdr.dev/docs/socket-api/), which returns
the actual tab ID to wait for.
That avoids typing into a shell during startup. Existing workspace focus stays
unchanged. It never closes an existing user pane or removes duplicate user apps.

With installed herdr, bun, btm and the linked btmp bin, normal startup converges
within **20 seconds**. A crashed ensure's lock expires after
30 seconds; allow 60 seconds for that recovery. Repeated and concurrent ensures
are serialized. Manually starting additional btmp instances is not deduplicated.

After landing, install the checkout's bins with the existing `mise run deps`
deployment step and reload the deployed config with `herdr server reload-config`.
No separate OS timer or service is needed. New interactive shells load the alias.

## Verification

`bun test tools/herdr-btm` starts an isolated real herdr server with its socket,
config and home under `/tmp`. It checks startup, respecting pane closure, new
workspaces, repeated/concurrent ensure, zsh alias resolution, argument forwarding,
registration and exit status. It does not address the owner's live server.
The patch changeset leaves version selection to release tooling, which writes the
package version and changelog.
