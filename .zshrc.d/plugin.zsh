#zplug 'zplug/zplug', hook-build:'zplug --self-manage'
zplug "mafredri/zsh-async", from:github, lazy:true
zplug "zsh-users/zsh-completions", lazy:true # reinforce completions
zplug "modules/git", from:prezto, lazy:true # git completion
zplug "peterhurford/git-aliases.zsh", lazy:true # git aliases completion
zplug "zsh-users/zsh-autosuggestions", lazy:true # suggest in input
