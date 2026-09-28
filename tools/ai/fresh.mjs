// A new, untrained network with the same inputs as an existing one (same courses, rule switches and board blocks).
//   node tools/ai/fresh.mjs <template.json> <out.json> [H1=256] [H2=128] [leak=0.1]
// Weights are random (scaled for ~180 active inputs per position), biases zero; train.py adds batch normalisation.
import { readFileSync, writeFileSync } from 'node:fs';
const [, , tpl, out, a = '256', b = '128', lk = '0.1'] = process.argv, T = JSON.parse(readFileSync(tpl, 'utf8')), nf = T.nf, H1 = +a, H2 = +b;
let seed = 20260928; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }, gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const init = (n, sd) => Array.from({ length: n }, () => +(gauss() * sd).toFixed(6));
const N = { course: T.course, nf, leak: +lk, w1T: init(nf * H1, 1 / Math.sqrt(180)), b1: Array(H1).fill(0), w2: init(H2 * H1, Math.sqrt(2 / H1)), b2: Array(H2).fill(0), w3: init(H2, .01), b3: [0], from: 'fresh (untrained)' };
for (const k of ['courses', 'onehot']) if (T[k] != null) N[k] = T[k];
writeFileSync(out, JSON.stringify(N));
console.log(`${out}: untrained ${nf}→${H1}→${H2}→1, leak ${lk}${T.courses ? ', courses ' + T.courses.join(', ') : ''}`);
