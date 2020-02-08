#zplug sindresorhus/pure, use:pure.zsh, from:github, as:theme
case "$HOST" in
  "tomatowk")
    zplug denysdovhan/spaceship-prompt, use:spaceship.zsh, from:github, as:theme
  ;;
  "conohatan")
    zplug denysdovhan/spaceship-prompt, use:spaceship.zsh, from:github, as:theme
    zplugin ice pick"async.zsh" src"pure.zsh"
    zplugin light sindresorhus/pure
  ;;
  "spaceshit")
    zplugin ice pick'spaceship.zsh' wait'!0'
    zplugin light 'denysdovhan/spaceship-zsh-theme'
  ;;
  *)
    uname="%F{magenta}%n%f"
    host="%F{yellow}%m%f"
    pwd="%F{green}%~%f"
    NEWLINE=$'\n'
    prompt="%F{blue})%f "
    datetime="%F{cyan}%D{%m-%d %H:%M}%f"

    PROMPT="${uname}@${host}:${datetime}|${pwd}${NEWLINE}${prompt}"
  ;;
esac
