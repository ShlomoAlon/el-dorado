#!/usr/bin/env bash
# First ladder matches between the frozen networks (and the live TreeStrap network)
cd "$(dirname "$0")/../.."
cp tools/ai/data/first-tstrap.net.json /tmp/claude-0/tstrap-seed.net.json
node tools/ai/ladder.mjs match first-td2 first-qmax 256
node tools/ai/ladder.mjs match first-qmax tstrap@seed=/tmp/claude-0/tstrap-seed.net.json 256
node tools/ai/ladder.mjs match first-tstrap1 first-qmax 128
node tools/ai/ladder.mjs match first-explore first-qmax 128
node tools/ai/ladder.mjs match first-td-evaluated first-td2 128
