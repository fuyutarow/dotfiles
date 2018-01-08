# enable color support of ls and also add handy aliases
if [ -x /usr/bin/dircolors ]; then
    test -r ~/.dircolors && eval "$(dircolors -b ~/.dircolors)" || eval "$(dircolors -b)"
    alias ls='ls --color=auto'
    #alias dir='dir --color=auto'
    #alias vdir='vdir --color=auto'

    alias grep='grep --color=auto'
    alias fgrep='fgrep --color=auto'
    alias egrep='egrep --color=auto'
fi

if type lolcat > /dev/null 2>&1; then
  alias cat='lolcat'
fi

if [[ -x `which colordiff` ]]; then
  alias diff='colordiff'
else
  echo 'not found colordiff'
fi

alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias .....='cd ../../../..'
alias ~='cd ~'

# colored GCC warnings and errors
#export GCC_COLORS='error=01;31:warning=01;35:note=01;36:caret=01;32:locus=01:quote=01'

# some more ls aliases
alias c='clear'
alias cl='clear;ls'
alias cr='cp -R'
alias d='diff -u'
alias e='echo'
alias f='find'
alias g='grep'
alias h='history 500'
alias j='jobs'
alias k='kill -9'
alias l='ls -CF'
alias la='ls -A'
alias ll='ls -alF'
alias lm='cpulimit -l 200 --'
alias m='more'
alias n='n'
alias p='ps uxf'
alias pp='ps auxf'
alias s='source'
alias t='touch'
alias tf='tail -fF'
alias du2='du -ah --max-depth=2'
alias v='view'

alias tarxz='tar Jxfv'
alias htop='htop'
alias nvidia-smi='nvidia-smi'

alias juno='jupyter notebook'
alias jupy='jupyter nbconvert --to=python'

# for WSL
alias mnt-d='sudo mount -t drvfs D: /mnt/d'

export PYSH=$HOME/.pyscript
alias fc='python $PYSH/fc.py -r'

alias rere='pip uninstall tuner; pip install ~/Tuner'

alias chrome='/mnt/c/Program\ Files\ \(x86\)/Google/Chrome/Application/chrome.exe'
alias canary='/mnt/c/Users/fytroo/AppData/Local/Google/Chrome\ SxS/Application/chrome.exe'
alias ggl=canary
# for Slack
alias bubbys='chrome "bubbys.slack.com"'
alias camico='chrome "camico.slack.com"'
# for LINE
alias ine='chrome --profile-directory=Default --app-id=menkifleemblimdogmoihpfopnplikde &'
alias myip='dig +short myip.opendns.com @resolver1.opendns.com'
