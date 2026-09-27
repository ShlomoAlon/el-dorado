// Health check of a value network on real positions: dead / always-on hidden units, saturation, input coverage and scale,
// weight statistics, and calibration (predicted value vs the place value actually reached).
//   node tools/ai/health.mjs <net.json> [course=first] [games=40]
import { E } from '../../src/engine.gen.js';
import { readFileSync } from 'node:fs';
const [, , file, course = 'first', G = '40'] = process.argv;
const N = JSON.parse(readFileSync(file, 'utf8')), H1 = N.b1.length, H2 = N.b2.length; E.setNet(N);
const pos = []; // {f, me, g}
const outcomes = [];
for (let g = 0; g < +G; g++) {
  const n = g % 2 ? 4 : 3; E.newGame({ course: E.courseById(course), seed: 60000 + g, fullRace: true, players: [...Array(n)].map((_, i) => ({ name: 'P' + i, color: '#fff' })) });
  const rnd = E.mulberry32(g + 9), mine = [];
  while (!E.S.over && E.S.round <= 30) { const me = E.S.cur; const c = E.botChoose({ mode: 'net', rnd, temp: .01 });
    if (!E.applyAction(me, c.a).ok) E.applyAction(me, { t: 'end', keep: [] });
    if (!E.S.over && rnd() < .25) for (let p = 0; p < n; p++) if (!E.S.players[p].fin) mine.push({ f: E.botNetFeatures(p), me: p, n }); }
  if (!E.S.over) E.endGame();
  for (const x of mine) { const pl = E.S.places[x.me], fail = !E.S.players[x.me].fin; x.z = fail ? 0 : E.botPlaceValue(pl, x.n); pos.push(x); }
}
// forward pass with activations (same math as botNetValue)
const act1 = [], act2 = [], outs = [];
for (const { f } of pos) { const h1 = Float64Array.from(N.b1); for (let k = 0; k < f.length; k++) { const x = f[k]; if (!x) continue; for (let j = 0; j < H1; j++) h1[j] += N.w1T[k * H1 + j] * x; }
  const pre1 = Float64Array.from(h1); for (let j = 0; j < H1; j++) if (h1[j] < 0) h1[j] *= .01;
  const pre2 = new Float64Array(H2); let s = N.b3[0]; for (let j = 0; j < H2; j++) { let a = N.b2[j]; for (let k = 0; k < H1; k++) a += N.w2[j * H1 + k] * h1[k]; pre2[j] = a; s += N.w3[j] * (a > 0 ? a : .01 * a); }
  act1.push(pre1); act2.push(pre2); outs.push({ s, v: 1 / (1 + Math.exp(-s)) }); }
const P = pos.length, pct = x => (x * 100).toFixed(1) + '%';
const unitStats = (acts, H) => { let dead = 0, always = 0, rare = 0; const frac = []; for (let j = 0; j < H; j++) { let on = 0; for (const a of acts) if (a[j] > 0) on++; const fr = on / acts.length; frac.push(fr); if (fr === 0) dead++; else if (fr < .01) rare++; if (fr === 1) always++; } return { dead, rare, always, frac }; };
const u1 = unitStats(act1, H1), u2 = unitStats(act2, H2);
console.log(`${file} on ${course}: ${P} positions from ${G} games (nf ${N.nf}, layers ${N.nf}→${H1}→${H2}→1)`);
console.log(`hidden layer 1 (${H1}): dead (never positive) ${u1.dead} · nearly dead (<1% of positions) ${u1.rare} · always positive (acts linear) ${u1.always}`);
console.log(`hidden layer 2 (${H2}): dead ${u2.dead} · nearly dead ${u2.rare} · always positive ${u2.always}`);
// how many distinct directions the hidden layer really uses (effective rank via participation ratio of activation variance)
const pr = acts => { const H = acts[0].length, m = new Float64Array(H), v = new Float64Array(H); for (const a of acts) for (let j = 0; j < H; j++) m[j] += a[j] / acts.length; for (const a of acts) for (let j = 0; j < H; j++) v[j] += (a[j] - m[j]) ** 2; const s = v.reduce((x, y) => x + y, 0), s2 = v.reduce((x, y) => x + y * y, 0); return (s * s / s2).toFixed(1); };
console.log(`spread of use (participation ratio of unit variances): layer 1 ${pr(act1)} of ${H1} units, layer 2 ${pr(act2)} of ${H2}`);
const sat = outs.filter(o => o.v < .01 || o.v > .99).length, logit = outs.map(o => Math.abs(o.s)).sort((a, b) => a - b);
console.log(`output: saturated (<1% or >99%) ${pct(sat / P)} · |logit| median ${logit[P >> 1].toFixed(2)}, 99th pct ${logit[Math.floor(P * .99)].toFixed(2)}`);
// inputs: which are ever non-zero, which are constant, scale
let never = 0, constant = 0, big = 0; const nf = N.nf; const cnt = new Float64Array(nf), mn = new Float64Array(nf).fill(Infinity), mx = new Float64Array(nf).fill(-Infinity);
for (const { f } of pos) for (let k = 0; k < nf; k++) { const x = f[k]; if (x) cnt[k]++; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
for (let k = 0; k < nf; k++) { if (!cnt[k]) never++; else if (mn[k] === mx[k]) constant++; if (Math.max(Math.abs(mn[k]), Math.abs(mx[k])) > 3) big++; }
const K = E.BOT_NF; let neverSum = 0; for (let k = 0; k < K; k++) if (!cnt[k]) neverSum++;
console.log(`inputs: never non-zero ${never} of ${nf} (summary part: ${neverSum} of ${K}) · constant when used ${constant} · larger than ±3: ${big}`);
const wstat = a => { let s = 0, m = 0, nan = 0; for (const x of a) { if (!Number.isFinite(x)) nan++; s += x * x; m = Math.max(m, Math.abs(x)); } return `rms ${Math.sqrt(s / a.length).toFixed(3)}, max |w| ${m.toFixed(2)}${nan ? ', NON-FINITE ' + nan : ''}`; };
console.log(`weights: layer 1 ${wstat(N.w1T)} · layer 2 ${wstat(N.w2)} · output ${wstat(N.w3)}`);
// calibration: predicted value vs the place value actually reached
const bins = [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1.01].map((lo, i, a) => i < a.length - 1 ? { lo, hi: a[i + 1], p: 0, z: 0, n: 0 } : null).filter(Boolean);
pos.forEach((x, i) => { const v = outs[i].v, b = bins.find(b => v >= b.lo && v < b.hi); b.p += v; b.z += x.z; b.n++; });
let ece = 0; console.log('calibration (predicted → actual place value, positions):');
console.log('  ' + bins.filter(b => b.n).map(b => { ece += Math.abs(b.p - b.z); return `${(b.p / b.n).toFixed(2)}→${(b.z / b.n).toFixed(2)} (${b.n})`; }).join('  '));
console.log(`  mean |predicted − actual| weighted: ${(ece / P).toFixed(3)} · mean predicted ${(outs.reduce((a, o) => a + o.v, 0) / P).toFixed(3)} vs actual ${(pos.reduce((a, x) => a + x.z, 0) / P).toFixed(3)}`);
