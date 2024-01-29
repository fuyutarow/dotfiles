call add(PLUGIN_LIST, 'fuyutarow/commentout.vim')

augroup commentout_settings
  autocmd BufRead,BufNewFile *.v let b:comment_leader = '// '
  autocmd BufRead,BufNewFile *.py let b:comment_leader = '# '
  autocmd FileType javascript,go let b:comment_leader = '// '
  autocmd FileType vue let b:comment_leader = '<!-- '
  autocmd FileType vue let b:comment_trailer = ' -->'
augroup End
