```sh
brew cask install chromium
```


## Distribution

1. Make binary file and git repo.
```
.
├── README.md
├── bin
│   ├── cleard # In fact, bash file. cleard.sh
│   ├── commad
│   ├── listd
│   ├── nextd
│   ├── prevd
│   └── stackd
└── commad.png
```

2. Push repo to GitHub **with tag**.
```sh
git tag 2019.09.05
git push --tags
```

3. Create Formula templete and edit it.
```sh
brew create "https://github.com/fuyutarow/commad/archive/2019.09.05.tar.gz"
```

4. Make homebrew-<package> repo.

5. Install
```sh
brew install <user>/<package>/<package>
```
or
```sh
brew tap <user>/<package>/<package>
brew install <package>
```

