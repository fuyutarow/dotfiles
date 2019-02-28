#!/bin/bash local _user
_user="$(git config --global user.name)"
curl -s "https://api.github.com/users/$_user/repos?per_page=100"|grep \"full_name\"|cut -d'"' -f4
