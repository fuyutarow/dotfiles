# tools/ architecture

## Suite

The A-class `agx` suite is released from `fuyutarow/agx` and follows the newest release.
Both `mise.toml` and `mise/dotfiles.toml` declare
`"github:fuyutarow/agx" = { version = "latest", minimum_release_age = "0" }`
without release-age delay; `mise.lock` records the version last adopted. Its contracts live in that
repository's [`contract/README.md`](https://github.com/fuyutarow/agx/blob/13b49ebd/contract/README.md).
Dotfiles owns its local statusline, hook, and landing integration code.
