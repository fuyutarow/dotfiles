#!/bin/bash

# デバッグ用：ステップごとに確認

if [ $(tmux list-panes | wc -l) -gt 1 ]; then
  tmux display-message "Layout already applied"
  exit 1
fi

echo "Step 1: 6分割"
tmux split-window -h -c "#{pane_current_path}"
tmux split-window -h -c "#{pane_current_path}"
tmux split-window -h -c "#{pane_current_path}"
tmux split-window -h -c "#{pane_current_path}"
tmux split-window -h -c "#{pane_current_path}"
tmux select-layout even-horizontal
echo "ペイン数: $(tmux list-panes | wc -l)"

echo "Step 2: ペイン2分割"
tmux select-pane -t 2
tmux split-window -v -c "#{pane_current_path}"
echo "ペイン数: $(tmux list-panes | wc -l)"

echo "Step 3: ペイン4分割"
tmux select-pane -t 4
tmux split-window -v -c "#{pane_current_path}"
echo "ペイン数: $(tmux list-panes | wc -l)"

echo "Step 4: join-pane実行前の状態"
tmux list-panes -F 'Pane #{pane_index}'

echo "Step 4: ペイン7,8を結合"
if tmux join-pane -h -s 8 -t 7; then
  echo "join-pane成功"
else
  echo "join-pane失敗"
fi
echo "ペイン数: $(tmux list-panes | wc -l)"
tmux list-panes -F 'Pane #{pane_index}'

tmux select-pane -t 1
