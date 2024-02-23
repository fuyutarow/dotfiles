#!/usr/bin/env bash


if [ -x /usr/bin/dircolors ]; then
  test -r ~/.dircolors && eval "$(dircolors -b ~/.dircolors)" || eval "$(dircolors -b)"
  alias ls='ls --color=auto'
  #alias dir='dir --color=auto'
  #alias vdir='vdir --color=auto'
  alias grep='grep --color=auto'
  alias fgrep='fgrep --color=auto'
  alias egrep='egrep --color=auto'
fi

if type lolcat >/dev/null 2>&1; then
  alias cat='lolcat'
fi

if [[ -x $(which colordiff) ]]; then
  alias diff='colordiff'
fi

# vim
# ===
type "nvim" >/dev/null 2>&1 || alias nvim="vim"
alias view='nvim -R'
alias vd='nvim -d'
alias sp='nvim -o'
alias vs='nvim -O'
alias vi='vs'

alias b='bun'
alias bb='bun run build'
alias bn='bun run'

# change directory
# ================
# traditional `cd` aliases
# ------------------------
# alias ..='cd ..'
# alias ...='cd ../..'
# alias ....='cd ../../..'
# alias .....='cd ../../../..'
# alias ~='cd ~'
# alias -- -='cd -'
#
# from now on tonight
# -------------------
# Yes, `cd` stands for comma and dot.
# # for examples
# To type `,` is equivalent to `cd ~`.
# To type `, <dir>` is equivalent to `cd <dir>`.
# To type `,,` is equivalent to `cd -`.
# To type `..` is equivalent to `cd ..`.
commad() {
  if [ $# -eq 0 ]; then
    cd
  else
    local target_path="$1"

    if [ -d "$target_path" ]; then
      cd "$target_path"
    else
      local fallback_path=$(dirname "$target_path")
      cd "$fallback_path"
    fi
  fi
}

alias ,='commad'
alias ..=', ..' # change to parent directory.
alias ...=', ../..'
alias ....=', ../../..'
alias .....=', ../../../..'
alias ......=', ../../../../..'
alias ~=', ~' # change to home directory.

alias c="pbcopy"

# colored GCC warnings and errors
#export GCC_COLORS='error=01;31:warning=01;35:note=01;36:caret=01;32:locus=01:quote=01'

alias cake='cargo make'

# some more ls aliases
# alias cr='cp -R ${1%/}'

cr() {
  cp -R "${1%/}" "$2"
}

alias di='diff -u'

alias d='docker'
alias dc='docker-compose'

alias dl='youtube-dl'

editor () {
    if [ $# -eq 0 ]; then
        # Check if the current directory is part of a Git repository
        gitTopLevel=$(git rev-parse --show-toplevel 2>/dev/null)
        if [ -n "$gitTopLevel" ]; then
            # Open the top-level directory of the Git repository
            code "$gitTopLevel"
        else
            # Open the current directory
            code .
        fi
    else
        # Open the specified directory or file
        code "$@"
    fi
}


alias e="editor"

# log command
# -----------
# Export the previous command as a log
# $ ee ~/dotfiles/shell.md
alias ee='echo "$(!!)" >> '

alias em='emacs'

alias f='find'

alias ft='echo $(/bin/date "+%Y-%m-%dT%T") $(/usr/local/bin/fast) | tee -a ~/.fast.log'

alias g='git'
alias gi='git'

alias gr='grep'
alias grr='grep -r'
alias gv='grep -v'
alias gl='grep -ilr'

grl() {
  grep "$@" -rl .
}

alias h='history 100'
alias ha="h | sed 's/^[ ]*[0-9]\+[ ]*//'"
alias hg="h|grep"

alias lip='ifconfig en0 inet'
alias gip='curl globalip.me'

# alias j='jobs'
alias j='just'
alias jl='just -l'

alias ji='jupyter notebook'

alias k='tak'

alias kl='kill -9'

# ls
# --
type "eza" >/dev/null 2>&1 || alias eza="ls"
alias l='eza -F'
alias la='eza -A'
alias ll='eza -alF --git'
alias lll='eza -alF --git -s=mod --time-style=long-iso'
# alias lll='ll --sort=time'
alias lt='eza -FT' # tree
# alias lt='eza --tree'

alias lm='cpulimit -l 200 --'
alias lm300='cpulimit -l 300 --'
alias lm400='cpulimit -l 400 --'
alias lm500='cpulimit -l 500 --'

alias m='more'
alias md='mkdir'
alias mp='mkdir -p'

explorer() {
  explorer.exe "$@"
}
[ $(echo $(uname -r) | grep 'icrosoft') ] && alias open="explorer"
alias o='open'
alias oo='open .'
alias ooo='open ..'

type "bat" >/dev/null 2>&1 || alias bat="cat"
alias p='bat'
# p() {
#   ext=${@##*.}
#   case $ext in
#   'md')
#     mdr $@ 2>/dev/null || cat $@
#     ;;
#   *) cat $@ ;;
#   esac
# }

alias pp='ps auxf'
alias pi='pipenv'
alias pin='pipenv run'

py() {
  if [[ $1 == "add" ]]; then
    command="rye $@"
    command+=" && rye sync"
  elif [[ $1 == "shell" ]]; then
    source .venv/bin/activate
  else
    command="rye $@"
  fi

  eval $command
}

alias s='start'

# alias sudo='sudo -E '

# Quick source and edit
# ---------------------
alias sa='. $HOME/.aliases'
# alias sa='source activate'
alias sb='. $HOME/.bashrc'
alias sz='. $HOME/.zshrc'
alias st='tmux source-file $HOME/.tmux.conf'

alias sae='vi $HOME/.aliases'
alias sbe='vi $HOME/.bashrc'
alias sde='vi $HOME/dotfiles/nvim/dein.toml'
alias see='vi $HOME/.emacs'
alias sge='vi $HOME/.gitconfig'
alias sme='vi $HOME/dotfiles/Makefile.toml'
alias sle='vi $HOME/.latexmkrc'
alias ste='vi $HOME/.tmux.conf'
alias sve='vi $HOME/dotfiles/nvim/init.vim'
alias sze='vi $HOME/.zshrc'

# tmux
# ----
alias t='tmux'
alias tn='tmux new -s'
alias tl='tmux ls'
alias ta='tmux a'
alias tt='tmux a -t'
alias tks='tmux kill-session -t'

alias to='touch'

alias tf='tail -fF'

# rm
# --
type "rip" >/dev/null 2>&1 || alias rip="rm"
alias rm="rip"

# alias del='/bin/rm'
# if type "rmtrash" >/dev/null 2>&1; then
#   alias rm='rmtrash'
# else
#   function rm() {
#     mkdir -p $HOME/.Trash
#     mv --backup=numbered --target-directory=$HOME/.Trash "$@"
#   }
# fi
# alias rr='rm -rf'

alias du2='du -ah --max-depth=2'

alias wttr="curl wttr.in/Tokyo"

alias x='latexmk'
alias xp='latexmk -pv'
alias xx='latexmk -pvc'
alias xc='latexmk -c'

alias pdf2txt='pdf2txt.py'

trim() {
  sed -ie 's/[ \t]*$//' "$@"
}

unpack() {
  if [ "$2" = "" ]; then
    case "$1" in
    *.zip) unzip "$1" ;;
    *.tar) tar xvf "$1" ;;
    *.tar.gz) tar zxvf "$1" ;;
    *.tgz) tar zxvf "$1" ;;
    *.tar.bz2) tar jxvf "$1" ;;
    *.tbz2) tar jxvf "$1" ;;
    *.gz) gunzip "$1" ;;
    *.Z) gunzip "$1" ;;
    *.bz2) bunzip2 "$1" ;;
    *) echo not support. ;;
    esac
  else
    mkdir "$2"
    case "$1" in
    *.zip) unzip "$1" ;;
    *.tar) tar xvf "$1" -C "$2" --strip-components 1 ;;
    *.tar.gz) tar zxvf "$1" -C "$2" --strip-components 1 ;;
    *.tgz) tar zxvf "$1" -C "$2" --strip-components 1 ;;
    *.tar.bz2) tar jxvf "$1" -C "$2" --strip-components 1 ;;
    *.tbz2) tar jxvf "$1" -C "$2" --strip-components 1 ;;
    *.gz) gunzip "$1" ;;
    *.Z) gunzip "$1" ;;
    *.bz2) bunzip2 "$1" ;;
    *) echo not support. ;;
    esac
  fi
}

