# Use modern completion system
autoload -Uz compinit
compinit

zstyle ':completion:*' auto-description 'specify: %d'
zstyle ':completion:*' completer _expand _complete _correct _approximate
zstyle ':completion:*' format 'Completing %d'
zstyle ':completion:*' group-name ''
zstyle ':completion:*' menu select=2
# eval "$(dircolors -b)"
zstyle ':completion:*:default' list-colors ${(s.:.)LS_COLORS}
zstyle ':completion:*' list-colors ''
zstyle ':completion:*' list-prompt %SAt %p: Hit TAB for more, or the character to insert%s
zstyle ':completion:*' matcher-list '' 'm:{a-z}={A-Z}' 'm:{a-zA-Z}={A-Za-z}' 'r:|[._-]=* r:|=* l:|=*'
zstyle ':completion:*' menu select=long
zstyle ':completion:*' select-prompt %SScrolling active: current selection at %p%s
zstyle ':completion:*' use-compctl false
zstyle ':completion:*' verbose true

zstyle ':completion:*:*:kill:*:processes' list-colors '=(#b) #([0-9]#)*=0=01;31'
zstyle ':completion:*:kill:*' command 'ps -u $USER -o pid,%cpu,tty,cputime,cmd'

zplugin load momo-lab/zsh-abbrev-alias # 略語を展開する
zplugin load zsh-users/zsh-syntax-highlighting # 実行可能なコマンドに色付け
zplugin load zsh-users/zsh-completions # 補完
# zplug "zsh-users/zsh-completions", lazy:true # reinforce completions
# zplug "modules/git", from:prezto, lazy:true # git completion
# zplug "peterhurford/git-aliases.zsh", lazy:true # git aliases completion
# zplug "zsh-users/zsh-autosuggestions", lazy:true # suggest in input
