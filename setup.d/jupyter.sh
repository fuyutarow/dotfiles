: ### install jupyter
pip install jupyter_contrib_nbextensions
jupyter contrib nbextension install --user

: ### vim bindings
# Create required directory in case (optional)
mkdir -p $(jupyter --data-dir)/nbextensions
(
    # Clone the repository
    cd $(jupyter --data-dir)/nbextensions
    git clone https://github.com/lambdalisue/jupyter-vim-binding vim_binding
    # Activate the extension
    jupyter nbextension enable vim_binding/vim_binding
    jupyter nbextension enable zenmode/main
)
