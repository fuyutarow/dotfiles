export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"

source $HOME/.poetry/env

export PIPENV_VENV_IN_PROJECT=true

alias f8='flake8'
alias juno='jupyter notebook'
alias pyju='python -m py2nb' #<input.py> <output.ipynb>
alias jupyter-kernelspec-list='jupyter kernelspec list'
jupy() {
  jupyter nbconvert --to=python $1
  yapf -i ${1/.ipynb/.py}
}

juju() {
  jupyter nbconvert --to script $1
}
