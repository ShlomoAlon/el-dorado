#!/usr/bin/env bash
# Self-play training for one course with a horizon curriculum.   tools/ai/loop.sh <course-id> <iterations>
# RUN=<name> keeps a separate run's files (tools/ai/data/<course>-<name>.*); SEARCH_BEAM=<n> makes the nets play through the
# whole-turn planner in self-play and tests (training with search in the loop); MIX_PLAIN=1 also has one net seat per game play plain.
# REPLAY=<n>: train on the last n self-play batches of this horizon (default 3). HCAP=<rounds>: fixed round cap. EXPLORE_LEVEL=<x>: exploration level.
# DOUBLE=1: Double-Q style within-turn targets (gen.mjs PREV_NET = the network from before the last training step).
# PAIRED=1: tests play each deal with the network in every seat (EVAL_GAMES, default 168 = 24 × (a 3-seat + a 4-seat deal)).
# Reusable for any course: everything below depends only on the course id.
# Starts from an untrained network (TD-Gammon style). Games stop after HORIZON rounds and unfinished players
# are ranked by how close they got; the horizon grows 3 → 5 → 8 → 12 → 16 → full once the bot stops improving.
# Each iteration: GAMES (600) self-play games (3- and 4-player) → train on this horizon's last 3 batches → test vs heuristic bots (160 games, half 3-player, half 4-player).
set -uo pipefail
cd "$(dirname "$0")/../.."
C=${1:-first}; N=${2:-60}; D=tools/ai/data; P=$C${RUN:+-$RUN}; NET=$D/$P.net.json; LOG=$D/$P.log; mkdir -p $D
HZ=${HORIZONS:-3,5,8,12,16,25}; HS=(${HZ//,/ })   # round caps of the curriculum (HORIZONS=10,13,16,20,25,30; default 3,5,8,12,16,25); the last one is the full game
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
EG=${EVAL_GAMES:-$([ "${PAIRED:-0}" = 1 ] && echo 168 || echo 160)}   # paired: a multiple of 7 per worker set (4 workers × 42)
for i in $(seq 1 $N); do
  H=${HCAP:-${HS[$hi]}}; it=$(( $( (ls $D/$P.it*.json 2>/dev/null || true) | wc -l) + 1 ))
  X=${EXPLORE_LEVEL:-${EX[$(( hi < ${#EX[@]} ? hi : ${#EX[@]}-1 ))]}}   # EXPLORE_LEVEL: override the curriculum's exploration level
  PV=""; [ "${DOUBLE:-0}" = 1 ] && [ -f $D/$P.prev.json ] && PV=$D/$P.prev.json
  log "STAGE iter $it · horizon $H rounds · exploration level $X · ${GAMES:-600} self-play games${SEARCH_BEAM:+ · nets play through the whole-turn planner (beam $SEARCH_BEAM)}"
  out=$(HORIZON=$H EXPLORE=$X PREV_NET=$PV node tools/ai/gen.mjs self ${GAMES:-600} $D/$P.it$it $NET $C) || { log "ERROR gen failed"; exit 1; }
  log "GEN $out"
  prev=$( (grep -l "\"horizon\":$H," $D/$P.it*.json 2>/dev/null || true) | xargs -r ls -t | head -${REPLAY:-3} | sed 's/\.json$//' | tr '\n' ' ')
  cp $NET $D/$P.prev.json   # the network before this training step (Double-Q targets in the next self-play)
  tr=$(python3 tools/ai/train.py $NET $C 3 $prev 2>/dev/null); log "TRAIN $tr"
  [ -z "$tr" ] && { log "HALT training failed (train.py printed nothing)"; echo "training failed" > $D/$P.halt; exit 2; }
  # model-quality checks (train.py): log the warnings; on a halt (dead units, broken weights) stop until the cause is found —
  # the watchdog (supervise.sh) does not restart a run with a .halt file
  echo "$tr" | python3 -c "import json,sys;[print(w) for w in json.load(sys.stdin).get('warn',[])]" 2>/dev/null | while read -r w; do log "WARN $w"; done
  h=$(echo "$tr" | python3 -c "import json,sys;print(json.load(sys.stdin).get('halt') or '')" 2>/dev/null)
  if [ -n "$h" ]; then log "HALT $h — training stopped; find the cause, then delete $D/$P.halt"; echo "$h" > $D/$P.halt; exit 2; fi
  # keep the disk bounded: only the newest ${KEEP_BATCHES:-8} self-play batches keep their sample files (summaries stay)
  ( ls -t $D/$P.it*.json 2>/dev/null | tail -n +$(( ${KEEP_BATCHES:-8} + 1 )) | sed 's/\.json$//' | while read b; do rm -f $b.*.bin; done ) || true
  # EVAL_EVERY=n: test only every n-th iteration (the cap can only go up after a test)
  if (( it % ${EVAL_EVERY:-1} != 0 )); then cp $NET $D/$P.h$H.json; continue; fi
  ev=$(HORIZON=${EVAL_CAP:-$H} node tools/ai/gen.mjs eval $EG - $NET $C); log "EVAL $ev"   # EVAL_CAP: test on longer games than training
  wr=$(echo "$ev" | num vsFair)   # 1.0 = wins its fair share (as good as the heuristic)
  cp $NET $D/$P.h$H.json
  if python3 -c "import sys;sys.exit(0 if $wr>$bestH+0.05 else 1)"; then bestH=$wr; stall=0; else stall=$((stall+1)); fi
  if python3 -c "import sys;sys.exit(0 if $wr>=1.15 else 1)"; then beat=$((beat+1)); else beat=0; fi
  # next horizon once it beats the heuristic at this cap in 2 tests in a row (≥1.15× its fair share of wins)
  if (( beat >= 2 )) && (( hi < ${#HS[@]}-1 )); then
    hi=$((hi+1)); echo $hi > $D/$P.hi; bestH=-1; stall=0; beat=0; log "HORIZON up to ${HS[$hi]} rounds"
  fi
done
log "STAGE done"
