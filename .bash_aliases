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
alias gr='grep -r'
alias gv='grep -v'
alias h='history 500'
alias j='jobs'
alias k='kill -9'
alias l='ls -CF'
alias la='ls -A'
alias ll='ls -alF'
alias lt='ls -ltr'
alias lm='cpulimit -l 200 --'
alias lm300='cpulimit -l 300 --'
alias lm400='cpulimit -l 400 --'
alias lm500='cpulimit -l 500 --'
alias m='more'
alias mp='mkdir -p'
alias n='n'
alias p='ps uxf'
alias pp='ps auxf'
alias s='source'
alias sb='source $HOME/.bashrc'
alias t='touch'
alias tf='tail -fF'
alias tp='htop'
alias du2='du -ah --max-depth=2'
alias v='view'


alias expand-gz='gunzip'
alias expand-Z='gunzip'
alias expand-bz2='bunzip2'
alias expand-targz='tar zxvf'
alias expand-tgz='tar zxvf'
alias expand-tarbz2='tar jxvf'
alias expand-tbz2='tar jxvf'


gpp () {
  if [ `echo $1 | fgrep '.c'` ] ; then
    #gcc $1 -o ${1%.c}
    gcc $1 -o ${1/.c/.out}
  elif [ `echo $1 | fgrep '.cpp'` ] ; then
    #g++ -std=c++11 $1 -o ${1%.cpp}
    g++ -std=c++11 $1 -o ${1/.cpp/.out}
  else
    :
  fi
}

#s () {
#  if [ `echo $1`]; then
#    echo qewrqerqwerqwerqwer
#    source $1
#  else
#    echo ppppppppppppppppppppppppppppppppp
#    source $HOME/.bashrc 
#  fi
#}
alias juno='jupyter notebook'

jupy () {
  jupyter nbconvert --to=python $1
  yapf -i ${1/.ipynb/.py}
}

juju () {
  jupyter nbconvert --to script $1
}


# for WSL
alias mnt-d='sudo mount -t drvfs D: /mnt/d'

export PYSH=$HOME/.pyscript
alias fc='python $PYSH/fc.py -r'
alias alarm='python $PYSH/alarm.py'

min () {
  nohup python -u $PYSH/min.py $1 $2 > min.log &
}


alias chrome='/mnt/c/Program\ Files\ \(x86\)/Google/Chrome/Application/chrome.exe'
alias canary='/mnt/c/Users/fytroo/AppData/Local/Google/Chrome\ SxS/Application/chrome.exe'
alias ggl=canary
# for Slack
alias bubbys='chrome "bubbys.slack.com"'
alias camico='chrome "camico.slack.com"'
# for LINE
alias ine='chrome --profile-directory=Default --app-id=menkifleemblimdogmoihpfopnplikde &'
alias myip='dig +short myip.opendns.com @resolver1.opendns.com'
alias jupyter-kernelspec-list='jupyter kernelspec list'


alias cpu-temp='cat /sys/class/thermal/thermal_zone0/temp'
julia-init () {
julia -e '''
Pkg.add("PyCall")
Pkg.add("SymPy")
Pkg.add("PyPlot")
Pkg.add("Plots")
Pkg.add("ZZ")
'''
}


google_translate() {
  local str opt cond
 
  if [ $# != 0 ]; then
    str=`echo $1 | sed -e 's/  */+/g'` # 1文字以上の半角空白を+に変換
    cond=$2
    if [ $cond = "ja-en" ]; then
      # ja -> en 翻訳
      opt='?hl=ja&sl=ja&tl=en&ie=UTF-8&oe=UTF-8'
    else
      # en -> ja 翻訳
      opt='?hl=ja&sl=en&tl=ja&ie=UTF-8&oe=UTF-8'
    fi
  else
    opt='?hl=ja&sl=en&tl=ja&ie=UTF-8&oe=UTF-8'
  fi
 
  opt="${opt}&text=${str}"
  w3m +13 "http://translate.google.com/${opt}"
}

enja() {
  google_translate "$*" "en-ja"
}
 
# w3m でGoogle translate Japanese->English
jaen() {
  google_translate "$*" "ja-en"
}

google() {
local str opt
if [ $ != 0 ]; then
for i in $*; do
str="$str+$i"
done
str=`echo $str | sed 's/^\+//'`
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

lsix() {
 montage -tile 7x1 -label %f -background black -fill white "$@" gif:- | convert - -colors 16 sixel:-; }

olos () {
  if [ "$3" = "" ]; then
    grep -rl $1 . | xargs sed -i "s/${1}/${2}/g"
  else
    grep -rl $1 $3 | xargs sed -i "s/${1}/${2}/g"
  fi
}

alias dn="deathnote"
alias mem='cat /proc/meminfo |egrep -e "Active:|Inactive:|MemFree:"'
alias git-help='echo https://qiita.com/muran001/items/f13742b51da3a22117ee'
alias pypi-help='echo "https://qiita.com/Kensuke-Mitsuzawa/items/7717f823df5a30c27077"'

alias pip-help='echo """
pip install git+https://github.com/user/repo.git@branch
"""'
