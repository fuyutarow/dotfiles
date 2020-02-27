#!/usr/bin/perl

$latex         = 'uplatex -synctex=1 -halt-on-error -shell-escape';
$latex_silent  = 'uplatex -synctex=1 -halt-on-error -interaction=batchmode -shell-escape';
$bibtex        = 'upbibtex';
$dvipdf        = 'dvipdfmx %O -o %D %S';
$makeindex     = 'mendex %O -o %D %S';
$max_repeat    = 5;
$pdf_mode      = 3;
$pvc_view_file_via_temporary = 0;
$clean_ext = 'aux aux.bak bbl bcf blg dvi synctex.gz';
# , **/*.fdb_latexmk, **/*.fls, **/*.idx, **/*.idx.bak, **/*.ilg, **/*.ind, **/*.lof, **/*.log, **/*.lol, **/*.lot, **/*.nav, **/*.out, **/*.pdf, **/*.ps, **/*.snm, **/*.synctex.gz, **/*.toc, /**/_minted-{jobname}, /{output_dir}/sage-plots-for-{jobname}.tex, /missfont.log, /texput.log, /texput.aux';
#
# output dir
# ----------
$aux_dir          = "build/";
$out_dir          = "build/";


if ($^O eq 'darwin') {
    $pdf_previewer = 'open -a Preview';
} elsif ($^O eq 'linux') {
    $pdf_previewer = 'evince';
}
