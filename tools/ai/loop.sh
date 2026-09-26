#!/usr/bin/env bash
# Full training run for one course.  tools/ai/loop.sh <course-id> <iterations>
# Logs to tools/ai/data/<course>.log; the best net (by eval win rate vs heuristic bots) → tools/ai/data/<course>.best.json
set -euo pipefail
cd "$(dirname "$0")/../.."
C=${1:-first}; N=${2:-30}; D=tools/ai/data; NET=$D/$C.net.json; LOG=$D/$C.log; mkdir -p $D
log(){ echo "[$(date +%H:%M:%S)] $*" | tee -a $LOG; }
if [ ! -f $NET ]; then
  log "iter 0: 2000 heuristic games (4 chunks)"
  for k in a b c d; do log "  gen  $(node tools/ai/gen.mjs heur 500 $D/$C.h0$k '' $C)"; done
  log "  train $(python3 tools/ai/train.py $NET $C 6 $D/$C.h0a $D/$C.h0b $D/$C.h0c $D/$C.h0d 2>/dev/null)"
fi
best=-1; [ -f $D/$C.best.score ] && best=$(cat $D/$C.best.score)
for i in $(seq 1 $N); do
  it=$(( $(ls $D/$C.it*.json 2>/dev/null | wc -l) + 1 ))
  eps=$(python3 -c "print(max(0.02, 0.08-0.004*$it))")
  log "iter $it (eps $eps): 600 self-play games"
  log "  gen  $(EPS=$eps node tools/ai/gen.mjs self 600 $D/$C.it$it $NET $C)"
  prev=$(ls -t $D/$C.it*.json | head -3 | sed 's/\.json$//' | tr '\n' ' ')
  log "  train $(python3 tools/ai/train.py $NET $C 3 $prev 2>/dev/null)"
  if (( it % 2 == 0 )); then
    ev=$(node tools/ai/gen.mjs eval 160 - $NET $C); log "  EVAL $ev"
    wr=$(echo "$ev" | python3 -c "import json,sys;print(json.load(sys.stdin)['netWinRate'])")
    if python3 -c "import sys;sys.exit(0 if $wr>$best else 1)"; then best=$wr; echo $best > $D/$C.best.score; cp $NET $D/$C.best.json; log "  new best: win rate $wr"; fi
  fi
done
