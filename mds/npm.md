 7350* mv firebaseConfig-example.json example.firebaseConfig.json
 7351* mv example.firebaseConfig.json example-firebaseConfig.json
 7353* cat example-firebaseConfig.json >> README.md
 7355* cat example-firebaseConfig.json
 7356* node index.js example-firebaseConfig.json --prefix=VUE_APP_
 7357* cat example-firebaseConfig.env
 7358* cat example-firebaseConfig.env>> README.md
 7360* e 'cat example-firebaseConfig.env' >> README.md
 7361  vi README.md
 7363* gs
 7365* rm example-firebaseConfig.env
 7367* g d
 7368  g s
 7369  npm set init.author.name "fuyutarow"
 7370  npm set init.author.email "fuyutarow@gmail.com"
 7371  npm set init.author.url "fuyutarow.github.io"
 7372  npm adduser
 7373  npm login
 7374  npm publish
 7375  h | tail -20
