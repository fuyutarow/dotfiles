
# Python

```sh
brew install pyenv pipenv
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

### What's conda

- List envs
  ```sh
  conda info -e
  ```
- Remove unused env
  ```sh
  conda info -e
  ```
- Remove unnecessary packages and cache
  ```sh
  conda clean --all
  ```

### What's pipenv


`alias pi=pipenv` in [aliases](../aliases)

- `pipenv shell`
- `pipenv install`
- `pipenv install -d`
- `pipenv lock -r > requirementes.txt`
- `pipenv run <command>`


### What's pip

- `pip install -r requirements.txt`
