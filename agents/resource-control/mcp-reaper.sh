#!/bin/sh
# shim: bootstrap
# mcp-reaper — reclaim leaked stdio MCP server processes.
#
# WHY THIS EXISTS (2026-08-23)
# `codex app-server` spawns the full stdio MCP server set once per session and does NOT reap
# it when the session ends. Measured: 2365 leaked processes holding 53 GB of 58 GB RAM, 97%
# of them at <=1s cumulative CPU — spawned, never used, never freed. Cost scales as
# (stdio servers) x (sessions ever run), so it is a standing leak that ends in OOM.
#
# The REAL fix is the url-only MCP config (~/.codex/config.toml, ~/.claude.json,
# dotfiles/.mcp.json — all converted 2026-08-23), which leaves nothing to leak. But a
# long-running app-server reads its config ONCE at startup, so the change stays inert until
# that daemon restarts. This bounds memory during that window. THIS IS A STOPGAP: once the
# app-server has restarted, this matches nothing. Retire it then:
#   mise run wsl:mcp-reaper:off
#
# WHY POSIX sh AND NOT bun/TypeScript
# The first version of this was bun TS and it FAILED under systemd with
# `/usr/bin/env: 'bun': No such file or directory` — the user manager's PATH does not carry
# linuxbrew. A reaper is a recovery tool for a memory emergency; making it depend on a
# package manager's runtime being on PATH is exactly backwards. ps/awk/kill are always there.
# (House cut: sh for process/placement plumbing, TS where there is real logic to hold.)
#
# SAFETY — three independent conditions, ALL required before a signal is sent:
#   1. the command line matches a known MCP server launcher (explicit list, not /node|python/),
#   2. the process is older than MIN_AGE seconds,
#   3. it has accumulated <= MAX_CPU seconds of CPU time.
# (2)+(3) together mean "has existed a long time and has never done any work" — the signature
# of a leaked server. A server actually serving a session accrues CPU; a fresh one is too young.
#
# Usage:
#   mcp-reaper                        # reap with defaults
#   mcp-reaper --dry-run              # report only, send no signals
#   mcp-reaper --min-age-sec 600 --max-cpu-sec 1

set -eu

MIN_AGE=1800
MAX_CPU=1
DRY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --min-age-sec) MIN_AGE=$2; shift ;;
    --max-cpu-sec) MAX_CPU=$2; shift ;;
    -h|--help) sed -n '2,34p' "$0"; exit 0 ;;
    *) echo "mcp-reaper: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

# Explicit launcher signatures. Deliberately NOT a generic node/python match.
MATCH='@modelcontextprotocol/server-|@ccusage/mcp|mcp-server-fetch|mcp-server-time|arxiv-mcp-server|@upstash/context7-mcp|context7-mcp|shadcn@latest mcp|playwright-mcp|@playwright/mcp|server-sequential-thinking|server-brave-search|mcp-server-postgres'
# Never signalled, whatever else they look like: this script, the deliberately-resident and
# shared cocoindex daemon, and serena (which has its own foreground lifecycle control).
NEVER='mcp-reaper|run-daemon|serena'

scan() { # -> "pid rss" per line, for processes meeting all three conditions
  ps -eo pid=,etimes=,times=,rss=,args= 2>/dev/null | awk \
    -v match_re="$MATCH" -v never_re="$NEVER" -v minage="$MIN_AGE" -v maxcpu="$MAX_CPU" '
    {
      pid=$1; age=$2; cpu=$3; rss=$4
      args=""; for (i=5; i<=NF; i++) args=args $i " "
      if (args ~ never_re) next
      if (args !~ match_re) next
      if (age+0 < minage+0) next
      if (cpu+0 > maxcpu+0) next
      print pid, rss
    }'
}

total_mcp() {
  ps -eo rss=,args= 2>/dev/null | awk -v m="$MATCH" -v n="$NEVER" '
    { rss=$1; a=""; for (i=2;i<=NF;i++) a=a $i " "
      if (a ~ n) next; if (a !~ m) next; c++; s+=rss }
    END { printf "%d %.2f", c+0, s/1024/1024 }'
}

set -- $(total_mcp)
ALL_N=$1
ALL_G=$2

TARGETS=$(scan)
N=$(printf '%s' "$TARGETS" | grep -c . || true)
G=$(printf '%s\n' "$TARGETS" | awk '{s+=$2} END {printf "%.2f", s/1024/1024}')

echo "mcp-reaper: ${ALL_N} MCP processes (${ALL_G} GiB); ${N} leaked by age>=${MIN_AGE}s & cpu<=${MAX_CPU}s (${G} GiB)"

if [ "$N" -eq 0 ]; then
  echo "mcp-reaper: nothing to reap"
  exit 0
fi

if [ "$DRY" -eq 1 ]; then
  ps -eo pid=,etimes=,times=,args= | awk -v ids="$(printf '%s\n' "$TARGETS" | awk '{print $1}' | tr '\n' ' ')" '
    BEGIN { split(ids, a, " "); for (i in a) want[a[i]]=1 }
    want[$1] && shown < 10 { shown++; print "  would reap pid=" $1 " age=" $2 "s cpu=" $3 "s " substr($0, index($0,$4)), "" }'
  echo "  (dry run: no signals sent)"
  exit 0
fi

TERMED=0
for pid in $(printf '%s\n' "$TARGETS" | awk '{print $1}'); do
  kill -TERM "$pid" 2>/dev/null && TERMED=$((TERMED + 1)) || true
done

sleep 5

# Re-scan rather than trusting the first list: a pid may have exited and been reused.
KILLED=0
for pid in $(scan | awk '{print $1}'); do
  kill -KILL "$pid" 2>/dev/null && KILLED=$((KILLED + 1)) || true
done

echo "mcp-reaper: SIGTERM ${TERMED}, SIGKILL ${KILLED}, reclaimed ~${G} GiB"
