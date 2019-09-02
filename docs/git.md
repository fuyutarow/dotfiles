# Git
```sh
git config --list
git config remote.origin.url
```


Let `alias g=git` in [aliases](../.aliases)


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

- `git log -10 --graph --date=iso  --pretty=format:'- %C(blue)|%C(yellow)%h%C(blue)| %C(green)%<(8,trunc)%cn %C(blue)| %Creset%<(39,trunc)%s %C(blue)| %cd' --decorate=short`
  ```
  * - |f2b2d60| fuyuta.. | Add 'g ll' in gitconfig                 | 2019-02-22 09:51:17 +0900
  * - |720e906| fuyuta.. | Add $_ostype in end.d/start             | 2019-02-22 09:44:52 +0900
  * - |670ea2d| fuyuta.. | Rename bash_aliases -> aliases          | 2019-02-22 09:42:32 +0900
  * - |b522815| fuyuta.. | Add mds/git                             | 2019-02-20 08:34:38 +0900
  * - |55a2bba| fuyuta.. | Add Tex/README                          | 2019-02-20 08:09:15 +0900
  *   - |5679edd| fuyuta.. | Merge                                   | 2019-02-20 07:20:25 +0900
  |\  
  | * - |3d32094| fuyuta.. | Add latexmkrc                           | 2019-02-19 15:43:01 +0900
  * | - |7425095| fuyuta.. | Update README                           | 2019-02-20 07:17:31 +0900
  * | - |5ff6ca8| fuyuta.. | Add img in TeX/packages                 | 2019-02-19 19:21:02 +0900
  * | - |6136300| fuyuta.. | Add note.config.tex                     | 2019-02-19 18:35:11 +0900
  ```


# git init

…or create a new repository on the command line
```sh
echo "# tmp" >> README.md
git init
git add README.md
git commit -m "first commit"
git remote add origin https://github.com/fuyutarow/tmp.git
git push -u origin master
```

…or push an existing repository from the command line
```sh
git remote add origin https://github.com/fuyutarow/tmp.git
git push -u origin master
```

…or import code from another repository
You can initialize this repository with code from a Subversion, Mercurial, or TFS project.

```sh
git submodule add 
```
