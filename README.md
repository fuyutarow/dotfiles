# dotfiles

## Setup

### Run shell
```sh
sh sh/***.sh
. sh/***.sh
./sh/***.sh
sh/***.sh
```

### Arange dotfiles
[sh/lns.sh](sh/lns.sh)


### SSH envirioment
```sh
ln -s ~/Gdrive/ssh/config ~/.ssh
```

### Aliases
[aliases](aliases.sh)

### Vim plugins install
[sh/setup-vim.sh](sh/setup-vim.sh)

Then, `:PluginInstall` on vim console.


### Anaconda environment
```
wget https://repo.continuum.io/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh
rm Miniconda3-latest-Linux-x86_64.sh
```


### Jupyter envirionment
[sh/setup-jupyter.sh](sh/setup-jupyter.sh)

- nbextensions
  ```
  pip install jupyter_contrib_nbextensions
  jupyter contrib nbextension install --user
  ```
- vim bindings
  ```sh
  # Create required directory in case (optional)
  mkdir -p $(jupyter --data-dir)/nbextensions
  # Clone the repository
  cd $(jupyter --data-dir)/nbextensions
  git clone https://github.com/lambdalisue/jupyter-vim-binding vim_binding
  # Activate the extension
  jupyter nbextension enable vim_binding/vim_binding
  ```

### Keyhac install
[Keyhac](https://sites.google.com/site/craftware/keyhac-en)


```sh
sudo apt install fortune cowsay lolcat fortune-mod
```


## Env
### Markdown
Ref. [GitHub Flavored Markdwon Spac](https://github.github.com/gfm/)

- two spaces indent
  [.vimrc.d/indent.vim](.vimrc.d/indent.vim)

### Python
- [Anaconda](https://www.anaconda.com/distribution/)
- [Pipenv](https://pipenv.readthedocs.io/en/latest/)
 

### [TeX](TeX)

### [Rust](mds/rust.md)


### Aliases

[.env.d/start.env](.env.d/start.env)
```sh
chrome
start slack
```


## Tools
### Web browser
- [Vivaldi](https://vivaldi.com/)
  : Best web browser
- [Brave](https://brave.com)
  : Best YouTube Player
- [Chrome Canary](https://www.google.com/chrome/canary/)
  : When use Gdocs, Gsheet or Gdrive.


### Text editer
- Vim
  : Best editer for programming.
- [VS Code](https://code.visualstudio.com)
  : Vim keybinding.
- [Atom](https://atom.io)
  : for edit TeX.  Emacs keybinding. 日本語を編集するときはIMEとの兼ね合いでemacsの方が楽ね.



