#!/usr/bin/env bash
# Keeps the training loop and the progress publisher alive (run it as a long-lived background task).
#   tools/ai/supervise.sh [config=/tmp/claude-0/run.env]
# The config holds the run's environment on one line, e.g.:  RUN=tstrap MAXBACK=1 TREESTRAP=3
# Every minute: start the loop / publisher if they are not running; if the run's log has not changed for STALL_MIN minutes
# (default 15; a stuck game or an infinite loop), kill the loop and its children and start it again. Changing the config and
# killing the loop switches experiments. Every action is logged to /tmp/claude-0/supervise.log.
cd "$(dirname "$0")/../.."
CFG=${1:-/tmp/claude-0/run.env}; STALL=${STALL_MIN:-15}; LOG=/tmp/claude-0/supervise.log
say(){ echo "[$(date -u +%H:%M:%S)] $*" >> $LOG; }
while true; do
  env_line=$(cat "$CFG" 2>/dev/null); run=$(echo "$env_line" | grep -o 'RUN=[^ ]*' | cut -d= -f2)
  if [ -n "$run" ]; then
    rlog=tools/ai/data/first-$run.log
    if [ -f tools/ai/data/first-$run.halt ]; then  # the loop stopped itself on a model-quality problem: don't restart it
      [ "$halted" = "$run" ] || { say "HALT: $(cat tools/ai/data/first-$run.halt) — not restarting first-$run"; halted=$run; }
    elif ! pgrep -f 'tools/ai/loop\.sh' >/dev/null; then
      say "starting loop: $env_line"; (env $env_line setsid nohup tools/ai/loop.sh first 300 >> /tmp/claude-0/loop-$run.out 2>&1 < /dev/null &)
    elif [ -f "$rlog" ] && [ $(( $(date +%s) - $(stat -c %Y "$rlog") )) -gt $(( STALL * 60 )) ]; then
      say "STALL: $rlog unchanged for over $STALL min — restarting the loop"; echo "[$(date +%H:%M:%S)] STALL watchdog restarted the loop (log unchanged for over $STALL min)" >> "$rlog"
      pkill -f 'tools/ai/loop\.sh'; pkill -f 'node tools/ai/gen\.mjs'; pkill -f 'python3 tools/ai/train\.py'; sleep 3
    fi
    if ! pgrep -f 'tools/ai/publish\.sh' >/dev/null; then say "starting publisher for first-$run"; (setsid nohup tools/ai/publish.sh first-$run > /tmp/claude-0/publish.out 2>&1 < /dev/null &); fi
  fi
  sleep 60
done
