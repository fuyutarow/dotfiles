
e $(uname) in 
  "Linux")
    echo Linux
    ;;
  "Darwin")
    echo Darwin
    ;;
  *)
    echo not supported OS
    ;;
esac


- ssh
  ```sh
  ssh-copy-id -i ~/.ssh/mykey user@host
  ```

```sh
sudo apt install build-essential curl file git
```


[init.d/brew.sh](../init.d/brew.sh)

Ref. [LinuxBrew](https://docs.brew.sh/Homebrew-on-Linux)

