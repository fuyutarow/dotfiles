let mapleader = ","

if &compatible
  set nocompatible
endif

" Add the dein installation directory into runtimepath
set runtimepath+=~/.cache/dein/repos/github.com/Shougo/dein.vim

if dein#load_state('~/.cache/dein')
  call dein#begin($HOME . '/.cache/dein')

  let s:toml_dir  = $HOME . '/.config/nvim' 
  let s:toml      = s:toml_dir . '/dein.toml'
  let s:lazy_toml = s:toml_dir . '/dein_lazy.toml'

  call dein#load_toml(s:toml,      {'lazy': 0})
  call dein#load_toml(s:lazy_toml, {'lazy': 1})

  call dein#end()
  call dein#save_state()
endif

filetype plugin indent on
syntax enable

set ignorecase
set smartcase
set wrapscan
set incsearch
set inccommand=split

set tabstop=4
set shiftwidth=4
set softtabstop=0
set expandtab
set smarttab
set shiftround

nnoremap <C-space> <C-p>

inoremap <silent> jj <ESC>:<C-u>w<CR>


inoremap <C-d> <Del>

" change
" ======
nnoremap cx ciw

" bracket
" =======
nnoremap <Leader>s" ciw""<Esc>P
nnoremap <Leader>s' ciw''<Esc>P
nnoremap <Leader>s` ciw``<Esc>P
nnoremap <Leader>s( ciw()<Esc>P
nnoremap <Leader>s{ ciw{}<Esc>P
nnoremap <Leader>s[ ciw[]<Esc>P

" Edit .sh
"-------------------------------------------------------------------------------
autocmd FileType sh :noremap R :.w !$SHELL<Return>

"-------------------------------------------------------------------------------
" Enable alias.sh
"-------------------------------------------------------------------------------
set shell=/bin/bash\ -l\ -O\ expand_aliases

"-------------------------------------------------------------------------------
" Split window
"-------------------------------------------------------------------------------
" split window
nmap vs :vsplit<Return><C-w>w

"-------------------------------------------------------------------------------
" Move window
"-------------------------------------------------------------------------------
" nmap <Space> <C-w>w
map s<left> <C-w>h
map s<up> <C-w>k
map s<down> <C-w>j
map s<right> <C-w>l
map sh <C-w>h
map sk <C-w>k
map sj <C-w>j
map sl <C-w>l

"-------------------------------------------------------------------------------
" Resize window
"-------------------------------------------------------------------------------
nmap <C-w><left> <C-w><
nmap <C-w><right> <C-w>>
nmap <C-w><up> <C-w>+
nmap <C-w><down> <C-w>-

"-------------------------------------------------------------------------------
" Save
"-------------------------------------------------------------------------------
nmap W :w
nmap ; :!
" nmap <C-b> :!make<CR>

"-------------------------------------------------------------------------------
" Linebreak
"-------------------------------------------------------------------------------
nnoremap K i<CR><Esc>
map K i<Enter><Esc>

" Move in insert mode
" ===================
inoremap <C-a> <C-o>^
inoremap <C-e> <C-o>$
