set number
set tabstop=2
"set autoindent
"set smartindent
set expandtab
set softtabstop=2
set shiftwidth=2 
set clipboard=unnamed,autoselect
set fileformats=unix,dos,mac


augroup fileTypeIndent
    autocmd!
    autocmd BufNewFile,BufRead *.py setlocal tabstop=4 softtabstop=4 shiftwidth=4
    autocmd BufNewFile,BufRead *.md setlocal tabstop=4 softtabstop=4 shiftwidth=4
    autocmd BufNewFile,BufRead *.apib setlocal tabstop=4 softtabstop=4 shiftwidth=4
    autocmd BufNewFile,BufRead *.rb setlocal tabstop=2 softtabstop=2 shiftwidth=2
    autocmd BufNewFile,BufRead *.ts setlocal tabstop=2 softtabstop=2 shiftwidth=2
    autocmd BufNewFile,BufRead *.vue setlocal tabstop=2 softtabstop=2 shiftwidth=2
augroup END
