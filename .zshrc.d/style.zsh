#zplug denysdovhan/spaceship-prompt, use:spaceship.zsh, from:github, as:theme
#zplug sindresorhus/pure, use:pure.zsh, from:github, as:theme
zplug "modules/osx", from:prezto, if:"[[ $OSTYPE == *darwin* ]]"
zplug "modules/prompt", from:prezto
zstyle ':prezto:module:prompt' theme 'giddie'
