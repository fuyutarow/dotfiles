#!/bin/sh

n=0
for markdown in $(ls ./*.md); do
  if [ -f ${markdown%.*}.html ]; then
    : 
  else
    ((n++))
  fi
done

i=1
for markdown in $(ls ./*.md); do
  if [ -f ${markdown%.*}.html ]; then
    echo ${markdown%.*}.html exists.
  else
    pandoc $markdown -s --self-contained -t html5 -o ${markdown%.*}.html
    echo [$((i++))/$n] ${markdown%.*}.html 
  fi
done
