#zplug sindresorhus/pure, use:pure.zsh, from:github, as:theme
case "$HOST" in
  "KUROVO")
    echo KUROVO
    zplug "modules/prompt", from:prezto
    zstyle ':prezto:module:prompt' theme 'giddie'
  ;;
  "tomatowk")
    zplug denysdovhan/spaceship-prompt, use:spaceship.zsh, from:github, as:theme
  ;;
  "conohatan")
    zplug denysdovhan/spaceship-prompt, use:spaceship.zsh, from:github, as:theme
  ;;
  "ringbell"|"ringbell.local")
    uname="%F{magenta}%n%f"
    host="%F{yellow}%m%f"
    pwd="%F{green}%~%f"
    NEWLINE=$'\n'
    prompt="%F{blue})%f "

    PROMPT="${uname}@${host}|${pwd}${NEWLINE}${prompt}"
    # RPROMPT="%F{cyan}%D{%m-%d %H:%M}%f"
  ;;
 *)
    zplug "modules/osx", from:prezto, if:"[[ $OSTYPE == *darwin* ]]"
    zplug "modules/prompt", from:prezto
    zstyle ':prezto:module:prompt' theme 'giddie'
  ;;
esac
