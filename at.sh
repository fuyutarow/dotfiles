git filter-branch --commit-filter '
  if [ "$GIT_COMMITTER_NAME" = "<old cn>" ];
  then
          GIT_COMMITTER_NAME="<new cn>";
          GIT_AUTHOR_NAME="<new an>";
          GIT_COMMITTER_EMAIL="<new ae>";
          GIT_AUTHOR_EMAIL="<new ae>";
          git commit-tree "$@";
  else
          git commit-tree "$@";
  fi' HEAD
