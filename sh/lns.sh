ln -s dotfiles/.bashrc ~
ln -s dotfiles/.bashrc.d ~
ln -s dotfiles/.bash_aliases ~
ln -s dotfiles/.vimrc ~
ln -s dotfiles/.tmuxrc ~

ln -s dotfiles/.gitconfig ~
ln -s dotfiles/.comment_examples.md ~

ln -s dotfiles/.jsbeautifyrc ~ 

rm -i $HOME/.zshrc
ln -s dotfiles/.zshrc ~
