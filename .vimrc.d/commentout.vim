call add(PLUGIN_LIST, 'fuyutarow/commentout.vim')

augroup commentout_settings
  autocmd FileType vue let b:comment_leader = '<!-- '
  autocmd FileType vue let b:comment_trailer = ' -->'
augroup End
