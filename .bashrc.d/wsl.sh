# for WSL
alias mnt-d='sudo mount -t drvfs D: /mnt/d'
alias start='cmd.exe /c start'
 
google_translate() {
  local str opt cond
 
  if [ $# != 0 ]; then
    str=`echo $1 | sed -e 's/  */+/g'` # 1文字以上の半角空白を+に変換
    cond=$2
    if [ $cond = "ja-en" ]; then
      # ja -> en 翻訳
      opt='?hl=ja&sl=ja&tl=en&ie=UTF-8&oe=UTF-8'
    else
      # en -> ja 翻訳
      opt='?hl=ja&sl=en&tl=ja&ie=UTF-8&oe=UTF-8'
    fi
  else
    opt='?hl=ja&sl=en&tl=ja&ie=UTF-8&oe=UTF-8'
  fi
 
  opt="${opt}&text=${str}"
  w3m +13 "http://translate.google.com/${opt}"
}

enja() {
  google_translate "$*" "en-ja"
}
 
# w3m でGoogle translate Japanese->English
jaen() {
  google_translate "$*" "ja-en"
}

google() {
local str opt
if [ $ != 0 ]; then
for i in $*; do
str="$str+$i"
done
str=`echo $str | sed 's/^\+//'`
opt='search?num=50&amp;hl=ja&amp;lr=lang_ja'
opt="${opt}&amp;q=${str}"
fi
w3m http://www.google.co.jp/$opt
}
 
alc() {
if [ $ != 0 ]; then
w3m "http://eow.alc.co.jp/$*/UTF-8/?ref=sa"
else
w3m "http://www.alc.co.jp/"
fi
}
