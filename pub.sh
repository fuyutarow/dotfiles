#!/bin/sh
for markdown in $(ls ./*.md); do
  pandoc $markdown -s --self-contained -t html5  -o ${markdown%.*}.html
  echo ${markdown%.*}.html
done
