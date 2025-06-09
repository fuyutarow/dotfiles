#!/usr/bin/env zsh

# ============================================
# Unified Command Recommendation System
# ============================================

# Function to check if a command exists
command_exists() {
  type "$1" >/dev/null 2>&1
}

# Define command recommendations with their alternatives and installation info
typeset -A COMMAND_RECOMMENDATIONS=(
  ["cat"]="bat:brew install bat:cargo install bat"
  ["ls"]="eza:brew install eza:cargo install eza"
  ["grep"]="rg:brew install ripgrep:cargo install ripgrep"
  ["find"]="fd:brew install fd:cargo install fd-find"
  ["du"]="dust:brew install dust:cargo install du-dust"
  ["ps"]="procs:brew install procs:cargo install procs"
  ["top"]="btop:brew install btop:cargo install bottom"
  ["htop"]="btop:brew install btop:cargo install bottom"
  ["ping"]="gping:brew install gping:cargo install gping"
  ["sed"]="sd:brew install sd:cargo install sd"
  ["cut"]="choose:brew install choose-rust:cargo install choose"
  ["man"]="tldr:brew install tldr:cargo install tealdeer"
  ["cd"]="zoxide:brew install zoxide:cargo install zoxide"
  ["tree"]="broot:brew install broot:cargo install broot"
)

# ============================================
# Essential Tool Initialization
# ============================================

# Initialize zoxide (smart directory navigation)
command_exists "zoxide" && eval "$(zoxide init zsh)"

# Initialize atuin (enhanced history management)
command_exists "atuin" && eval "$(atuin init zsh)"

# Function to get installation instructions
get_install_instructions() {
  local tool="$1"
  local info="${COMMAND_RECOMMENDATIONS[$tool]}"
  if [[ -n "$info" ]]; then
    IFS=':' read -r recommended brew_install cargo_install <<< "$info"
    echo "   Install: $brew_install (macOS) or $cargo_install (cross-platform)"
  fi
}

# Check and warn for missing recommended tools at startup
check_recommended_tools() {
  local checked_tools=()
  for cmd in ${(k)COMMAND_RECOMMENDATIONS}; do
    local info="${COMMAND_RECOMMENDATIONS[$cmd]}"
    IFS=':' read -r tool _ _ <<< "$info"
    # Avoid duplicate checks
    if [[ ! " ${checked_tools[@]} " =~ " ${tool} " ]]; then
      checked_tools+=("$tool")
      if ! command_exists "$tool"; then
        echo "⚠️  Warning: '$tool' is not installed. Consider installing it for better experience."
        get_install_instructions "$cmd"
      fi
    fi
  done
}

# Run the check on startup
check_recommended_tools

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
if ! command_exists "bat"; then
  alias bat="cat"
fi

if type lolcat >/dev/null 2>&1; then
  alias lcat='lolcat'
fi

# diff with better visualization
command_exists "delta" && alias diff='delta' || alias diff='diff --color=auto'

# vim
# ===
command_exists "nvim" || alias nvim="vim"
alias view='nvim -R'
alias vd='nvim -d'
alias sp='nvim -o'
alias vs='nvim -O'
alias vi='vs'

alias b='bun'
alias bb='bun run build'
alias bn='bun run'

# change directory with zoxide integration
# ========================================
# zoxide replaces cd with smart directory jumping
# traditional `cd` aliases (now using zoxide)
# -----------------------------------------------
# alias ..='cd ..'    # → kept as is
# alias ...='cd ../..'
# alias ....='cd ../../..'
# alias .....='cd ../../../..'
# alias ~='cd ~'
# alias -- -='cd -'
#
# Enhanced navigation with zoxide + custom system
# ------------------------------------------------
# `,` system is kept for compatibility
# `j` for zoxide smart jumping
# `zi` for interactive directory selection
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

alias ,='z'        # Replace commad with zoxide
alias ,,='z -'     # Go to previous directory with zoxide
alias ..=', ..' # change to parent directory (now using zoxide)
alias ...=', ../..'
alias ....=', ../../..'
alias .....=', ../../../..'
alias ......=', ../../../../..'
alias ~=', ~' # change to home directory (now using zoxide)

# Directory stack navigation (popd functionality)
alias ,.='commad_popd 1' # popd once - go back one entry in directory stack
alias ,..='commad_popd 2' # popd twice - go back two entries in stack
alias ,...='commad_popd 3' # popd three times - go back three entries in stack

# ============================================
# Productivity Tools Integration
# ============================================

