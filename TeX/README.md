# TeX

## Overview
[mactex](http://www.tug.org/mactex/)

- common usepackage and setting
  : [packages.tex](packages.tex)
- configuration for slides with beamer
  : [slides.config.tex](sliedes.config.tex)
- configuration for book with jsbook
  : [book.config.tex](book.config.tex)
- configuration for note with jsarticle
  : [note.config.tex](note.config.tex)


### packages
view Package documentation
- [xparse](https://ctan.org/pkg/xparse?lang=en)
- [physics](https://ctan.org/pkg/physics?lang=en)
- [fancyhdr](https://ctan.org/pkg/fancyhdr?lang=en)


## setup
```sh
ln ~/dotfiles/.latexmkrc .
ln ~/dotfiles/TeX/note.config.tex .
```

## Usage
1. Copy template.tex
  ```sh
  cat note.tmpl.tex > note.`date +%Y%m%d`.tex
  latex -pvc note.`date +%Y%m%d`.tex
  ```
1. Edit
  ```sh
  atom note.20190220.tex
  ```
1. Complile on changing tex
  ```sh
  latexmk -pvc note.20190220.tex
  ```
  let `alias x=latexmk; alias xx=latexmk -pvc`
1. Clean
  ```sh
  latexmk -c
  ```
  let `alias xc=latexmk -c`


## What's tlmgr
tlmgr or TeX Live package Manager

- update
  ```sh
  tlmgr update --self -all
  ```


### What's latexmk
```sh
latexmk -pvc target.tex
latexmk -c
```

## [PDFMiner.six](https://github.com/pdfminer/pdfminer.six)
### install
```sh
pip install pdfminer.six
```

### usage
```sh
pdf2txt.py ***.pdf
```
`alias pdf2txt`[aliase](../aliases)
