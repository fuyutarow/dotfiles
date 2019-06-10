autocmd FileType c,cpp,java,scala,rust let b:comment_leader = '// '
autocmd FileType sh,ruby,python let b:comment_leader = '# '
autocmd FileType conf,fstab let b:comment_leader = '# '
autocmd FileType tex let b:comment_leader = '% '
autocmd FileType mail let b:comment_leader = '> '
autocmd FileType vim let b:comment_leader = '" '

noremap <silent> .. :<C-B>silent <C-E>s/\(^\s*\)\(.\+\)/\1<C-R>=escape(b:comment_leader,'\/')<CR>\2/<CR>:nohlsearch<CR>
noremap <silent> ,, :<C-B>silent <C-E>s/\(^\s*\)\V<C-R>=escape(b:comment_leader,'\/')<CR>/\1/e<CR>:nohlsearch<CR>


function! Commentout() range
	let lines = getline(a:firstline, a:lastline)
	
	let min_indent = 1000
	for linetext in lines
		if linetext != ""
			let indent = matchend(linetext, '^\s*')
			let min_indent = min_indent < indent? min_indent: indent
		endif
	endfor

	let i = 0
	for linetext in lines
		let newline =  substitute(linetext, '\(^\s\{'.min_indent.'\}\)', '\1'.b:comment_leader, '')
		call setline(line("'<")+i, newline)
		let i = i +1
	endfor
endfunction

command! -range Commentout <line1>,<line2>call Commentout() 
vmap <silent> .. :Commentout<CR>
