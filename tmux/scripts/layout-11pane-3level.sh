#!/bin/bash

# =============================================================================
# tmux 複雑3分割レイアウト作成スクリプト (Alt+5)
# =============================================================================
#
# Alt+4の派生形として作成
#
# 目標レイアウト:
# ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
# │         │    ?    │    ?    │         │    ?    │     ?   │
# │         │         │         │         ├─────────┴─────────┤
# │    1    ├─────────┼─────────┤    ?    │         ?         │
# │         │    ?    │    ?    │         ├───────────────────┤
# │         │         │         │         │         ?         │
# └─────────┴─────────┴─────────┴─────────┴───────────────────┘
#
# 特徴: 右端の2列が3段階に分割される複雑なレイアウト
#
# =============================================================================

create_complex_3split_layout() {
  # 冪等性チェック
  if [ "$(tmux list-panes | wc -l)" -gt 1 ]; then
    tmux display-message "Layout already applied"
    return
  fi

  # ステップ1: 横に6分割（Alt+3,4と同じ）
  # 結果: 1,2,3,4,5,6
  tmux split-window -h -c "#{pane_current_path}" # ペイン2作成
  tmux split-window -h -c "#{pane_current_path}" # ペイン3作成
  tmux split-window -h -c "#{pane_current_path}" # ペイン4作成
  tmux split-window -h -c "#{pane_current_path}" # ペイン5作成
  tmux split-window -h -c "#{pane_current_path}" # ペイン6作成

  # 均等配置に調整
  tmux select-layout even-horizontal

  # ステップ2: ペイン2を上下分割
  # 結果: 1,2,3,4,5,6,7 (元の3→4, 元の4→5, 元の5→6, 元の6→7)
  tmux select-pane -t 2
  tmux split-window -v -c "#{pane_current_path}"

  # ステップ3: ペイン4（元のペイン3）を上下分割
  # 結果: 1,2,3,4,5,6,7,8 (元の5→6, 元の6→7, 元の7→8)
  tmux select-pane -t 4
  tmux split-window -v -c "#{pane_current_path}"

  # ステップ4: ペイン8を削除して右端2列を結合
  # 結果: 1,2,3,4,5,6,7 (ペイン8削除、7が拡張)
  tmux kill-pane -t 8

  # ステップ5: ペイン7（右端）を上下3分割
  # まず上下に分割
  # 結果: 1,2,3,4,5,6,7,8
  tmux select-pane -t 7
  tmux split-window -v -c "#{pane_current_path}"

  # ステップ6: ペイン8（右端下部）をさらに上下分割
  # 結果: 1,2,3,4,5,6,7,8,9
  tmux select-pane -t 8
  tmux split-window -v -c "#{pane_current_path}"

  # ステップ7: ペイン7（右端上部）を左右分割
  # 結果: 1,2,3,4,5,6,7,8,9,10 (元の8→9, 元の9→10)
  tmux select-pane -t 7
  tmux split-window -h -c "#{pane_current_path}"

  # 最終状態:
  # ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
  # │         │    2    │    4    │         │    7    │    8    │
  # │    1    ├─────────┼─────────┤    6    ├─────────┼─────────┤
  # │         │    3    │    5    │         │    9    │   10    │
  # └─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘

  # フォーカスを最初のペインに戻す
  tmux select-pane -t 1

  echo "Complex 3-split layout created successfully"
}

# メイン実行
create_complex_3split_layout
