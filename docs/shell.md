

Redirect
```sh
echo error 1>&2
```

```sh
echo error 2>&1
```

パスが存在するか
if [ -e ./test ]; then

ファイルが存在するか
if [ -f ./test ]; then

ディレクトリが存在するか
if [ -d ./test ]; then

リンクが存在するか
if [ -L ./test ]; then

空ファイルではないか
if [ -s ./test ]; then

ファイルが書込可能か
if [ -w ./test ]; then

ファイルが実行可能か
if [ -x ./test ]; then
