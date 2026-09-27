// Widen a value network without changing what it computes (Net2Net-style): new hidden units get small random incoming
// weights and ZERO outgoing weights, so the output is exactly the same; training then puts the new units to use.
//   node tools/ai/widen.mjs <in.json> <out.json> <H1> <H2>      (e.g. 256 128; must be ≥ the current sizes)
import { readFileSync, writeFileSync } from 'node:fs';
const [, , inp, out, a, b] = process.argv, N = JSON.parse(readFileSync(inp, 'utf8'));
const nf = N.nf, H1 = N.b1.length, H2 = N.b2.length, G1 = +a, G2 = +b;
if (!(G1 >= H1 && G2 >= H2)) throw new Error(`new sizes must be ≥ ${H1}, ${H2}`);
let seed = 424242; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }, gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const rms = arr => Math.sqrt(arr.reduce((s, x) => s + x * x, 0) / arr.length), r1 = rms(N.w1T), r2 = rms(N.w2);
const w1T = new Array(nf * G1).fill(0);
for (let k = 0; k < nf; k++) for (let j = 0; j < G1; j++) w1T[k * G1 + j] = j < H1 ? N.w1T[k * H1 + j] : gauss() * r1;
const b1 = [...N.b1, ...Array(G1 - H1).fill(0)];
const w2 = new Array(G2 * G1).fill(0); // [unit of layer 2][unit of layer 1]
for (let j = 0; j < G2; j++) for (let k = 0; k < G1; k++) w2[j * G1 + k] = j < H2 ? (k < H1 ? N.w2[j * H1 + k] : 0) : gauss() * r2;
const b2 = [...N.b2, ...Array(G2 - H2).fill(0)], w3 = [...N.w3, ...Array(G2 - H2).fill(0)];
const W = { ...N, w1T, b1, w2, b2, w3, widened: `${H1}x${H2} → ${G1}x${G2}` };
writeFileSync(out, JSON.stringify(W));
console.log(`${inp}: ${H1}→${G1} and ${H2}→${G2} hidden units → ${out} (new units: random incoming, zero outgoing — same output)`);
