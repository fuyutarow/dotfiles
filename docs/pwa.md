
[pwa-icon-gen](//github.com/ChrisBrownie55/pwa-icon-gen)

```sh
pwa-icon-gen logo.png --out=img/icons --sizes=32,152,192,512
ffmpeg -i img/icons/32x32.png favicon.ico
pushd img/icons
mv 32x32.png favicon-32x32.png
convert 152x152.png safari-pinned-tab.svg
popd
```

[favicon-chcker](//realfavicongenerator.net/favicon_checker)
