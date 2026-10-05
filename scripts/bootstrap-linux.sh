#!/bin/bash
# shim: bootstrap
# A fresh Linux box (as root) → the slim dotfiles env for user $DOTFILES_USER (default fuyu). Root-only steps here; the rest is scripts/linux-init.ts.
# Usage: curl -fsSL https://raw.githubusercontent.com/fuyutarow/dotfiles/alpha/scripts/bootstrap-linux.sh | bash
set -euo pipefail
U="${DOTFILES_USER:-fuyu}"
sed -i '/^HOME=\/root$/d' /etc/environment 2> /dev/null || true # vastai/base-image forces HOME=/root on every user
id "$U" > /dev/null 2>&1 || {
  useradd -m -s /bin/bash "$U"
  echo "$U ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/$U"
}
[ -f /root/.ssh/authorized_keys ] && install -d -m 700 -o "$U" -g "$U" "/home/$U/.ssh" && install -m 600 -o "$U" -g "$U" /root/.ssh/authorized_keys "/home/$U/.ssh/" # -D would leave ~/.ssh root-owned and link-dots could not write ~/.ssh/config
apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq build-essential procps file curl git zsh > /dev/null
sudo -iu "$U" bash -c 'set -e; [ -x /home/linuxbrew/.linuxbrew/bin/brew ] || NONINTERACTIVE=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; /home/linuxbrew/.linuxbrew/bin/brew install bun mise; [ -d ~/dotfiles ] || git clone https://github.com/fuyutarow/dotfiles ~/dotfiles; /home/linuxbrew/.linuxbrew/bin/bun ~/dotfiles/scripts/linux-init.ts'
chsh -s "$(command -v zsh)" "$U"
