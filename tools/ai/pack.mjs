// Packs a trained network (tools/ai/models/*.json, ~1.6 MB of JSON) into the compact binary the game ships:
//   node tools/ai/pack.mjs [tools/ai/models/first-qmax.json] [src/ai/first.bin]
// Format: uint32 LE header length, UTF-8 JSON header {course,nf,unsettled,leak,name,parts:[[key,length],…], and for a network
// with other inputs: courses, onehot, extra (engine_bot.js botNetNF)}, padding to an even
// offset, then every array as IEEE half floats (little endian) in header order. Decoded by aiNetDecode (src/engine_ai.js).
// Half floats keep ~3 significant digits; the network's outputs move by about 1e-3 (checked by test/engine.test.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';
const src = process.argv[2] || 'tools/ai/models/first-qmax.json', out = process.argv[3] || 'src/ai/first.bin';
const N = JSON.parse(readFileSync(src, 'utf8'));
const keys = ['w1T', 'b1', 'w2', 'b2', 'w3', 'b3'];
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
function toHalf(v) { // round to nearest even
  f32[0] = v; const x = u32[0], sign = (x >>> 16) & 0x8000, e = (x >>> 23) & 0xff, m = x & 0x7fffff;
  if (e === 255) return sign | 0x7c00 | (m ? 0x200 : 0);
  let E = e - 127 + 15;
  if (E >= 31) return sign | 0x7c00;
  if (E <= 0) { if (E < -10) return sign; const mm = (m | 0x800000) >>> (1 - E); const r = mm >>> 13, rem = mm & 0x1fff; return sign | (r + ((rem > 0x1000 || (rem === 0x1000 && (r & 1))) ? 1 : 0)); }
  let r = (E << 10) | (m >>> 13); const rem = m & 0x1fff;
  if (rem > 0x1000 || (rem === 0x1000 && (r & 1))) r++;
  return sign | r;
}
const inputs = Object.fromEntries(['courses', 'onehot', 'extra'].filter(k => N[k] !== undefined).map(k => [k, N[k]])); // (what the network's inputs are)
const header = JSON.stringify({ name: basename(src, '.json'), course: N.course, nf: N.nf, unsettled: !!N.unsettled, leak: N.leak ?? 0.01, ...inputs, parts: keys.map(k => [k, N[k].length]) });
const hb = new TextEncoder().encode(header), off = 4 + hb.length + ((4 + hb.length) & 1);
const total = keys.reduce((a, k) => a + N[k].length, 0), buf = new Uint8Array(off + total * 2), dv = new DataView(buf.buffer);
dv.setUint32(0, hb.length, true); buf.set(hb, 4);
let o = off; for (const k of keys) for (const v of N[k]) { dv.setUint16(o, toHalf(v), true); o += 2; }
mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, buf);
console.log(`${src} → ${out}: ${total} weights, ${buf.length} bytes`);