alias apt-remove-force='dpkg --force-a
ll -r'
alias cpu-temp='cat /sys/class/thermal/thermal_zone0/temp'

gpp() {
  if [ $(echo $1 | fgrep '.c') ]; then
    #gcc $1 -o ${1%.c}
    gcc $1 -o ${1/.c/.out}
  elif [ $(echo $1 | fgrep '.cpp') ]; then
    #g++ -std=c++11 $1 -o ${1%.cpp}
    g++ -std=c++11 $1 -o ${1/.cpp/.out}
  else
    :
  fi
}

colorcode() {
  for fore in $(seq 30 37); do
    printf "\e[${fore}m \\\e[${fore}m \e[m\n"
    for mode in 1 4 5; do
      printf "\e[${fore};${mode}m \\\e[${fore};${mode}m \e[m"
      for back in $(seq 40 47); do
        printf "\e[${fore};${back};${mode}m \\\e[${fore};${back};${mode}m \e[m"
      done
      echo
    done
    echo
  done
  printf " \\\e[m\n"
}

julia-init() {
  julia -e '''
Pkg.add("PyCall")
Pkg.add("SymPy")
Pkg.add("PyPlot")
Pkg.add("Plots")
Pkg.add("ZZ")
'''
}

lsix() {
  montage -tile 7x1 -label %f -background black -fill white "$@" gif:- | convert - -colors 16 sixel:-
}

