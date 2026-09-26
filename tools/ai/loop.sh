#!/usr/bin/env bash
# Full training run for one course.  tools/ai/loop.sh <course-id> <iterations>
# Logs to tools/ai/data/<course>.log (one JSON summary per step); best net by eval win rate → tools/ai/data/<course>.best.json
set -uo pipefail
cd "$(dirname "$0")/../.."
C=${1:-first}; N=${2:-30}; D=tools/ai/data; NET=$D/$C.net.json; LOG=$D/$C.log; mkdir -p $D
log(){ echo "[$(date +%H:%M:%S)] $*" | tee -a $LOG; }
if [ ! -f $NET ]; then
  log "STAGE iter 0: learn from 2000 heuristic games"
  for k in a b c d; do log "GEN0 $(node tools/ai/gen.mjs heur 500 $D/$C.h0$k '' $C)"; done
  log "TRAIN $(python3 tools/ai/train.py $NET $C 6 $D/$C.h0a $D/$C.h0b $D/$C.h0c $D/$C.h0d 2>/dev/null)"
  log "EVAL0 $(node tools/ai/gen.mjs eval 160 - $NET $C)"
fi
best=-1; [ -f $D/$C.best.score ] && best=$(cat $D/$C.best.score)
for i in $(seq 1 $N); do
  it=$(( $( (ls $D/$C.it*.json 2>/dev/null || true) | wc -l) + 1 ))
  eps=$(python3 -c "print(round(max(0.01, 0.04-0.001*$it),3))"); temp=$(python3 -c "print(round(max(0.005, 0.03-0.0008*$it),4))")
  log "STAGE iter $it: 600 self-play games (exploration: softmax temp $temp, random-move rate $eps, random-buy turns 10%)"
  out=$(EPS=$eps TEMP=$temp BUYEPS=0.1 node tools/ai/gen.mjs self 600 $D/$C.it$it $NET $C) || { log "ERROR gen failed"; exit 1; }
  log "GEN $out"
  prev=$(ls -t $D/$C.it*.json | head -3 | sed 's/\.json$//' | tr '\n' ' ')
  log "TRAIN $(python3 tools/ai/train.py $NET $C 3 $prev 2>/dev/null)"
  ev=$(node tools/ai/gen.mjs eval 160 - $NET $C); log "EVAL $ev"
  wr=$(echo "$ev" | python3 -c "import json,sys;print(json.load(sys.stdin)['netWinRate'])")
  if python3 -c "import sys;sys.exit(0 if $wr>$best else 1)"; then best=$wr; echo $best > $D/$C.best.score; cp $NET $D/$C.best.json; log "BEST win rate $wr"; fi
done
log "STAGE done"
