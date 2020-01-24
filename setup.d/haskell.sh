brew install zeromq libmagic cairo pkg-config haskell-stack pango
git clone https://github.com/gibiansky/IHaskell
cd IHaskell
pip install -r requirements.txt
# stack install gtk2hs-buildtools # Disabled for now because gtk2hs-buildtools doesn't work with lts-13 yet
stack install --fast
ihaskell install --stack
