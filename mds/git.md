# Git
```sh
git config --list
git config remote.origin.url
```


Let `alias g=git` in [aliases](../.bash_aliases)


## Flow
1. Add and comment
  ```sh
  g acm 'Update README'
  ```
1. View GitHub.com
  ```sh
  g o
  ```

## Examples
aliases in [gitconfig](../.gitconfig)

- `git ls-files | xargs cloc`

  ```
       72 text files.
  classified 72 files      71 unique files.                              
        14 files ignored.

  github.com/AlDanial/cloc v 1.80  T=0.09 s (621.8 files/s, 23326.6 lines/s)
  --------------------------------------------------------------------------------
  Language                      files          blank        comment           code
  --------------------------------------------------------------------------------
  Markdown                          5             68              0            434
  TeX                               6             82            152            269
  Bourne Shell                     18             25             54            168
  Python                            7             50             14            146
  JavaScript                        4             42             73            137
  IPython Notebook                  2              0              0            131
  Bourne Again Shell                1             15             10             81
  vim script                        7             13             26             68
  zsh                               6              3             11             56
  Lua                               1              2              0             27
  Perl                              1              3              1             15
  --------------------------------------------------------------------------------
  SUM:                             58            303            341           1532
  --------------------------------------------------------------------------------
  ```
