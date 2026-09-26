#!/usr/bin/env bash
# Every 2 minutes: rebuild training-progress.md and push it to the ai-progress branch (one commit, replaced each time).
cd "$(dirname "$0")/../.."; R=/tmp/claude-0/progrepo
while true; do
  node tools/ai/progress.mjs ${1:-first}
  cp training-progress.md $R/README.md
  (cd $R && git add README.md && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -q --amend -m "Bot training progress (auto-updated every 2 minutes)" && git push -q -f origin ai-progress) >/dev/null 2>&1
  sleep 120
done
