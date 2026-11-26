# A bare Ubuntu, then the README's one line. `mise run test:fresh` builds this from the checkout.
#
# No tool list lives here: the image is whatever scripts/bootstrap-linux.sh makes of an empty
# machine, so this file cannot disagree with Brewfile.core or COREDEV_SELECTION. What a container
# cannot show stays unproven: systemd user units and timers, /etc links, the login shell, WSL's
# own services.
FROM ubuntu:26.04
# git before the bootstrap only to turn the copied checkout into something `git clone` accepts;
# the bootstrap installs everything else itself.
RUN apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git > /dev/null
COPY dotfiles /seed
RUN git config --system --add safe.directory '*' \
 && git -C /seed init -q -b alpha \
 && git -C /seed add -A \
 && git -C /seed -c user.name=fresh -c user.email=fresh@example.invalid commit -q -m seed
RUN DOTFILES_REPO=/seed bash /seed/scripts/bootstrap-linux.sh
