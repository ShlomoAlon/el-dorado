#!/usr/bin/env bash
# Self-play training for one course with a horizon curriculum.   tools/ai/loop.sh <course-id> <iterations>
# Starts from an untrained network (TD-Gammon style). Games stop after HORIZON rounds and unfinished players
# are ranked by how close they got; the horizon grows 3 → 5 → 8 → 12 → 16 → full once the bot stops improving.
# Each iteration: 600 self-play games → train on this horizon's last 3 batches → test vs 2 heuristic bots (160 games).
set -uo pipefail
cd "$(dirname "$0")/../.."
C=${1:-first}; N=${2:-60}; D=tools/ai/data; NET=$D/$C.net.json; LOG=$D/$C.log; mkdir -p $D
HS=(3 5 8 12 16 60)
log(){ echo "[$(date +%H:%M:%S)] $*" | tee -a $LOG; }
num(){ python3 -c "import json,sys;print(json.load(sys.stdin)['$1'])"; }
hi=0; [ -f $D/$C.hi ] && hi=$(cat $D/$C.hi)
if [ ! -f $NET ]; then  # untrained network with the right input size
  HORIZON=3 node tools/ai/gen.mjs self 8 $D/$C.init '' $C > /dev/null
  python3 tools/ai/train.py $NET $C 0 $D/$C.init > /dev/null 2>&1; rm -f $D/$C.init.*
  log "START untrained network, horizon ${HS[$hi]}"
fi
bestH=-1; stall=0
for i in $(seq 1 $N); do
  H=${HS[$hi]}; it=$(( $( (ls $D/$C.it*.json 2>/dev/null || true) | wc -l) + 1 ))
  log "STAGE iter $it · horizon $H rounds · 600 self-play games"
  out=$(HORIZON=$H EPS=0.03 TEMP=0.02 BUYEPS=0.1 node tools/ai/gen.mjs self 600 $D/$C.it$it $NET $C) || { log "ERROR gen failed"; exit 1; }
  log "GEN $out"
  prev=$( (grep -l "\"horizon\":$H," $D/$C.it*.json 2>/dev/null || true) | xargs -r ls -t | head -3 | sed 's/\.json$//' | tr '\n' ' ')
  log "TRAIN $(python3 tools/ai/train.py $NET $C 3 $prev 2>/dev/null)"
  ev=$(HORIZON=$H node tools/ai/gen.mjs eval 160 - $NET $C); log "EVAL $ev"
  wr=$(echo "$ev" | num netWinRate)
  cp $NET $D/$C.h$H.json
  if python3 -c "import sys;sys.exit(0 if $wr>$bestH+0.02 else 1)"; then bestH=$wr; stall=0; else stall=$((stall+1)); fi
  # next horizon once this one has plateaued (3 iterations without a new best) and the bot is at least even with the heuristic
  if (( stall >= 3 )) && python3 -c "import sys;sys.exit(0 if $bestH>=0.33 else 1)" && (( hi < ${#HS[@]}-1 )); then
    hi=$((hi+1)); echo $hi > $D/$C.hi; bestH=-1; stall=0; log "HORIZON up to ${HS[$hi]} rounds"
  fi
done
log "STAGE done"
