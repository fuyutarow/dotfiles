#zplug sindresorhus/pure, use:pure.zsh, from:github, as:theme
case "$HOST" in
"tomatowk")
  zplug denysdovhan/spaceship-prompt, use:spaceship.zsh, from:github, as:theme
  ;;
"conohatan")
  zplug denysdovhan/spaceship-prompt, use:spaceship.zsh, from:github, as:theme
  zinit ice pick"async.zsh" src"pure.zsh"
  zinit light sindresorhus/pure
  ;;
"spaceshit")
  zinit ice pick'spaceship.zsh' wait'!0'
  zinit light 'denysdovhan/spaceship-zsh-theme'
  ;;
*)
  uname="%F{magenta}%n%f"
  host="%F{yellow}%m%f"
  pwd="%F{green}%~%f"
  NEWLINE=$'\n'
  # prompt="%F{blue})%f "
  prompt="%F{blue}$%f "
  datetime="%F{cyan}%D{%m-%d %H:%M}%f"

  PROMPT="${uname}@${host}:${datetime}|${pwd}${NEWLINE}${prompt}"
  ;;
esac
