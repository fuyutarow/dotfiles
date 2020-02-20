# OS間のクリップボードの差異を吸収するコマンドを定義する oh-my-zsh のスニペットをロードします。
zinit snippet 'OMZ::lib/clipboard.zsh'

zinit snippet 'OMZ::lib/completion.zsh'
zinit snippet 'OMZ::lib/compfix.zsh'

# fzf で絵文字を検索&入力ためのプラグインです。
zinit light 'b4b4r07/emoji-cli'
# 利用可能なエイリアスを使わずにコマンドを実行した際に通知するプラグインです。
zinit light 'djui/alias-tips'
# fzf を使ったウィジェットが複数バンドルされたプラグインです。
zinit light 'mollifier/anyframe'
# 作業中のGitのルートディレクトリまでジャンプするコマンドを定義するプラグインです。
# cd-gitroot コマンドをエイリアスで U に割り当てています。
zinit light 'mollifier/cd-gitroot'
# tmux のウィンドウを作業中のGitレポジトリ名に応じて自動的にリネームしてくれるプラグインです。(自分で作った)
zinit light 'sei40kr/zsh-tmux-rename'
# ls よりも使いやすく見やすいディレクトリの一覧表示のコマンドを定義するプラグインです。
zinit ice pick'k.sh'
zinit light 'supercrabtree/k'

zinit ice wait'1' atload'_zsh_autosuggest_start'
zinit light 'zsh-users/zsh-autosuggestions'

zinit load momo-lab/zsh-abbrev-alias

zinit load zsh-users/zsh-syntax-highlighting

zinit load zsh-users/zsh-completions

zinit ice wait'1' atload'_zsh_highlight'
zinit light 'zdharma/fast-syntax-highlighting'

zinit load 'b4b4r07/emoji-cli'
# zinit load "zsh-users/zsh-autosuggestions"
# zinit load "zsh-users/zsh-syntax-highlighting"
# zinit load "zsh-users/zsh-completions"
# zinit load "RobSis/zsh-completion-generator", if:"GENCOMPL_FPATH=$HOME/.zsh/complete"
# zinit load "Tarrasch/zsh-functional" # each map filter fold
# zinit load "willghatch/zsh-hooks"
# zinit load "unixorn/warhol.plugin.zsh" # ansi
# zinit load "mollifier/zload"
# zinit load "b4b4r07/enhancd", use:"init.sh"
