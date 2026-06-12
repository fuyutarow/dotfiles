#!/bin/bash

# tmux True Color Tailwind Slate プリセット
echo "tmux True Color - 正確な Tailwind Slate 色"
echo "=========================================="

# True Color プリセット表示関数
show_truecolor_preset() {
    local name="$1"
    local active_hex="$2"
    local nonactive_hex="$3"
    local desc="$4"
    local current="$5"

    # HEXをRGBに変換
    active_r=$((16#${active_hex:1:2}))
    active_g=$((16#${active_hex:3:2}))
    active_b=$((16#${active_hex:5:2}))

    nonactive_r=$((16#${nonactive_hex:1:2}))
    nonactive_g=$((16#${nonactive_hex:3:2}))
    nonactive_b=$((16#${nonactive_hex:5:2}))

    printf "%-20s " "$name:"
    printf "\033[48;2;%d;%d;%dm\033[38;2;255;255;255m active %s \033[0m" $active_r $active_g $active_b "$active_hex"
    printf "\033[48;2;%d;%d;%dm\033[38;2;255;255;255m non-active %s \033[0m" $nonactive_r $nonactive_g $nonactive_b "$nonactive_hex"
    printf " %s" "$desc"
    [ "$current" = "true" ] && printf " ← 推奨"
    echo
}

echo -e "\n🎨 正確な Tailwind Slate 色:"
show_truecolor_preset "slate-950" "#020617" "#0f172a" "最暗 → 深い"
show_truecolor_preset "slate-925" "#0f172a" "#1e293b" "深い → 標準" "true"
show_truecolor_preset "slate-875" "#1e293b" "#334155" "標準 → やや明るめ"

echo -e "\n🌊 Slate 色のグラデーション:"
show_truecolor_preset "ultra-dark" "#020617" "#0a0f1c" "究極暗"
show_truecolor_preset "deep-slate" "#0a0f1c" "#0f172a" "深いスレート"
show_truecolor_preset "standard" "#0f172a" "#1e293b" "標準スレート"
show_truecolor_preset "refined" "#1e293b" "#334155" "洗練スレート"

echo -e "\n🔷 Slate Blue 変種:"
show_truecolor_preset "slate-blue-1" "#0c1426" "#1a2332" "スレートブルー1"
show_truecolor_preset "slate-blue-2" "#1a2332" "#293548" "スレートブルー2"
show_truecolor_preset "slate-blue-3" "#293548" "#3e4c63" "スレートブルー3"

echo -e "\n🌑 カスタム Slate 変種:"
show_truecolor_preset "warm-slate" "#1a1512" "#2d251f" "ウォームスレート"
show_truecolor_preset "cool-slate" "#121a1f" "#1f2d35" "クールスレート"
show_truecolor_preset "purple-slate" "#191218" "#2e1f2d" "パープルスレート"

echo -e "\n📋 tmux.conf 設定例:"
echo "# True Color 対応設定（既に設定済み）"
echo "set -g default-terminal \"tmux-256color\""
echo "set -ga terminal-overrides \",*256col*:Tc\""
echo ""
echo "# Tailwind Slate-925 の設定"
echo "set -g window-active-style 'bg=#0f172a'"
echo "set -g window-style 'bg=#1e293b'"
echo "set -g status-style 'bg=#1e293b,fg=#94a3b8'"
echo "set -g window-status-current-format '#[bg=#0f172a,fg=#e2e8f0] #I:#W '"
echo "set -g pane-active-border-style 'fg=#3b82f6'"
echo "set -g pane-border-style 'fg=#475569'"

echo -e "\n🔧 TPM テーマプラグイン選択肢:"
echo "set -g @plugin 'catppuccin/tmux'           # Catppuccin テーマ"
echo "set -g @plugin 'dracula/tmux'              # Dracula テーマ"
echo "set -g @plugin 'jimeh/tmux-themepack'      # 複数テーマパック"
echo "set -g @plugin 'wfxr/tmux-power'           # Modern テーマ"

echo -e "\n✨ True Color 確認コマンド:"
echo "tmux list-clients -F '#{client_termfeatures}' | grep RGB"