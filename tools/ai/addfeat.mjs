// Adds optional input groups to a network without changing what it computes: the new inputs get zero weights.
//   node tools/ai/addfeat.mjs <in.json> <out.json> cards,patch        (groups: see BOT_XF in src/engine_bot.js)
import { readFileSync, writeFileSync } from 'node:fs';
const SIZE = { cards: 108, patch: 444 };
const [, , inp, out, groups] = process.argv, N = JSON.parse(readFileSync(inp, 'utf8')), H1 = N.b1.length;
const add = groups.split(',').filter(Boolean); for (const g of add) if (!SIZE[g]) throw new Error('unknown group ' + g);
const extra = [...(N.extra || []), ...add], n = add.reduce((a, g) => a + SIZE[g], 0);
const w1T = N.w1T.concat(new Array(n * H1).fill(0));
writeFileSync(out, JSON.stringify({ ...N, extra, nf: N.nf + n, w1T }));
console.log(`${inp} → ${out}: + ${add.join(', ')} (${n} inputs, zero weights; nf ${N.nf} → ${N.nf + n})`);
