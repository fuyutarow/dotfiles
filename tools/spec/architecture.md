# tools/ architecture

## Suite

The A-class `agx` suite is released from `fuyutarow/agx` and follows the newest release.
Its sole declaration is `mise/dotfiles.toml`, deployed as `~/.config/mise/conf.d/dotfiles.toml`:
`"github:fuyutarow/agx" = { version = "latest", minimum_release_age = "0" }`
without release-age delay. Neither repository `mise.toml` nor `mise.lock` records agx.
The agx release procedure swaps the machine's version and checks `agx -V` in every consumer.
Its contracts live in that
repository's [`contract/README.md`](https://github.com/fuyutarow/agx/blob/13b49ebd/contract/README.md).
Dotfiles owns its local statusline, hook, and landing integration code.
