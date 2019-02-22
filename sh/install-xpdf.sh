#!/bin/sh

brew install xpdf

# brew install xpdf-japanese
pushd ~/Downloads
wget https://xpdfreader-dl.s3.amazonaws.com/xpdf-japanese.tar.gz -O xpdf-japanese.tar.gz
tar -zxvf xpdf-japanese.tar.gz
cd xpdf-japanese
ln -s /usr/local/opt/xpdf/share/ /usr/local/share/xpdf # xpdf/share へのシンボリックリンクを作成
mkdir /usr/local/share/xpdf/japanese                   # japanese ディレクトリを作成
cp -r * /usr/local/share/xpdf/japanese                 # xpdf-japanese の中身をコピー
cat /usr/local/share/xpdf/japanese/add-to-xpdfrc >> /usr/local/etc/xpdfrc # xpdfrc に追記
popd
