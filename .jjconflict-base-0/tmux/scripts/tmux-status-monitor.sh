#!/bin/bash

# Compact system monitor for tmux status bar
# Usage: Add to .tmux.conf: set -g status-right "#(./tmux-status-monitor.sh)"

get_compact_stats() {
  # Memory
  local mem_info mem_used mem_total
  mem_info=$(free -m)
  mem_used=$(echo "$mem_info" | awk '/^Mem:/ {print $3}')
  mem_total=$(echo "$mem_info" | awk '/^Mem:/ {print $2}')
  local mem_percent=$((mem_used * 100 / mem_total))

  # CPU Load
  local load_1min cpu_cores
  load_1min=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
  cpu_cores=$(nproc)

  # CPU Temperature
  local cpu_temp="N/A"
  if [[ -f /sys/class/thermal/thermal_zone0/temp ]]; then
    local temp_milliC
    temp_milliC=$(cat /sys/class/thermal/thermal_zone0/temp 2> /dev/null)
    if [[ -n $temp_milliC && $temp_milliC != "0" ]]; then
      cpu_temp=$((temp_milliC / 1000))
    fi
  elif command -v sensors > /dev/null 2>&1; then
    cpu_temp=$(sensors 2> /dev/null | grep -E "Core 0|Package id 0|Tctl" | head -1 | sed -n 's/.*+\([0-9]\+\)\..*/\1/p')
  fi

  # CPU Usage
  local cpu_usage
  cpu_usage=$(top -bn1 | awk '/^%Cpu/ {print 100-$8}' | cut -d. -f1 2> /dev/null || echo "0")

  # File descriptors
  local current_files max_files
  current_files=$(lsof 2> /dev/null | wc -l)
  max_files=$(ulimit -n)
  # Subtract 1 for lsof header line
  current_files=$((current_files - 1))
  [[ $current_files -lt 0 ]] && current_files=0
  local fd_percent=$((current_files * 100 / max_files))

  # Disk usage
  local disk_usage
  disk_usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')

  # Claude processes
  local claude_procs
  claude_procs=$(pgrep -fc "claude|python.*claude" 2> /dev/null || echo 0)

  # Pressure (if available)
  local mem_pressure="0"
  if [[ -f /proc/pressure/memory ]]; then
    mem_pressure=$(awk '/avg10=/ {gsub(/avg10=/, ""); print $1}' /proc/pressure/memory 2> /dev/null | head -1)
    mem_pressure=${mem_pressure:-0}
  fi

  # Color coding for critical values
  local mem_color="#[fg=colour2]"                        # Green
  [[ $mem_percent -gt 80 ]] && mem_color="#[fg=colour3]" # Yellow
  [[ $mem_percent -gt 90 ]] && mem_color="#[fg=colour1]" # Red

  local fd_color="#[fg=colour2]"                       # Green
  [[ $fd_percent -gt 60 ]] && fd_color="#[fg=colour3]" # Yellow
  [[ $fd_percent -gt 80 ]] && fd_color="#[fg=colour1]" # Red

  local load_color="#[fg=colour2]" # Green
  local load_ratio
  load_ratio=$(echo "scale=1; $load_1min / $cpu_cores" | bc -l 2> /dev/null || echo "0")
  [[ $(echo "$load_ratio > 1.0" | bc -l 2> /dev/null || echo "0") -eq 1 ]] && load_color="#[fg=colour3]"
  [[ $(echo "$load_ratio > 2.0" | bc -l 2> /dev/null || echo "0") -eq 1 ]] && load_color="#[fg=colour1]"

  local disk_color="#[fg=colour2]"                       # Green
  [[ $disk_usage -gt 80 ]] && disk_color="#[fg=colour3]" # Yellow
  [[ $disk_usage -gt 90 ]] && disk_color="#[fg=colour1]" # Red

  local claude_color="#[fg=colour2]"                         # Green
  [[ $claude_procs -gt 5 ]] && claude_color="#[fg=colour3]"  # Yellow
  [[ $claude_procs -gt 10 ]] && claude_color="#[fg=colour1]" # Red

  # CPU temperature color coding
  local temp_color="#[fg=colour2]" # Green
  if [[ $cpu_temp != "N/A" ]]; then
    [[ $cpu_temp -gt 70 ]] && temp_color="#[fg=colour3]" # Yellow
    [[ $cpu_temp -gt 85 ]] && temp_color="#[fg=colour1]" # Red
  fi

  # CPU usage color coding
  local cpu_color="#[fg=colour2]"                      # Green
  [[ $cpu_usage -gt 70 ]] && cpu_color="#[fg=colour3]" # Yellow
  [[ $cpu_usage -gt 90 ]] && cpu_color="#[fg=colour1]" # Red

  # Output comprehensive format for tmux status
  echo "${mem_color}MEM:${mem_percent}%#[default] ${cpu_color}CPU:${cpu_usage}%#[default] ${temp_color}TEMP:${cpu_temp}°C#[default] ${fd_color}FD:${fd_percent}%#[default] ${load_color}LOAD:${load_1min}#[default] ${disk_color}DISK:${disk_usage}%#[default] ${claude_color}CLAUDE:${claude_procs}#[default]"
}

get_compact_stats
