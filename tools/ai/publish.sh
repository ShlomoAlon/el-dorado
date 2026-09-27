#!/usr/bin/env bash
# Every 5 seconds: rebuild training-progress.md (and search-progress.md for the search experiment); push them to the
# ai-progress branch (README.md, SEARCH.md) whenever their content changed (ignoring the "Updated" line). One commit, replaced each time.
cd "$(dirname "$0")/../.."; R=/tmp/claude-0/progrepo; last=""
while true; do
  node tools/ai/progress.mjs ${1:-first}
  node tools/ai/search_report.mjs 24 2>/dev/null
  node tools/ai/deep_report.mjs ${DEEP_DEPTH:-2} ${DEEP_GAMES:-24} 2>/dev/null
  sig=$( (grep -v '^_Updated' training-progress.md; grep -v '^_Updated' search-progress.md 2>/dev/null; grep -v '^_Updated' deep-progress.md 2>/dev/null) | md5sum)
  if [ "$sig" != "$last" ]; then
    cp training-progress.md $R/README.md; [ -f search-progress.md ] && cp search-progress.md $R/SEARCH.md; [ -f deep-progress.md ] && cp deep-progress.md $R/DEEP.md; cp training-*.svg deep-*.svg $R/ 2>/dev/null
    if (cd $R && git add README.md SEARCH.md 2>/dev/null; cd $R && git add README.md && { [ -f SEARCH.md ] && git add SEARCH.md; true; } && { [ -f DEEP.md ] && git add DEEP.md; true; } && { git add *.svg 2>/dev/null; true; } && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -q --amend -m "Bot training progress (auto-updated)" && git push -q -f origin ai-progress) >/dev/null 2>&1; then last=$sig; fi
  fi
  sleep 5
done
