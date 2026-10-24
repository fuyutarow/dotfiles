# tools/ architecture

## Suites

The A-class `agx` and `dx` suites are released from `fuyutarow/agx` and `fuyutarow/dx`.
They are the only global mise exceptions to INV-6, each declared once in `mise/dotfiles.toml`,
deployed as `~/.config/mise/conf.d/dotfiles.toml`, with
`{ version = "latest", minimum_release_age = "0" }` and direct GitHub API URL replacements.
Neither repository `mise.toml` nor `mise.lock` records either suite.
Their release procedures install an explicit version and check `agx -V` and
`mise exec -C <repo> -- dx --version`, respectively, in every consumer.
The agx contracts live in that
repository's [`contract/README.md`](https://github.com/fuyutarow/agx/blob/13b49ebd/contract/README.md).
Dotfiles owns its local statusline, hook, and landing integration code.
