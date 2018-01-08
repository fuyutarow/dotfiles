for f in $(ls -A | egrep -v ".gitconfig|README.md|.git|check.sh") ; do
  diff -u $f $HOME/$f | grep -v "^Only in"
done 
