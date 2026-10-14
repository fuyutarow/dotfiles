# Full Homebrew install selection: core tools plus every declared on-demand formula and cask.
# Apply with: brew bundle --file=~/dotfiles/Brewfile
# Core and on-demand declarations stay separate so each tier can be checked and installed alone.
instance_eval(File.read(File.join(__dir__, "Brewfile.core")))
instance_eval(File.read(File.join(__dir__, "Brewfile.ondemand")))
