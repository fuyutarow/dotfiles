#!/bin/bash

# tmux window name generator with smart project detection
# Usage: set-option -g automatic-rename-format '#(~/dotfiles/tmux-window-name.sh "#{pane_current_path}")'

CURRENT_PATH="$1"
PROJECT_NAME=""
GIT_BRANCH=""

# Function to get project name from various config files
get_project_name() {
  local path="$1"

  # Check common project files in order of preference
  if [[ -f "$path/package.json" ]]; then
    # Node.js project
    PROJECT_NAME=$(jq -r '.name // empty' "$path/package.json" 2> /dev/null)
    [[ -n $PROJECT_NAME && $PROJECT_NAME != "null" ]] && return
  fi

  if [[ -f "$path/Cargo.toml" ]]; then
    # Rust project
    PROJECT_NAME=$(grep -E '^name\s*=' "$path/Cargo.toml" | head -1 | sed 's/.*=\s*"\([^"]*\)".*/\1/' 2> /dev/null)
    [[ -n $PROJECT_NAME ]] && return
  fi

  if [[ -f "$path/pyproject.toml" ]]; then
    # Python project (modern)
    PROJECT_NAME=$(grep -E '^name\s*=' "$path/pyproject.toml" | head -1 | sed 's/.*=\s*"\([^"]*\)".*/\1/' 2> /dev/null)
    [[ -n $PROJECT_NAME ]] && return
  fi

  if [[ -f "$path/setup.py" ]]; then
    # Python project (legacy)
    PROJECT_NAME=$(grep -E 'name\s*=' "$path/setup.py" | head -1 | sed "s/.*name\s*=\s*['\"]([^'\"]*)['\"].*/\1/" 2> /dev/null)
    [[ -n $PROJECT_NAME ]] && return
  fi

  if [[ -f "$path/composer.json" ]]; then
    # PHP project
    PROJECT_NAME=$(jq -r '.name // empty' "$path/composer.json" 2> /dev/null)
    [[ -n $PROJECT_NAME && $PROJECT_NAME != "null" ]] && return
  fi

  if [[ -f "$path/go.mod" ]]; then
    # Go project
    PROJECT_NAME=$(grep -E '^module\s+' "$path/go.mod" | head -1 | awk '{print $2}' | sed 's|.*/||' 2> /dev/null)
    [[ -n $PROJECT_NAME ]] && return
  fi

  if [[ -f "$path/pom.xml" ]]; then
    # Maven project
    PROJECT_NAME=$(grep -E '<artifactId>' "$path/pom.xml" | head -1 | sed 's/.*<artifactId>\([^<]*\)<.*/\1/' 2> /dev/null)
    [[ -n $PROJECT_NAME ]] && return
  fi

  if [[ -f "$path/build.gradle" ]] || [[ -f "$path/build.gradle.kts" ]]; then
    # Gradle project
    if [[ -f "$path/settings.gradle" ]]; then
      PROJECT_NAME=$(grep -E "rootProject\.name\s*=" "$path/settings.gradle" | sed "s/.*=\s*['\"]([^'\"]*)['\"].*/\1/" 2> /dev/null)
    fi
    [[ -n $PROJECT_NAME ]] && return
  fi

  if [[ -f "$path/Makefile" ]]; then
    # C/C++ or other Makefile project
    PROJECT_NAME=$(grep -E '^PROJECT\s*=' "$path/Makefile" | head -1 | sed 's/.*=\s*\(.*\)/\1/' 2> /dev/null)
    [[ -n $PROJECT_NAME ]] && return
  fi

  # Check for common project indicators
  if [[ -f "$path/.git/config" ]] || [[ -d "$path/.git" ]]; then
    # Git repository - use remote origin name
    PROJECT_NAME=$(git -C "$path" remote get-url origin 2> /dev/null | sed 's|.*/||' | sed 's|\.git$||' 2> /dev/null)
    [[ -n $PROJECT_NAME ]] && return
  fi

  # Fallback to directory name
  PROJECT_NAME=$(basename "$path")
}

# Function to get git branch with status indicators
get_git_branch() {
  local path="$1"

  if git -C "$path" rev-parse --git-dir > /dev/null 2>&1; then
    local branch=$(git -C "$path" branch --show-current 2> /dev/null)
    local status=""

    # Check for uncommitted changes
    if ! git -C "$path" diff-index --quiet HEAD -- 2> /dev/null; then
      status="*"
    fi

    # Check for untracked files
    if [[ -n $(git -C "$path" ls-files --others --exclude-standard 2> /dev/null) ]]; then
      status="${status}+"
    fi

    # Check for unpushed commits
    local unpushed=$(git -C "$path" rev-list --count @{upstream}..HEAD 2> /dev/null)
    if [[ -n $unpushed && $unpushed -gt 0 ]]; then
      status="${status}↑$unpushed"
    fi

    # Check for unpulled commits
    local unpulled=$(git -C "$path" rev-list --count HEAD..@{upstream} 2> /dev/null)
    if [[ -n $unpulled && $unpulled -gt 0 ]]; then
      status="${status}↓$unpulled"
    fi

    if [[ -n $branch ]]; then
      GIT_BRANCH="$branch$status"
    fi
  fi
}

# Main logic
if [[ -n $CURRENT_PATH && -d $CURRENT_PATH ]]; then
  # Search upward for project root
  search_path="$CURRENT_PATH"
  while [[ $search_path != "/" ]]; do
    get_project_name "$search_path"
    if [[ -n $PROJECT_NAME ]]; then
      # Found project, get git info from the same directory
      get_git_branch "$search_path"
      break
    fi
    search_path=$(dirname "$search_path")
  done

  # If no project found, use current directory
  if [[ -z $PROJECT_NAME ]]; then
    get_project_name "$CURRENT_PATH"
    get_git_branch "$CURRENT_PATH"
  fi
fi

# Format output
if [[ -n $PROJECT_NAME && -n $GIT_BRANCH ]]; then
  echo "$PROJECT_NAME [$GIT_BRANCH]"
elif [[ -n $PROJECT_NAME ]]; then
  echo "$PROJECT_NAME"
elif [[ -n $GIT_BRANCH ]]; then
  echo "$(basename "$CURRENT_PATH") [$GIT_BRANCH]"
else
  echo "$(basename "$CURRENT_PATH")"
fi
