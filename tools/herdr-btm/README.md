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
Otherwise it creates a tab in the first workspace, or a
workspace if the server is empty. It replaces only its new placeholder tab using
the documented [layout.apply argv launch](https://herdr.dev/docs/socket-api/).
That avoids typing into a shell during startup. Existing workspace focus stays
unchanged. It never closes an existing user pane or removes duplicate user apps.

With installed herdr, bun, btm and the linked btmp bin, normal startup and pane
closure converge within **20 seconds**. A crashed ensure's lock expires after
30 seconds; allow 60 seconds for that recovery. Repeated and concurrent ensures
are serialized. Manually starting additional btmp instances is not deduplicated.

After landing, install the checkout's bins with the existing `mise run deps`
deployment step and reload the deployed config with `herdr server reload-config`.
No separate OS timer or service is needed. New interactive shells load the alias.

## Verification

`bun test tools/herdr-btm` starts an isolated real herdr server with its socket,
config and home under `/tmp`. It checks startup, automatic recovery after pane
closure, repeated/concurrent ensure, zsh alias resolution, argument forwarding,
registration and exit status. It does not address the owner's live server.
The pending patch changeset targets version 0.2.1; release tooling writes the
package version and changelog.
