#!/usr/bin/env bash

# Check for required tools and warn if not installed
if ! type "fd" >/dev/null 2>&1; then
  echo "⚠️  Warning: 'fd' is not installed. Consider installing it for better file finding."
  echo "   Install: brew install fd (macOS) or cargo install fd-find (cross-platform)"
fi

if ! type "rg" >/dev/null 2>&1; then
  echo "⚠️  Warning: 'rg' (ripgrep) is not installed. Consider installing it for faster searching."
  echo "   Install: brew install ripgrep (macOS) or cargo install ripgrep (cross-platform)"
fi

if [ -x /usr/bin/dircolors ]; then
  test -r ~/.dircolors && eval "$(dircolors -b ~/.dircolors)" || eval "$(dircolors -b)"
  #alias dir='dir --color=auto'
  #alias vdir='vdir --color=auto'

  # ripgrep recommendation
  # type "rg" >/dev/null 2>&1 && echo "Using ripgrep (rg) for faster searching"
  alias fgrep='grep -F --color=auto'
  alias egrep='grep -E --color=auto'
fi

# bat for better file viewing
type "bat" >/dev/null 2>&1 || alias bat="cat"

if type lolcat >/dev/null 2>&1; then
  alias lcat='lolcat'
fi

# diff with better visualization
type "delta" >/dev/null 2>&1 && alias diff='delta' || alias diff='diff --color=auto'

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
# To type `,. is equivalent to popd.
commad() {
  if [ $# -eq 0 ]; then
    pushd ~ > /dev/null
  else
    local target_path="$1"

    if [ -d "$target_path" ]; then
      pushd "$target_path" > /dev/null
    else
      local fallback_path=$(dirname "$target_path")
      pushd "$fallback_path" > /dev/null
    fi
  fi
}

# Function for popping n directories off the stack
commad_popd() {
  local n=${1:-1}
  while [ $n -gt 0 ]; do
    popd > /dev/null
    n=$((n-1))
  done
}

alias ,='commad'
alias ,,=', $_'
alias ..=', ..' # change to parent directory.
alias ...=', ../..'
alias ....=', ../../..'
alias .....=', ../../../..'
alias ......=', ../../../../..'
alias ~=', ~' # change to home directory.

# Directory stack navigation (popd functionality)
alias ,.='commad_popd 1' # popd once - go back one entry in directory stack
alias ,..='commad_popd 2' # popd twice - go back two entries in stack
alias ,...='commad_popd 3' # popd three times - go back three entries in stack

# Cross-platform clipboard function
copytoclipboard() {
  # Use tee to both display and pipe to clipboard
  if [[ "$(uname -r)" == *microsoft* ]]; then
    # WSL
    tee /dev/tty | clip.exe
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    tee /dev/tty | pbcopy
  elif command -v xclip &> /dev/null; then
    # Linux with xclip
    tee /dev/tty | xclip -selection clipboard
  elif command -v xsel &> /dev/null; then
    # Linux with xsel
    tee /dev/tty | xsel --clipboard --input
  else
    echo "No clipboard utility found" >&2
    return 1
  fi
}

# Clipboard aliases
alias c='copytoclipboard'
alias pwdc='pwd | c'

# WSL-specific aliases
if [[ "$(uname -r)" == *microsoft* ]]; then
  alias open='explorer.exe'
  alias o="open"
  alias oo='open .'
  alias winget='winget.exe'
fi

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

alias dl='yt-dlp'

editor () {
    if [ $# -eq 0 ]; then
        # Check if the current directory is part of a Git repository
        gitTopLevel=$(git rev-parse --show-toplevel 2>/dev/null)
        if [ -n "$gitTopLevel" ]; then
            # Open the top-level directory of the Git repository
            # code "$gitTopLevel"
            cursor "$gitTopLevel"
        else
            # Open the current directory
            # code .
            cursor .
        fi
    else
        # Open the specified directory or file
        code "$@"
    fi
}


alias e="editor"
alias ee="editor ."

# log command
# -----------
# Export the previous command as a log
# $ ee ~/dotfiles/shell.md
# alias ee='echo "$(!!)" >> '

alias em='emacs'


ff() {
  # Usage: ff [ext] [dir=.]
  if [ -z "$1" ]; then
    echo "Usage: ff [ext] [dir=.]" >&2
    return 1
  fi
  local ext="$1"
  local dir="${2:-.}"
  if type "fd" >/dev/null 2>&1; then
    fd --type f "\.${ext}$" "$dir" --exec-batch bat {} --style=plain --paging=never
  else
    /usr/bin/find "$dir" -name "*.${ext}" | sort | xargs cat
  fi
}


# fd for better file finding
type "fd" >/dev/null 2>&1 || alias fd="find"
alias f='fd'


alias g='git'

alias gr='rg'
alias grr='rg'
alias gv='rg -v'
alias gl='rg -l -i'

grl() {
  if type "rg" >/dev/null 2>&1; then
    rg "$@" -l
  else
    /usr/bin/grep "$@" -rl .
  fi
}

alias h='history 100'
alias ha="h | sed 's/^[ ]*[0-9]\+[ ]*//'"
alias hg="h|grep"

# Network info
alias lip='ip -4 addr show | grep inet'
alias gip='curl -s ifconfig.me'

# alias j='jobs'
alias j='just'
alias jl='just -l'



alias kl='kill -9'

# eza for better directory listing
type "eza" >/dev/null 2>&1 || alias eza="ls --color=auto"
alias l='eza -F'
alias la='eza -A'
alias ll='eza -alF'
alias lll='eza -alF -s=mod --time-style=long-iso'
# alias lll='ll --sort=time'
alias lt='eza -FT' # tree
# alias lt='eza --tree'


alias m='more'
alias md='mkdir'
alias mp='mkdir -p'


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

# procs for better process viewing
type "procs" >/dev/null 2>&1 || alias procs="ps aux"
alias pp='procs --tree 2>/dev/null || ps auxf'

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

# rip for safer file removal
type "rip" >/dev/null 2>&1 || alias rip="rm -i"

# Command recommendations
rm() {
  echo "⛔ Error: 'rm' command is disabled for safety!"
  echo "   Please use 'rip' instead for safer file removal."
  echo "   If you really need to use rm, use '/bin/rm' directly."
  return 1
}
npm() {
  echo "⚠️  Warning: Consider using bun instead of npm!"
  echo "   Proceeding with npm..."
  command npm "$@"
}
yarn() {
  echo "⚠️  Warning: Consider using bun instead of yarn!"
  echo "   Proceeding with yarn..."
  command yarn "$@"
}
npx() {
  echo "⚠️  Warning: Consider using bunx instead of npx!"
  echo "   Proceeding with npx..."
  command npx "$@"
}
ls() {
  echo "⛔ Error: 'ls' command is disabled!"
  echo "   Please use 'eza' or aliases: l, ll, la, lll, lt"
  echo "   If you really need ls, use '/bin/ls' directly."
  return 1
}
cat() {
  echo "⛔ Error: 'cat' command is disabled!"
  echo "   Please use 'bat' (alias: p) instead."
  echo "   If you really need cat, use '/bin/cat' directly."
  return 1
}
grep() {
  echo "⛔ Error: 'grep' command is disabled!"
  echo "   Please use 'rg' (ripgrep) or aliases: gr, grr, gv, gl"
  echo "   If you really need grep, use '/bin/grep' directly."
  return 1
}
find() {
  echo "⛔ Error: 'find' command is disabled!"
  echo "   Please use 'fd' (alias: f) instead."
  echo "   If you really need find, use '/usr/bin/find' directly."
  return 1
}
du() {
  echo "⛔ Error: 'du' command is disabled!"
  echo "   Please use 'dust' or alias: du2"
  echo "   If you really need du, use '/usr/bin/du' directly."
  return 1
}
ps() {
  echo "⛔ Error: 'ps' command is disabled!"
  echo "   Please use 'procs' (alias: pp) instead."
  echo "   If you really need ps, use '/bin/ps' directly."
  return 1
}

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

# dust for better disk usage visualization
type "dust" >/dev/null 2>&1 || alias dust="du -ah"
alias du2='dust -d 2 2>/dev/null || du -ah --max-depth=2'

alias wttr="curl wttr.in/Tokyo"

alias x='latexmk'
alias xp='latexmk -pv'
alias xx='latexmk -pvc'
alias xc='latexmk -c'


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

alias apt-remove-force='dpkg --force-all -r'
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

alias mem='cat /proc/meminfo |egrep -e "Active:|Inactive:|MemFree:"'
alias git-help='echo https://qiita.com/muran001/items/f13742b51da3a22117ee'


##cat ~/.ssh/id_rsa.pub | ssh username@xx.xx.xx.xx "cat >> ~/.ssh/authorized_keys"
alias del-swp="rm ~/.local/share/nvim/swap/*"
alias enja="trans -b -sl=en -tl=ja"
alias jaen="trans -b -sl=ja -tl=en"



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
  ;;
esac



# Temporarily disabled due to hanging issue
# if [[ -n "$(uname -r 2>/dev/null | grep -i 'microsoft' || true)" ]]; then
#   pbcopy() {
#     tee <&0 | clip.exe
#   }
# else
# fi

