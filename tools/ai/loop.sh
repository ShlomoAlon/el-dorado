#!/usr/bin/env bash
# Self-play training for one course with a horizon curriculum.   tools/ai/loop.sh <course-id> <iterations>
# RUN=<name> keeps a separate run's files (tools/ai/data/<course>-<name>.*); SEARCH_BEAM=<n> makes the nets play through the
# whole-turn planner in self-play and tests (training with search in the loop); MIX_PLAIN=1 also has one net seat per game play plain.
# REPLAY=<n>: train on the last n self-play batches of this horizon (default 3).
# Reusable for any course: everything below depends only on the course id.
# Starts from an untrained network (TD-Gammon style). Games stop after HORIZON rounds and unfinished players
# are ranked by how close they got; the horizon grows 3 → 5 → 8 → 12 → 16 → full once the bot stops improving.
# Each iteration: 600 self-play games (3- and 4-player) → train on this horizon's last 3 batches → test vs heuristic bots (160 games, half 3-player, half 4-player).
set -uo pipefail
cd "$(dirname "$0")/../.."
C=${1:-first}; N=${2:-60}; D=tools/ai/data; P=$C${RUN:+-$RUN}; NET=$D/$P.net.json; LOG=$D/$P.log; mkdir -p $D
HS=(3 5 8 12 16 25)   # 25 = full game: nobody should still be racing by round 25
# exploration level per curriculum stage (1 = most exploration); scales every exploration rate in gen.mjs
EX=(1.0 0.85 0.7 0.5 0.35 0.2)
log(){ echo "[$(date +%H:%M:%S)] $*" | tee -a $LOG; }
num(){ python3 -c "import json,sys;print(json.load(sys.stdin)['$1'])"; }
hi=0; [ -f $D/$P.hi ] && hi=$(cat $D/$P.hi)
if [ ! -f $NET ]; then  # untrained network with the right input size
  HORIZON=3 node tools/ai/gen.mjs self 8 $D/$P.init '' $C > /dev/null
  python3 tools/ai/train.py $NET $C 0 $D/$P.init > /dev/null 2>&1; rm -f $D/$P.init.*
  log "START untrained network, horizon ${HS[$hi]}"
fi
bestH=-1; stall=0; beat=0
for i in $(seq 1 $N); do
  H=${HS[$hi]}; it=$(( $( (ls $D/$P.it*.json 2>/dev/null || true) | wc -l) + 1 ))
  X=${EX[$hi]}
  log "STAGE iter $it · horizon $H rounds · exploration level $X · 600 self-play games${SEARCH_BEAM:+ · nets play through the whole-turn planner (beam $SEARCH_BEAM)}"
  out=$(HORIZON=$H EXPLORE=$X node tools/ai/gen.mjs self 600 $D/$P.it$it $NET $C) || { log "ERROR gen failed"; exit 1; }
  log "GEN $out"
  prev=$( (grep -l "\"horizon\":$H," $D/$P.it*.json 2>/dev/null || true) | xargs -r ls -t | head -${REPLAY:-3} | sed 's/\.json$//' | tr '\n' ' ')
  log "TRAIN $(python3 tools/ai/train.py $NET $C 3 $prev 2>/dev/null)"
  # keep the disk bounded: only the newest ${KEEP_BATCHES:-8} self-play batches keep their sample files (summaries stay)
  ( ls -t $D/$P.it*.json 2>/dev/null | tail -n +$(( ${KEEP_BATCHES:-8} + 1 )) | sed 's/\.json$//' | while read b; do rm -f $b.*.bin; done ) || true
  ev=$(HORIZON=$H node tools/ai/gen.mjs eval 160 - $NET $C); log "EVAL $ev"
  wr=$(echo "$ev" | num vsFair)   # 1.0 = wins its fair share (as good as the heuristic)
  cp $NET $D/$P.h$H.json
  if python3 -c "import sys;sys.exit(0 if $wr>$bestH+0.05 else 1)"; then bestH=$wr; stall=0; else stall=$((stall+1)); fi
  if python3 -c "import sys;sys.exit(0 if $wr>=1.15 else 1)"; then beat=$((beat+1)); else beat=0; fi
  # next horizon once it beats the heuristic in 2 tests in a row (≥1.15× its fair share), or has plateaued at ≥1.0
  if { (( beat >= 2 )) || { (( stall >= 3 )) && python3 -c "import sys;sys.exit(0 if $bestH>=1.0 else 1)"; }; } && (( hi < ${#HS[@]}-1 )); then
    hi=$((hi+1)); echo $hi > $D/$P.hi; bestH=-1; stall=0; beat=0; log "HORIZON up to ${HS[$hi]} rounds"
  fi
done
log "STAGE done"
