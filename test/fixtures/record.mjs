// Records test/fixtures/replay.json, the game the page tests open as a replay: three AIs on First Expedition, played to
// the end under the current rules. Run it again whenever a rules change makes the old recording unplayable.
//   node test/fixtures/record.mjs
import { S, recNewGame, aiStep, aiSetNet, aiNetDecode, recFinal, courseById } from '../../src/engine.gen.js';
import { readFileSync, writeFileSync } from 'node:fs';
aiSetNet(aiNetDecode(readFileSync(new URL('../../src/ai/first.bin', import.meta.url))));
const seats = ['humboldt', 'raleigh', 'humboldt'];
const rec = recNewGame({ course: courseById('first'), seed: 4242, fullRace: true, players: seats.map((ai, i) => ({ name: ['Humboldt', 'Raleigh', 'Humboldt 2'][i], color: ['#e5484d', '#efe9dc', '#9d7df7'][i], ai })) });
const mem = seats.map(() => ({}));
while (!S.over && S.round <= 30) aiStep(S.players[S.cur].ai, mem[S.cur], rec);
const log = recFinal(rec, S);
writeFileSync(new URL('./replay.json', import.meta.url), JSON.stringify(log));
console.log(`replay.json: ${log.actions.length} actions, ${S.round} rounds, places ${S.places}`);
