# dotfiles

## Setup
```sh
./sh/lns.sh
```

### SSH envirioment
cat ~/Gdrive/ssh/config > ./ssh/config


### Vim plugins install
```sh
./sh/setup-vim.sh
```
Then, `:PluginInstall` on vim console.
[sh/setup-vim.sh](sh/setup-vim.sh)


### Anaconda environment
```
wget https://repo.continuum.io/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh
rm Miniconda3-latest-Linux-x86_64.sh
```


### Jupyter envirionment
```sh
./sh/setup-jupyter.sh
```
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

- two indent
  [.vimrc.d/indent.vim](.vimrc.d/indent.vim)


