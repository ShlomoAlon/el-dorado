#!/usr/bin/env bash
# Every 5 seconds: rebuild training-progress.md; push it to the ai-progress branch whenever its content changed
# (ignoring the "Updated" timestamp line). One commit, replaced each time.
cd "$(dirname "$0")/../.."; R=/tmp/claude-0/progrepo; last=""
while true; do
  node tools/ai/progress.mjs ${1:-first}
  sig=$(grep -v '^_Updated' training-progress.md | md5sum)
  if [ "$sig" != "$last" ]; then
    cp training-progress.md $R/README.md
    if (cd $R && git add README.md && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -q --amend -m "Bot training progress (auto-updated)" && git push -q -f origin ai-progress) >/dev/null 2>&1; then last=$sig; fi
  fi
  sleep 5
done
