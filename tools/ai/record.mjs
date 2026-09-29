// Record bot games as replayable game logs (watch them at /?replay=<id> after uploading).
//   node tools/ai/record.mjs <policies> [games=1] [seed0=random] [--upload[=https://el-dorado.shlomoalon9.workers.dev]]
//   policies: comma list per seat, e.g. net,plan,plan  (net = tools/ai/data/first.net.json)
//     new+search / new = NEW_NET (default tools/ai/data/first-plan.net.json) with / without the whole-turn planner; old = the frozen model
//   FILTER=capped   keep only games where someone had not arrived by round 25
//   FILTER=netlost  keep only games a net seat did not win
//   FILTER=netclose keep only games a net seat won with the runner-up arriving within one round
//   SHUFFLE=1       put the net in a random seat each game
// Each net decision stores the network's top alternatives with their estimated win chance (shown in the replay).
import { E } from '../../src/engine.gen.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
const args = process.argv.slice(2), flags = args.filter(a => a.startsWith('--')), pos = args.filter(a => !a.startsWith('--'));
let pols = (pos[0] || 'net,plan,plan').split(','), G = +(pos[1] || 1), seed0 = pos[2] ? +pos[2] : (Math.random() * 1e9) | 0;
const up = flags.find(f => f.startsWith('--upload')), base = up ? (up.split('=')[1] || 'https://el-dorado.shlomoalon9.workers.dev') : null;
const course = E.courseById(process.env.COURSE || 'first'), FILTER = process.env.FILTER || '';
const NETS = {}, load = f => existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
if (pols.some(p => p === 'new' || p === 'new+search')) NETS.new = load(process.env.NEW_NET || 'tools/ai/data/first-plan.net.json');
if (pols.includes('old')) NETS.old = load('tools/ai/models/first-td-evaluated.json');
if (pols.includes('net')) { const p = `tools/ai/data/${course.id}.net.json`; if (!existsSync(p)) throw new Error('no net at ' + p); E.setNet(JSON.parse(readFileSync(p, 'utf8'))); }
const NAME = { net: 'Bot (net)', plan: 'Heuristic planner', heur: 'Heuristic', 'new+search': 'New net + search', new: 'New net', old: 'Old net' };
const optsOf = pol => { if (pol === 'new' || pol === 'new+search') E.setNet(NETS.new); else if (pol === 'old') E.setNet(NETS.old);
  return pol === 'new+search' ? { mode: 'net', search: { kind: 'plan', beam: 3 } } : pol === 'new' || pol === 'old' ? { mode: 'net', explain: true } : null; };
mkdirSync('tools/ai/data/replays', { recursive: true });
const slim = a => { const o = { ...a }; for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o; };
let kept = 0;
for (let g = 0; g < G; g++) {
  if (process.env.SHUFFLE) { const k = Math.floor(Math.random() * pols.length), j = pols.indexOf('net'); if (j >= 0) [pols[j], pols[k]] = [pols[k], pols[j]]; }
  const seed = seed0 + g, log = { kind: 'eldorado-replay', v: 1, course: course.id, seed, rng: (seed * 2654435761) >>> 0, fullRace: true,
    players: pols.map((p, i) => ({ name: `${NAME[p] || p} ${i + 1}`, bot: p })), actions: [], notes: [] };
  const gen = E.replayStart(log);
  let acts = 0, capped = false;
  while (!E.S.over) {
    const S = E.S; S.log.length = 0;
    if (S.round > 25 || acts++ > 20000) { capped = true; break; }
    const me = S.cur, pol = pols[me];
    const c = E.botChoose(optsOf(pol) || { mode: pol, explain: true }); // (its look-ahead has its own randomness: the game's stream is for the game)
    const r = E.applyAction(me, c.a, gen), a = r.ok ? c.a : { t: 'end', keep: [] };
    if (!r.ok) E.applyAction(me, a, gen);
    log.actions.push([me, slim(a)]);
    log.notes.push(c.alts ? { v: +c.v.toFixed(3), alts: c.alts.map(x => ({ a: slim(x.a), v: x.v === -Infinity ? null : +x.v.toFixed(3) })) } : null);
  }
  const S = E.S, fin = S.players.map(p => p.fin), netLost = pols.some((p, i) => p === 'net') && !pols.some((p, i) => p === 'net' && S.places && S.places[i] === 1);
  if (FILTER === 'capped' && !capped) continue;
  if (FILTER === 'netlost' && !netLost) continue;
  if (FILTER === 'netclose') { // net won, and the runner-up arrived within one round of it
    const w = pols.findIndex((p, i) => p === 'net' && S.places && S.places[i] === 1), r2 = S.places ? S.places.indexOf(2) : -1;
    if (capped || w < 0 || r2 < 0 || !fin[r2] || fin[r2] - fin[w] > 1) continue; }
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
