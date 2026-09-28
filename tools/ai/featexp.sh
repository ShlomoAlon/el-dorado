#!/usr/bin/env bash
# Feature trial: from one checkpoint, train a control and one branch per input group for the same number of iterations,
# then compare each branch with the control on the ladder. Runs through the watchdog (supervise.sh) by writing its config.
#   tools/ai/featexp.sh <checkpoint.json> <iterations> <settings…>   e.g. … first-first1-best.json 12 "GAMES=400 …"
# Branches: ctl (no new inputs), cards, patch (tools/ai/addfeat.mjs). Afterwards the config in $RESTORE is put back.
set -uo pipefail
cd "$(dirname "$0")/../.."
CK=$1; IT=$2; SET=$3; CFG=/tmp/claude-0/run.env; D=tools/ai/data; OUT=$D/featexp.log
RESTORE=$(cat $CFG)
say(){ echo "[$(date -u +%H:%M:%S)] $*" | tee -a $OUT; }
stop_loop(){ pkill -f 'tools/ai/loop\.sh'; pkill -f 'node tools/ai/gen\.mjs'; pkill -f 'python3 tools/ai/train\.py'; sleep 3; }
say "START checkpoint $CK, $IT iterations per branch, settings: $SET"
for b in ctl cards patch; do
  R=fx-$b; rm -f $D/first-$R.*
  if [ $b = ctl ]; then cp $CK $D/first-$R.net.json; else node tools/ai/addfeat.mjs $CK $D/first-$R.net.json $b >> $OUT; fi
  echo HOLD > $CFG; stop_loop
  echo "RUN=$R ITERS=$IT $SET" > $CFG
  say "branch $b started"
  until [ -f $D/first-$R.halt ]; do sleep 30; done
  say "branch $b: $(cat $D/first-$R.halt)"
done
echo HOLD > $CFG; stop_loop
for b in cards patch; do
  r=$(nice -n 5 node tools/ai/ladder.mjs match fx-ctl=$D/first-fx-ctl.net.json fx-$b=$D/first-fx-$b.net.json 256 2>&1 | tail -1)
  say "LADDER $b vs ctl: $r"
done
echo "$RESTORE" > $CFG
say "DONE; main run restored: $RESTORE"
