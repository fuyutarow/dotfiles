# dotfiles

## setup
### Shell
```
./update.sh
source ~/.bashrc
```

### Vim plugins install
```
mkdir -p ~/.vim/bundle
git clone https://github.com/gmarik/Vundle.vim.git ~/.vim/bundle/Vundle.vim
```

Then, `:PluginInstall` on vim console.

### Anaconda environment
```
wget https://repo.continuum.io/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh
rm Miniconda3-latest-Linux-x86_64.sh
```

### Jupyter envirionment
```
pip install -U https://github.com/ipython-contrib/jupyter_contrib_nbextensions/tarball/master
pip install -U jupyter
jupyter notebook --generate-config
echo """
c.IPKernelApp.pylab = 'inline'
c.NotebookApp.ip = '*'
c.NotebookApp.open_browser = False
c.NotebookApp.port = 8888
# c.NotebookApp.kernel_spec_manager_class = 'environment_kernels.EnvironmentKernelSpecManager'
c.EnvironmentKernelSpecManager.conda_env_dirs = ['/anaconda_path/envs']
""" >> ~/.jupyter/jupyter_notebook_config.py
jupyter notebook password
```

#### nbextensions
```
jupyter contrib nbextension install --user
```

#### vim bindings
```
# Create required directory in case (optional)
mkdir -p $(jupyter --data-dir)/nbextensions
# Clone the repository
cd $(jupyter --data-dir)/nbextensions
git clone https://github.com/lambdalisue/jupyter-vim-binding vim_binding
# Activate the extension
jupyter nbextension enable vim_binding/vim_binding
```

### SSH envirioment
Setup .ssh

### keyhac install
<a href='https://sites.google.com/site/craftware/keyhac-en'>keyhac</a>

```
sudo apt install fortune cowsay lolcat fortune-mod
```

