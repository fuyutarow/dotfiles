set number
set tabstop=2
"set autoindent
"set smartindent
set expandtab
set softtabstop=2
set shiftwidth=2 
set clipboard=unnamed,autoselect


autocmd FileType css setlocal omnifunc=csscomplete#CompleteCSS
autocmd FileType html,markdown setlocal omnifunc=htmlcomplete#CompleteTags
autocmd FileType javascript setlocal omnifunc=javascriptcomplete#CompleteJS
autocmd FileType python setlocal omnifunc=pythoncomplete#Complete
autocmd FileType xml setlocal omnifunc=xmlcomplete#CompleteTags
autocmd FileType coffee setlocal sw=2 sts=2 ts=2 et

augroup fileTypeIndent
    autocmd!
    autocmd BufNewFile,BufRead *.py setlocal tabstop=4 softtabstop=4 shiftwidth=4
    autocmd BufNewFile,BufRead *.apib setlocal tabstop=4 softtabstop=4 shiftwidth=4
    autocmd BufNewFile,BufRead *.rb setlocal tabstop=2 softtabstop=2 shiftwidth=2
augroup END


nnoremap <F2> :set invpaste paste?<CR>
set pastetoggle=<F2>
set showmode

"-------------------------------------------------------------------------------
" window 
"-------------------------------------------------------------------------------
" split window
nmap ss :split<Return><C-w>w
nmap sv :vsplit<Return><C-w>w
" Move window
nmap <Space> <C-w>w
map s<left> <C-w>h
map s<up> <C-w>k
map s<down> <C-w>j
map s<right> <C-w>l
map sh <C-w>h
map sk <C-w>k
map sj <C-w>j
map sl <C-w>l
" Resize window
nmap <C-w><left> <C-w><
nmap <C-w><right> <C-w>>
nmap <C-w><up> <C-w>+
nmap <C-w><down> <C-w>-




"-------------------------------------------------------------------------------
" Vundle 
"-------------------------------------------------------------------------------
set nocompatible              " be iMproved, required
filetype off                  " required

" set the runtime path to include Vundle and initialize
set rtp+=~/.vim/bundle/Vundle.vim
call vundle#begin()
" alternatively, pass a path where Vundle should install plugins
"call vundle#begin('~/some/path/here')

" let Vundle manage Vundle, required
Plugin 'VundleVim/Vundle.vim'

" The following are examples of different formats supported.
" Keep Plugin commands between vundle#begin/end.
" plugin on GitHub repo
Plugin 'tpope/vim-fugitive'
" plugin from http://vim-scripts.org/vim/scripts.html
" Plugin 'L9'
" Git plugin not hosted on GitHub
Plugin 'git://git.wincent.com/command-t.git'
" git repos on your local machine (i.e. when working on your own plugin)
Plugin 'file:///home/gmarik/path/to/plugin'
" The sparkup vim script is in a subdirectory of this repo called vim.
" Pass the path to set the runtimepath properly.
Plugin 'rstacruz/sparkup', {'rtp': 'vim/'}
" Install L9 and avoid a Naming conflict if you've already installed a
" different version somewhere else.
" Plugin 'ascenator/L9', {'name': 'newL9'}

" All of your Plugins must be added before the following line
call vundle#end()            " required
filetype plugin indent on    " required



"-------------------------------------------------------------------------------
" Google Code Format 
"-------------------------------------------------------------------------------
call vundle#begin()
" Add maktaba and codefmt to the runtimepath.
" (The latter must be installed before it can be used.)
Plugin 'google/vim-maktaba'
Plugin 'google/vim-codefmt'
Plugin 'leafgarland/typescript-vim'
" Also add Glaive, which is used to configure codefmt's maktaba flags. See
" `:help :Glaive` for usage.
Plugin 'google/vim-glaive'
Plugin 'kana/vim-smartinput'
Plugin 'cohama/lexima.vim'

Plugin 'Shougo/unite.vim'
Plugin 'Shougo/vimfiler'
Plugin 'Shougo/neocomplcache'
" ...
call vundle#end()

" Shift + F で自動修正
nnoremap <S-f> :FormatCode<CR>


"-------------------------------------------------------------------------------
" Autopep8
"-------------------------------------------------------------------------------

""" original http://stackoverflow.com/questions/12374200/using-uncrustify-with-vim/15513829#15513829
""function! Preserve(command)
""    " Save the last search.
""    let search = @/
""    " Save the current cursor position.
""    let cursor_position = getpos('.')
""    " Save the current window position.
""    normal! H
""    let window_position = getpos('.')
""    call setpos('.', cursor_position)
""    " Execute the command.
""    execute a:command
""    " Restore the last search.
""    let @/ = search
""    " Restore the previous window position.
""    call setpos('.', window_position)
""    normal! zt
""    " Restore the previous cursor position.
""    call setpos('.', cursor_position)
""endfunction
""
""function! Autopep8()
""    call Preserve(':silent %!autopep8 -')
""endfunction
""
""" Shift + F で自動修正
""autocmd FileType python nnoremap <S-f> :call Autopep8()<CR>


