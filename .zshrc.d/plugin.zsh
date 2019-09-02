# OS間のクリップボードの差異を吸収するコマンドを定義する oh-my-zsh のスニペットをロードします。
zplugin snippet 'OMZ::lib/clipboard.zsh'

zplugin snippet 'OMZ::lib/completion.zsh'
zplugin snippet 'OMZ::lib/compfix.zsh'

# fzf で絵文字を検索&入力ためのプラグインです。
zplugin light 'b4b4r07/emoji-cli'
# 利用可能なエイリアスを使わずにコマンドを実行した際に通知するプラグインです。
zplugin light 'djui/alias-tips'
# fzf を使ったウィジェットが複数バンドルされたプラグインです。
zplugin light 'mollifier/anyframe'
# 作業中のGitのルートディレクトリまでジャンプするコマンドを定義するプラグインです。
# cd-gitroot コマンドをエイリアスで U に割り当てています。
zplugin light 'mollifier/cd-gitroot'
# tmux のウィンドウを作業中のGitレポジトリ名に応じて自動的にリネームしてくれるプラグインです。(自分で作った)
zplugin light 'sei40kr/zsh-tmux-rename'
# ls よりも使いやすく見やすいディレクトリの一覧表示のコマンドを定義するプラグインです。
zplugin ice pick'k.sh'
zplugin light 'supercrabtree/k'

zplugin ice wait'1' atload'_zsh_autosuggest_start'
zplugin light 'zsh-users/zsh-autosuggestions'

zplugin load momo-lab/zsh-abbrev-alias

zplugin load zsh-users/zsh-syntax-highlighting

zplugin load zsh-users/zsh-completions

zplugin ice wait'1' atload'_zsh_highlight'
zplugin light 'zdharma/fast-syntax-highlighting'

zplugin load 'b4b4r07/emoji-cli'
# zplugin load "zsh-users/zsh-autosuggestions"
# zplugin load "zsh-users/zsh-syntax-highlighting"
# zplugin load "zsh-users/zsh-completions"
# zplugin load "RobSis/zsh-completion-generator", if:"GENCOMPL_FPATH=$HOME/.zsh/complete"
# zplugin load "Tarrasch/zsh-functional" # each map filter fold
# zplugin load "willghatch/zsh-hooks"
# zplugin load "unixorn/warhol.plugin.zsh" # ansi
# zplugin load "mollifier/zload"
# zplugin load "b4b4r07/enhancd", use:"init.sh"
