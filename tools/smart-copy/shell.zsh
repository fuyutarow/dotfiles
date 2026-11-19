# smart-copy shell fragment — declared by `shell` in tools/smart-copy/tool.toml and sourced by
# zsh/aliases.zsh from its explicit TOOL_SHELL_FRAGMENTS list (scripts/lint-tool-declarations.ts
# compares that list with the declarations). Keep it quiet: it runs at every shell start.
#
# Clipboard function: stdin to the `smart-copy` command (tools/smart-copy), which feeds the terminal
# (OSC 52) and this machine's native clipboard and decides nothing. `--echo` also writes the text to
# the terminal, like tee, so `c`, `pp` and `q` still show what they copied. smart-copy is a
# root package.json bin, linked by `bun link` (mise run deps); no route logic lives in this shell.
copytoclipboard() {
  if ! command -v smart-copy > /dev/null 2>&1; then
    echo "smart-copy is not on PATH; run mise run deps in the dotfiles checkout" >&2
    return 127
  fi
  smart-copy --echo
}

# Clipboard aliases
alias c='copytoclipboard'
alias pwdc='pwd | copytoclipboard'
