git filter-branch --commit-filter '
  if [ "$GIT_COMMITTER_NAME" = "sktnkysh" ];
  then
          GIT_COMMITTER_NAME="fuyutarow";
          GIT_AUTHOR_NAME="fuyutarow";
          GIT_COMMITTER_EMAIL="fuyutarow@gmail.com";
          GIT_AUTHOR_EMAIL="fuyutarow@gmail.com";
          git commit-tree "$@";
  else
          git commit-tree "$@";
  fi' HEAD
