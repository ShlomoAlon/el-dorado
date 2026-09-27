// How much does decision-time search improve the trained network? (experiment; not used by training or play)
//   node tools/ai/search_exp.mjs <depth: number of my turns to look ahead, e.g. 2 | 5 | 10> [games=15] [budget=1000] [seed0=70000]
// 3-player games: one searching net vs two plain nets, seats rotated; the same seeds for every depth (paired comparison).
// At each decision with more than one option the searcher spends `budget` simulated actions (~5 s of one core):
//   candidates = the plain net's top 6; successive halving (drop the worse half each round) with playouts where
//   hidden information is re-dealt at random (my deck order, opponents' hands and decks) and everyone plays the plain net;
//   a playout stops when my turn comes round DEPTH more times (or the game ends) and is scored by the net's value there
//   (exact place value once the game is over). Every candidate gets the same random deals.
// Writes a line per game and a summary; saves each game as a replay log (tools/ai/data/replays/search-<depth>-<seed>.json).
import { E } from '../../src/engine.gen.js';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
const [, , DEPTH = 'round', G = '15', BUDGET = '1000', SEED = '70000'] = process.argv;
E.setNet(JSON.parse(readFileSync('tools/ai/data/first.net.json', 'utf8')));
const LOG = `tools/ai/data/search-${DEPTH}.log`; mkdirSync('tools/ai/data/replays', { recursive: true });
const say = s => { console.log(s); appendFileSync(LOG, s + '\n'); };
const shuf = (a, g) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(g() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function playout(root, me, cand, seed, budget) { // returns [value, simulated actions]
  const g = E.mulberry32(seed); E.S = E.botClone(root); E.setRng(g);
  E.S.players.forEach((p, j) => { if (j === me) { shuf(p.deck, g); return; } const pool = shuf([...p.hand, ...p.deck], g); p.hand = pool.slice(0, p.hand.length); p.deck = pool.slice(p.hand.length); });
  let r = E.applyAction(me, cand), n = 1, away = false, turns = 0;
  while (r.ok && !E.S.over && n < budget) {
    if (E.S.cur !== me) away = true; else if (away) { away = false; if (++turns >= +DEPTH) break; } // my turn came round again
    if (E.S.round > 25) { E.endGame(); break; } // the 25-round cap: not arriving counts as a loss
    E.setRng(null); const c = E.botChoose({ mode: 'net', rnd: g }); E.setRng(g);
    r = E.applyAction(E.S.cur, c.a); n++; if (!r.ok) r = E.applyAction(E.S.cur, { t: 'end', keep: [] });
  }
  const v = E.botValue(me, 'net'); E.setRng(null); return [v, n];
}
function searchChoose(me, budget, rnd) {
  const root = E.S, sc = E.botScoreActions(me, rnd, 4); E.S = root;
  const ok = sc.filter(x => x.v > -Infinity);
  if (ok.length <= 1) return { a: (ok[0] || sc[0]).a, why: 'forced', sims: 0 };
  // estimate how long a playout is from here, then compare only as many candidates as the budget can treat equally
  const [v0, L] = playout(root, me, ok[0].a, (rnd() * 2 ** 31) | 0, budget); E.S = root;
  const C = Math.max(2, Math.min(6, Math.floor(budget / L / 2)));
  let cands = ok.slice(0, C).map(x => ({ a: x.a, v1: x.v, sum: 0, n: 0 })), used = L, sims = 1, round = 0;
  while (cands.length > 1) {
    const per = Math.max(1, Math.min(2 << round, Math.floor((budget - used) / L / cands.length))); // playouts per candidate this round
    if ((budget - used) < per * cands.length * L * .8 && round > 0) break;                        // can't finish a round for everyone
    const seeds = [...Array(per)].map(() => (rnd() * 2 ** 31) | 0);                                 // same deals for every candidate
    for (const c of cands) for (const s of seeds) { const [v, n] = playout(root, me, c.a, s, 100000); c.sum += v; c.n++; used += n; sims++; }
    E.S = root; cands.sort((x, y) => y.sum / y.n - x.sum / x.n); cands = cands.slice(0, Math.ceil(cands.length / 2)); round++;
    if (used >= budget) break;
  }
  E.S = root; const best = cands[0];
  return { a: best.a, why: best.a === ok[0].a ? 'agrees' : 'changed', sims, est: best.n ? best.sum / best.n : null };
}

const stats = { games: 0, wins: 0, place: 0, pv: 0, arr: [], changed: 0, decisions: 0, cpu: 0 };
for (let g = 0; g < +G; g++) {
  const seed = +SEED + g, me0 = g % 3, t0 = process.cpuUsage();
  const pols = [0, 1, 2].map(i => i === me0 ? `search-${DEPTH}` : 'net');
  const log = { kind: 'eldorado-replay', v: 1, course: 'first', seed, rng: (seed * 2654435761) >>> 0, fullRace: true,
    title: `search (${DEPTH} depth, ${BUDGET} simulated actions per move) vs 2 plain nets · seed ${seed}`,
    players: pols.map((p, i) => ({ name: `${p === 'net' ? 'Bot (net)' : 'Search (' + DEPTH + ')'} ${i + 1}`, bot: p === 'net' ? 'net' : p })), actions: [] };
  const gen = E.replayStart(log); let rs = (seed * 7919) >>> 0; const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
  let acts = 0, capped = false;
  while (!E.S.over) {
    if (E.S.round > 25) { capped = true; E.setRng(null); E.endGame(); break; }
    const me = E.S.cur; E.setRng(null);
    const c = me === me0 ? searchChoose(me, +BUDGET, rnd) : E.botChoose({ mode: 'net', rnd });
    if (me === me0 && c.why !== 'forced') { stats.decisions++; if (c.why === 'changed') stats.changed++; }
    E.setRng(gen); const r = E.applyAction(me, c.a); log.actions.push([me, r.ok ? c.a : { t: 'end', keep: [] }]); if (!r.ok) E.applyAction(me, { t: 'end', keep: [] });
    if (++acts > 3000) { capped = true; break; }
  }
  E.setRng(null);
  const S = E.S, P = S.players[me0], place = S.places ? S.places[me0] : 3, fail = capped && !P.fin, pv = fail ? 0 : E.botPlaceValue(place, 3);
  const u = process.cpuUsage(t0), cpu = (u.user + u.system) / 1e6;
  stats.games++; if (place === 1 && !fail) stats.wins++; stats.place += place; stats.pv += pv; if (P.fin) stats.arr.push(P.fin); stats.cpu += cpu;
  log.result = { capped, arrived: S.players.map(p => p.fin) };
  writeFileSync(`tools/ai/data/replays/search-${DEPTH}-${seed}.json`, JSON.stringify(log));
  say(`[${new Date().toISOString().slice(11, 19)}] game ${g + 1}/${G} seed ${seed} seat ${me0 + 1}: place ${place}${P.fin ? ' (arrived round ' + P.fin + ')' : ' (did not arrive)'} · others arrived ${S.players.filter((_, i) => i !== me0).map(p => p.fin || '-').join('/')} · ${cpu.toFixed(0)} s CPU`);
}
const avg = a => (a.reduce((x, y) => x + y, 0) / (a.length || 1)).toFixed(2);
say(`SUMMARY depth=${DEPTH} budget=${BUDGET}: ${stats.games} games · wins ${stats.wins} (${(stats.wins / stats.games * 100).toFixed(0)}%, fair share 33%) = ${(stats.wins / stats.games * 3).toFixed(2)}× fair · mean place ${(stats.place / stats.games).toFixed(2)} · mean place value ${(stats.pv / stats.games).toFixed(3)} · mean arrival ${avg(stats.arr)} · search changed the plain net's choice in ${stats.changed}/${stats.decisions} decisions · ${(stats.cpu / 60).toFixed(0)} min CPU`);
