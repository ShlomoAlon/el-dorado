// Revive dead hidden units (never positive on real positions): give each one fresh incoming weights (scaled like the live units',
// bias set so it is positive on about half of the positions) and zero outgoing weights. The network's output only changes by the
// tiny leak those units had (leaky ReLU 0.01·x), so it plays essentially the same; training can then use the revived units.
//   node tools/ai/revive.mjs <in.json> <out.json> [games per course=20]
import * as E from '../../src/engine.gen.js';
import { playout, seatPlayers } from './playout.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const [, , inp, out, G = '20'] = process.argv;
const N = JSON.parse(readFileSync(inp, 'utf8')), H1 = N.b1.length, H2 = N.b2.length, courses = N.courses || [N.course];
E.aiSetNet(N); const pos = [];
for (const id of courses) for (let g = 0; g < +G; g++) {
  const n = g % 2 ? 4 : 3, rnd = E.mulberry32(g + 3);
  const { gs } = playout({ seed: 61000 + g, players: seatPlayers(n), course: E.courseById(id), cap: 30, choose: gs => E.botChoose(gs, { mode: 'net', rnd, temp: .02 }).a,
    after: gs => { if (!gs.over && rnd() < .2) for (let p = 0; p < n; p++) if (!gs.players[p].fin) pos.push(E.botNetFeatures(gs, p)); } });
}
const fwd = f => { const h1 = Float64Array.from(N.b1); for (let k = 0; k < f.length; k++) { const x = f[k]; if (!x) continue; for (let j = 0; j < H1; j++) h1[j] += N.w1T[k * H1 + j] * x; } return h1; };
const pre1 = pos.map(fwd), a1 = pre1.map(h => h.map(x => x > 0 ? x : .01 * x));
const pre2 = a1.map(h => { const o = new Float64Array(H2); for (let j = 0; j < H2; j++) { let a = N.b2[j]; for (let k = 0; k < H1; k++) a += N.w2[j * H1 + k] * h[k]; o[j] = a; } return o; });
const dead = (pre, H) => [...Array(H).keys()].filter(j => pre.every(p => p[j] <= 0));
const d1 = dead(pre1, H1), d2 = dead(pre2, H2);
let seed = 12345; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }, gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const median = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
// layer 1: new incoming weights with the live units' typical scale (per input row), bias = −median so ~half the positions activate it
const live1 = [...Array(H1).keys()].filter(j => !d1.includes(j)), nf = N.nf;
const rms1 = Math.sqrt(live1.reduce((s, j) => { let t = 0; for (let k = 0; k < nf; k++) t += N.w1T[k * H1 + j] ** 2; return s + t / nf; }, 0) / live1.length);
for (const j of d1) { for (let k = 0; k < nf; k++) N.w1T[k * H1 + j] = gauss() * rms1; N.b1[j] = 0;
  const z = pos.map(f => { let s = 0; for (let k = 0; k < f.length; k++) if (f[k]) s += N.w1T[k * H1 + j] * f[k]; return s; }); N.b1[j] = -median(z);
  for (let i = 0; i < H2; i++) N.w2[i * H1 + j] = 0; }
// layer 2: same for dead second-layer units (inputs = layer-1 activations, which the revived layer-1 units don't reach: their w2 is 0)
const live2 = [...Array(H2).keys()].filter(j => !d2.includes(j)), rms2 = Math.sqrt(live2.reduce((s, j) => { let t = 0; for (let k = 0; k < H1; k++) t += N.w2[j * H1 + k] ** 2; return s + t / H1; }, 0) / live2.length);
for (const j of d2) { for (let k = 0; k < H1; k++) N.w2[j * H1 + k] = d1.includes(k) ? 0 : gauss() * rms2; const z = a1.map(h => { let s = 0; for (let k = 0; k < H1; k++) s += N.w2[j * H1 + k] * h[k]; return s; }); N.b2[j] = -median(z); N.w3[j] = 0; }
N.revived = (N.revived || 0) + d1.length + d2.length;
delete N._p; // the engine caches typed copies of the weights; they were changed in place above
writeFileSync(out, JSON.stringify(N));
// check: how much did the output change on these positions?
const O = JSON.parse(readFileSync(inp, 'utf8')); let maxd = 0, sum = 0;
for (const f of pos.slice(0, 3000)) { E.aiSetNet(O); const a = E.botNetValue(f); E.aiSetNet(N); const b = E.botNetValue(f); maxd = Math.max(maxd, Math.abs(a - b)); sum += Math.abs(a - b); }
console.log(`${inp}: ${pos.length} positions on ${courses.join(', ')} · revived ${d1.length}/${H1} layer-1 and ${d2.length}/${H2} layer-2 units → ${out} · value change: mean ${(sum / Math.min(3000, pos.length)).toExponential(1)}, max ${maxd.toExponential(1)}`);