subs() {
  if [ "$3" = "" ]; then
    grep -rl $1 ./* | xargs sed -i.bak -e "s/${1}/${2}/g"
  else
    grep -rl $1 $3 | xargs sed -i.bak -e "s/${1}/${2}/g"
  fi
}

reverse-pdf() {
  orgfile=${1/.pdf/.org.pdf}
  mv "$1" "$orgfile"
  qpdf --empty "$1" --pages "$orgfile" z-1 --
}

alias dn="deathnote"
alias mem='cat /proc/meminfo |egrep -e "Active:|Inactive:|MemFree:"'
alias git-help='echo https://qiita.com/muran001/items/f13742b51da3a22117ee'
alias pypi-help='echo "https://qiita.com/Kensuke-Mitsuzawa/items/7717f823df5a30c27077"'

alias pip-help='echo """
pip install git+https://github.com/user/repo.git@branch
"""'
alias md2pdf='markdown-pdf'

##cat ~/.ssh/id_rsa.pub | ssh username@xx.xx.xx.xx "cat >> ~/.ssh/authorized_keys"
alias del-swp="rm ~/.local/share/nvim/swap/*"
alias enja="trans -b -sl=en -tl=ja"
alias jaen="trans -b -sl=ja -tl=en"

alias line-dl="line-dl -o ~/Gdrive/stickers"

new_tex() {
  mkdir "$1"
  cp ~/dotfiles/TeX/* "$1"
  cd "$1"
}

# start app
# =========

local _ostype="$(uname -s)"
local _cputype="$(uname -m)"

if [ "$_ostype" = Darwin -a "$_cputype" = i386 ]; then
  # Darwin `uname -s` lies
  if sysctl hw.optional.x86_64 | grep -q ': 1'; then
    local _cputype=x86_64
  fi
fi

case "$_ostype" in
Linux)
  # for WSL
  alias mnt-d='sudo mount -t drvfs D: /mnt/d'
  alias start='cmd.exe /c start'
  ;;
Darwin)
  alias start='open -a'
  ;;
MINGW* | MSYS* | CYGWIN*)
  local _ostype=pc-windows-msvc
  ;;
*)
  err "no precompiled binaries available for OS: $_ostype"
  ;;
esac

# Launch native app
alias slack="start slack"
alias chrome="start /Applications/Google\ Chrome.app"

# Launch web app
CANARY="/Applications/Google\ Chrome\ Canary.app"
chrome="/Applications/Google\ Chrome.app"
#BROWSER="Firefox"
#BROWSER="Safari"
BROWSER="vivaldi"
alias browse="start $BROWSER"
alias trello="start $CANARY http://trello.com"
alias youtube="start $chrome http://youtube.com"
alias github='browse http://github.com'
alias canary="open -a $CANARY"

alias timecard='browse http://docs.google.com/spreadsheets/d/1iRAxcGaQngB5LJslh_BaREjFyey_LXZwiMgemfR866I/edit'
alias docs='browse http://docs.google.com/document/u/0/'
alias sheet='browse http://docs.google.com/spreadsheets/u/0/'

alias math='canary https://develop.wolframcloud.com/'

google() {
  local str opt
  if [ $ != 0 ]; then
    for i in $*; do
      str="$str+$i"
    done
    str=$(echo $str | sed 's/^\+//')
    opt='search?num=50&amp;hl=ja&amp;lr=lang_ja'
    opt="${opt}&amp;q=${str}"
  fi
  w3m http://www.google.co.jp/$opt
}

alc() {
  if [ $ != 0 ]; then
    w3m "http://eow.alc.co.jp/$*/UTF-8/?ref=sa"
  else
    w3m "http://www.alc.co.jp/"
  fi
}

if [ $(echo $(uname -r) | grep 'icrosoft') ]; then
  pbcopy() {
    tee <&0 | clip.exe
  }
fi
