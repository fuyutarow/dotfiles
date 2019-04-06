
- create user
  ```sh
  addser username
  usermod -aG sudo username
  ```

- ssh
  ```sh
  ssh-copy-id -i ~/.ssh/mykey user@host
  ```

```sh
sudo apt install build-essential curl file git
```


[init.d/brew.sh](../init.d/brew.sh)
```sh
ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"

sh -c "$(curl -fsSL https://raw.githubusercontent.com/Linuxbrew/install/master/install.sh)"
eval $(/home/linuxbrew/.linuxbrew/bin/brew shellenv)
```

Ref. [LinuxBrew](https://docs.brew.sh/Homebrew-on-Linux)