"""-------------------------------------------------------------------------------
""" Completion
"""-------------------------------------------------------------------------------
""
""" Parenthesis
""inoremap { {}<LEFT>
""inoremap [ []<LEFT>
"""inoremap ( ()<LEFT>
""inoremap ( ()<ESC>i
""inoremap " ""<LEFT>
""inoremap ' ''<LEFT>
""vnoremap { "zdi^V{<C-R>z}<ESC>
""vnoremap [ "zdi^V[<C-R>z]<ESC>
""vnoremap ( "zdi^V(<C-R>z)<ESC>
""vnoremap " "zdi^V"<C-R>z^V"<ESC>
""vnoremap ' "zdi'<C-R>z'<ESC>
""
""function! DeleteParenthesesAdjoin() " http://qiita.com/m_mysht/items/56e5d5a17d07a64d8b65
""    let pos = col(".") - 1
""    let str = getline(".")
""    let parentLList = ["(", "[", "{", "\'", "\""]
""    let parentRList = [")", "]", "}", "\'", "\""]
""    let cnt = 0
""
""    let output = ""
""
""    if pos == strlen(str)
""        return "\b"
""    endif
""    for c in parentLList
""        if str[pos-1] == c && str[pos] == parentRList[cnt]
""            call cursor(line("."), pos + 2)
""            let output = "\b"
""            break
""        endif
""        let cnt += 1
""    endfor
""    return output."\b"
""endfunction
""inoremap <silent> <BS> <C-R>=DeleteParenthesesAdjoin()<CR>
""inoremap <silent> <C-h> <C-R>=DeleteParenthesesAdjoin()<CR>
""
""
""nnoremap ^ I
""nnoremap $ A

"-------------------------------------------------------------------------------
" neocomplcache
"-------------------------------------------------------------------------------
""highlight Pmenu ctermbg=4
""highlight PmenuSel ctermbg=1
""highlight PMenuSbar ctermbg=4
""
""" 補完ウィンドウの設定
""set completeopt=menuone
""
""" 補完ウィンドウの設定
""set completeopt=menuone
""
""" rsenseでの自動補完機能を有効化
""let g:rsenseUseOmniFunc = 1
""" let g:rsenseHome = '/usr/local/lib/rsense-0.3'
""
""" auto-ctagsを使ってファイル保存時にtagsファイルを更新
""let g:auto_ctags = 1
""
""" 起動時に有効化
""let g:neocomplcache_enable_at_startup = 1
""
""" 大文字が入力されるまで大文字小文字の区別を無視する
""let g:neocomplcache_enable_smart_case = 1
""
""" _(アンダースコア)区切りの補完を有効化
""let g:neocomplcache_enable_underbar_completion = 1
""
""let g:neocomplcache_enable_camel_case_completion  =  1
""
""" 最初の補完候補を選択状態にする
""let g:neocomplcache_enable_auto_select = 1
""
""" ポップアップメニューで表示される候補の数
""let g:neocomplcache_max_list = 20
""
""" シンタックスをキャッシュするときの最小文字長
""let g:neocomplcache_min_syntax_length = 3
""
""let g:neocomplcache_lock_buffer_name_pattern = '\*ku\*'
""
""" Define dictionary.
""let g:neocomplcache_dictionary_filetype_lists = {
""    \ 'default' : ''
""    \ }
""
""" Plugin key-mappings.
""inoremap <expr><C-g>     neocomplcache#undo_completion()
""inoremap <expr><C-l>     neocomplcache#complete_common_string()
""
""" Recommended key-mappings.
""" <CR>: close popup and save indent.
""inoremap <silent> <CR> <C-r>=<SID>my_cr_function()<CR>
""function! s:my_cr_function()
""  return neocomplcache#smart_close_popup() . "\<CR>"
""endfunction
""" <TAB>: completion.
""inoremap <expr><TAB>  pumvisible() ? "\<C-n>" : "\<TAB>"
""" <C-h>, <BS>: close popup and delete backword char.
""inoremap <expr><C-h> neocomplcache#smart_close_popup()."\<C-h>"
""inoremap <expr><BS> neocomplcache#smart_close_popup()."\<C-h>"
""inoremap <expr><C-y>  neocomplcache#close_popup()
""inoremap <expr><C-e>  neocomplcache#cancel_popup()
""
""" 補完の設定
""autocmd FileType ruby setlocal omnifunc=rubycomplete#Complete
""if !exists('g:neocomplete#force_omni_input_patterns')
""  let g:neocomplete#force_omni_input_patterns = {}
""endif
""let g:neocomplete#force_omni_input_patterns.ruby = '[^.*\t]\.\w*\|\h\w*::'
""
""if !exists('g:neocomplete#keyword_patterns')
""        let g:neocomplete#keyword_patterns = {}
""endif
""let g:neocomplete#keyword_patterns['default'] = '\h\w*'