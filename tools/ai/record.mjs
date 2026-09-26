// Record bot games as replayable game logs (watch them at /?replay=<id> after uploading).
//   node tools/ai/record.mjs <policies> [games=1] [seed0=random] [--upload[=https://el-dorado.shlomoalon9.workers.dev]]
//   policies: comma list per seat, e.g. net,plan,plan  (net = tools/ai/data/first.net.json)
//   FILTER=capped   keep only games where someone had not arrived by round 25
//   FILTER=netlost  keep only games a net seat did not win
// Each net decision stores the network's top alternatives with their estimated win chance (shown in the replay).
import { E } from '../../src/engine.gen.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
const args = process.argv.slice(2), flags = args.filter(a => a.startsWith('--')), pos = args.filter(a => !a.startsWith('--'));
const pols = (pos[0] || 'net,plan,plan').split(','), G = +(pos[1] || 1), seed0 = pos[2] ? +pos[2] : (Math.random() * 1e9) | 0;
const up = flags.find(f => f.startsWith('--upload')), base = up ? (up.split('=')[1] || 'https://el-dorado.shlomoalon9.workers.dev') : null;
const course = E.courseById(process.env.COURSE || 'first'), FILTER = process.env.FILTER || '';
if (pols.includes('net')) { const p = `tools/ai/data/${course.id}.net.json`; if (!existsSync(p)) throw new Error('no net at ' + p); E.setNet(JSON.parse(readFileSync(p, 'utf8'))); }
const NAME = { net: 'Bot (net)', plan: 'Planner', heur: 'Heuristic' };
mkdirSync('tools/ai/data/replays', { recursive: true });
const slim = a => { const o = { ...a }; for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o; };
let kept = 0;
for (let g = 0; g < G; g++) {
  const seed = seed0 + g, log = { kind: 'eldorado-replay', v: 1, course: course.id, seed, rng: (seed * 2654435761) >>> 0, fullRace: true,
    players: pols.map((p, i) => ({ name: `${NAME[p] || p} ${i + 1}`, bot: p })), actions: [], notes: [] };
  const gen = E.replayStart(log);
  let acts = 0, capped = false;
  while (!E.S.over) {
    const S = E.S; S.log.length = 0;
    if (S.round > 25 || acts++ > 20000) { capped = true; break; }
    const me = S.cur, pol = pols[me];
    E.setRng(null); // the bots' look-ahead must not use up the game's shuffle stream
    const c = E.botChoose({ mode: pol, explain: true });
    E.setRng(gen);
    const r = E.applyAction(me, c.a), a = r.ok ? c.a : { t: 'end', keep: [] };
    if (!r.ok) E.applyAction(me, a);
    log.actions.push([me, slim(a)]);
    log.notes.push(c.alts ? { v: +c.v.toFixed(3), alts: c.alts.map(x => ({ a: slim(x.a), v: x.v === -Infinity ? null : +x.v.toFixed(3) })) } : null);
  }
  E.setRng(null);
  const S = E.S, fin = S.players.map(p => p.fin), netLost = pols.some((p, i) => p === 'net') && !pols.some((p, i) => p === 'net' && S.places && S.places[i] === 1);
  if (FILTER === 'capped' && !capped) continue;
  if (FILTER === 'netlost' && !netLost) continue;
  log.title = `${pols.join(' vs ')} · seed ${seed}${capped ? ' · hit the 25-round cap' : ''}`;
  log.result = { capped, arrived: fin };
  const file = `tools/ai/data/replays/${course.id}-${seed}.json`;
  writeFileSync(file, JSON.stringify(log)); kept++;
  let link = '';
  if (base) {
    const res = await fetch(base + '/api/replays', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(log) });
    const j = await res.json().catch(() => ({}));
    link = res.ok ? `${base}/?replay=${j.id}` : `upload failed: ${res.status} ${j.error || ''}`;
  }
  console.log(`${file} · ${log.actions.length} actions · rounds ${S.round} · arrived ${fin.join('/')}${capped ? ' · CAPPED' : ''}${link ? ' · ' + link : ''}`);
}
if (!kept) console.log('no game matched the filter');
