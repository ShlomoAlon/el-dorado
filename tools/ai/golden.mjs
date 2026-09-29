// Golden positions for the value network: seeded games (actions picked with a fixed generator from botActions), the
// network's input features and value at many positions. Engine refactors must reproduce them exactly, so trained
// networks keep working. Writes test/fixtures/features.json:  node tools/ai/golden.mjs [engine module]
import fs from 'node:fs';
const { E } = await import(/\.m?js$/.test(process.argv[2] || '') ? process.argv[2] : '../../src/engine.gen.js'); // (an engine to check can be given: node golden.mjs path/to/engine.gen.js)
const net = E.aiNetDecode(fs.readFileSync(new URL('../../src/ai/first.bin', import.meta.url)));
const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(16); };
export function golden(E, net) {
  const out = [];
  for (let g = 0; g < 6; g++) {
    const np = 3 + (g % 2), rnd = E.mulberry32(9000 + g);
    E.setRng(E.mulberry32(500 + g));
    E.newGame({ course: E.courseById('first'), seed: 1234 + g, fullRace: true, players: [...Array(np)].map((_, i) => ({ name: 'P' + i, color: '#fff' })) });
    E.aiSetNet(net);
    for (let step = 0; step < 400 && !E.S.over; step++) {
      if (step % 7 === 0) { const me = E.S.cur, f = E.botNetFeatures(me, true), nz = [];
        for (let k = 0; k < f.length; k++) if (f[k] !== 0) nz.push([k, f[k]]);
        out.push({ g, step, me, h: fnv(JSON.stringify(nz)), v: E.botNetValue(f), end: E.botNetValue(E.botEndFeatures(me, [])) }); }
      const acts = E.botActions(), a = acts[Math.floor(rnd() * acts.length)];
      if (!a || !E.applyAction(E.S.cur, a).ok) E.applyAction(E.S.cur, { t: 'end', keep: [] });
    }
    E.setRng(null);
  }
  E.aiSetNet(null);
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const G = golden(E, net);
  fs.writeFileSync(new URL('../../test/fixtures/features.json', import.meta.url), JSON.stringify(G));
  console.log('positions', G.length);
}