# Zoxide integration is now handled above with , alias
# Additional zoxide commands:
alias zi='zi'         # Interactive directory selection
alias zl='zoxide query --list'   # List frequent directories
alias zs='zoxide query --stats'  # Show directory statistics

# Enhanced navigation combining zoxide with existing system
,d() {
  # Jump to dotfiles subdirectory
  z ~/dotfiles/"$1"
}

,p() {
  # Jump to projects subdirectory
  z ~/projects/"$1" 2>/dev/null || z ~/Projects/"$1"
}

# Lazygit - Beautiful Git TUI
# ----------------------------
alias lg='lazygit'
alias lgd='cd ~/dotfiles && lazygit'    # Git operations in dotfiles
alias lgp=',p && lazygit'               # Git operations in projects

# Combined zoxide + lazygit
lg,() {
  if [ $# -eq 0 ]; then
    lazygit
  else
    z "$1" && lazygit
  fi
}

# Atuin - Enhanced history management
# -----------------------------------
# Note: eval "$(atuin init zsh)" should be in .zshrc
# Ctrl+R is automatically replaced by atuin
alias hs='atuin search'                 # CLI history search
alias hst='atuin stats'                 # History statistics
alias hi='atuin import auto'            # Import existing history

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
alias c='claude'
alias cc='copytoclipboard'
alias pwdc='pwd | cc'


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
command_exists "fd" || alias fd="find"
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

# Help and History management
alias h='tldr'                          # Better man pages with practical examples
alias hh='atuin search --interactive'   # Interactive history search
alias hhh='show_aliases_help'           # Show custom aliases help

# History management with atuin integration
alias ha='atuin history list'           # Show all history
alias hg='atuin search'                  # Search history

# Custom help function for our aliases
show_aliases_help() {
  cat << 'EOF'
🚀 Custom Aliases & Productivity Tools
======================================

📁 Navigation (zoxide-powered):
  ,  <dir>     Smart directory jump
  ,,           Previous directory
  ..           Parent directory
  ...          Two levels up
  ~            Home directory
  ,d <subdir>  Jump to ~/dotfiles/<subdir>
  ,p <subdir>  Jump to ~/projects/<subdir>

📚 Help & History:
  h  <cmd>     Better man pages (tldr)
  hh           Interactive history search (atuin)
  hhh          This help
  ha           Show all history
  hg <query>   Search history

🔧 Development:
  j            Just (task runner)
  lg           Lazygit (Git TUI)
  lgd          Lazygit in dotfiles
  lg, <dir>    Lazygit in specific directory
  e            Editor (cursor/code)

📂 File Operations:
  l            List files (eza)
  ll           Detailed listing
  p            View file (bat)
  f            Find files (fd)
  gr           Search in files (rg)

🛠️  Modern Tools:
  zi           Interactive directory selection
  zl           List frequent directories
  zs           Directory statistics
  Ctrl+R       Enhanced history search

💡 Tip: Most commands have enhanced modern versions!
    ls→eza, cat→bat, grep→rg, find→fd, cd→zoxide
EOF
}

# Network info
alias lip='ip -4 addr show | grep inet'
alias gip='curl -s ifconfig.me'

# alias j='jobs'
alias j='just'
alias jl='just -l'



alias kl='kill -9'

# eza for better directory listing
command_exists "eza" || alias eza="ls --color=auto"
alias l='eza -F'
alias la='eza -A'
alias ll='eza -alF'
alias lll='eza -alF -s=mod --time-style=long-iso'
# alias lll='ll --sort=time'
alias lt='eza -FT' # tree
# alias lt='eza --tree'

# Enable file completion for eza aliases
if command_exists "eza"; then
  # Initialize zsh completion system if not already done
  if ! type compdef >/dev/null 2>&1; then
    autoload -Uz compinit && compinit
  fi
  # Set up completion for eza aliases to use file/directory completion
  compdef '_files' l la ll lll lt
fi


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
command_exists "procs" || alias procs="ps aux"

# pp command: view file content and copy to clipboard
pp() {
  if [ $# -eq 0 ]; then
    echo "Usage: pp <file>" >&2
    return 1
  fi

  # Handle encoding for WSL
  if [[ "$(uname -r)" == *microsoft* ]]; then
    bat "$1" | tee >(iconv -f UTF-8 -t UTF-16LE | clip.exe)
  else
    bat "$1" | copytoclipboard
  fi
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
alias t='tmux a'
alias tn='tmux new -s'
alias tl='tmux ls'
alias ta='tmux a'
alias tt='tmux a -t'
alias tks='tmux kill-session -t'

# tmux multiple horizontal panes
th() {
  local n=${1:-2}
  if [ $n -lt 1 ] || [ $n -gt 6 ]; then
    echo "Usage: th [1-6]"
    return 1
  fi

  tmux new-session \; \
    run-shell "
      for i in \$(seq 2 $n); do
        tmux split-window -h
      done
    " \; \
    select-layout even-horizontal
}

alias t2='th 2'
alias t3='th 3'
alias t4='th 4'
alias t5='th 5'
alias t6='th 6'

alias to='touch'

alias tf='tail -fF'

# rip for safer file removal
command_exists "rip" || alias rip="rm -i"

# ============================================
# Additional Recommended Tools (not replacements)
# ============================================
typeset -A ADDITIONAL_TOOLS=(
  ["just"]="brew install just:cargo install just"
  ["fzf"]="brew install fzf:cargo install skim"
  ["lazygit"]="brew install lazygit:cargo install gitui"
  ["lazydocker"]="brew install lazydocker:go install github.com/jesseduffield/lazydocker@latest"
  ["jq"]="brew install jq:cargo install jaq"
  ["yq"]="brew install yq:pip install yq"
  ["direnv"]="brew install direnv:curl -sfL https://direnv.net/install.sh | bash"
  ["starship"]="brew install starship:cargo install starship"
  ["atuin"]="brew install atuin:cargo install atuin"
  ["mcfly"]="brew install mcfly:cargo install mcfly"
  ["navi"]="brew install navi:cargo install navi"
)

# Check additional tools
check_additional_tools() {
  echo "📦 Checking for additional recommended tools..."
  for tool in ${(k)ADDITIONAL_TOOLS}; do
    if ! command_exists "$tool"; then
      local info="${ADDITIONAL_TOOLS[$tool]}"
      IFS=':' read -r brew_install other_install <<< "$info"
      echo "💡 Consider installing '$tool':"
      echo "   Install: $brew_install (macOS) or $other_install"
    fi
  done
}

# ============================================
# Command Override Functions
# ============================================

# Generic function to handle command overrides with warnings
_command_warning() {
  local cmd="$1"
  shift
  local info="${COMMAND_RECOMMENDATIONS[$cmd]}"

  if [[ -n "$info" ]]; then
    IFS=':' read -r recommended _ _ <<< "$info"

    if ! command_exists "$recommended"; then
      echo "⚠️  Warning: '$recommended' is not installed. Install it for better experience:"
      get_install_instructions "$cmd"
      echo "   Using standard $cmd instead..."
    else
      echo "⚠️  Warning: Consider using '$recommended' instead of $cmd!"
      echo "   Proceeding with $cmd..."
    fi
  fi

  command "$cmd" "$@"
}

# Generic function for disabled commands
_command_disabled() {
  local cmd="$1"
  local info="${COMMAND_RECOMMENDATIONS[$cmd]}"

  if [[ -n "$info" ]]; then
    IFS=':' read -r recommended _ _ <<< "$info"

    echo "⛔ Error: '$cmd' command is disabled!"
    if ! command_exists "$recommended"; then
      echo "   The recommended alternative '$recommended' is not installed."
      get_install_instructions "$cmd"
    else
      echo "   Please use '$recommended' instead."
      # Show relevant aliases if applicable
      case "$cmd" in
        "ls") echo "   Aliases available: l, ll, la, lll, lt" ;;
        "grep") echo "   Aliases available: gr, grr, gv, gl" ;;
        "find") echo "   Alias available: f" ;;
        "du") echo "   Alias available: du2" ;;
        "ps") echo "   Alias available: pp" ;;
      esac
    fi
    echo "   If you really need $cmd, use the full path (e.g., /bin/$cmd, /usr/bin/$cmd)."
  fi

  return 1
}

# Special cases that don't fit the pattern
rm() {
  echo "⛔ FATAL ERROR: 'rm' command is PERMANENTLY DISABLED!"
  echo "   This system ONLY supports 'rip' for file removal."
  echo "   There is NO alternative. Use 'rip' or nothing."
  echo "   This is non-negotiable for system safety."
  return 1
}

# Package manager warnings (not disabled, just warned)
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

# Commands that show warning but still execute
cat() { _command_warning "cat" "$@"; }

# Commands that are completely disabled
ls() { _command_disabled "ls"; }
grep() { _command_disabled "grep"; }
find() { _command_disabled "find"; }
du() { _command_disabled "du"; }
ps() { _command_disabled "ps"; }

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
command_exists "dust" || alias dust="du -ah"
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

