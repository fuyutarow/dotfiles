let PLUGIN_LIST = []


" let filelist = glob("~/.vimrc.d/*")
" let filelist = split(filelist, "\n")
" for file in filelist
" 	source file
" endfor
source ~/.vimrc.d/formater.vim
source ~/.vimrc.d/markdown.vim
source ~/.vimrc.d/alias.vim
source ~/.vimrc.d/indent.vim
source ~/.vimrc.d/color.vim
source ~/.vimrc.d/completion.vim


"-------------------------------------------------------------------------------
" Vundle init
"-------------------------------------------------------------------------------
set nocompatible              " be iMproved, required
filetype off                  " required
set rtp+=~/.vim/bundle/Vundle.vim
call vundle#begin()
	Plugin 'VundleVim/Vundle.vim'
	for plugin in PLUGIN_LIST
		Plugin plugin
	endfor
call vundle#end()
filetype plugin indent on
