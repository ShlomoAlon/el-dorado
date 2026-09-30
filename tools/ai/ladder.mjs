// Ladder of frozen networks: head-to-head matches recorded game by game, ratings fitted from every game ever played.
//   node tools/ai/ladder.mjs match <A> <B> [games per table size=256] [workers=4]
//      A, B = a frozen model name (tools/ai/models/<name>.json) or name=path for a live network (e.g. tstrap@9=tools/ai/data/first-tstrap.net.json)
//      Each game seats A+search, A, B+search, B (4 players) or three of them in turn (3 players); seats rotated; fixed seeds per match.
//   node tools/ai/ladder.mjs report      → writes ladder-progress.md (published as LADDER.md)
// Every game goes to tools/ai/data/ladder.jsonl. Ratings: Elo scale, fitted by maximum likelihood over every pair of players in
// every game (who finished ahead; ties count half), anchored at first-td2 (plain) = 1500. ± is one standard error.
import * as E from '../../src/engine.gen.js';
import { playout, seatPlayers } from './playout.mjs';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
const LOG = 'tools/ai/data/ladder.jsonl';
const load = s => { const [name, path] = s.includes('=') ? s.split('=') : [s, `tools/ai/models/${s}.json`]; return { name, net: JSON.parse(readFileSync(path, 'utf8')) }; };
if (!isMainThread) {
  const { from, to, A, B, seed0 } = workerData, POLS = [A.name + '+s', A.name, B.name + '+s', B.name], nets = { [A.name]: A.net, [B.name]: B.net };
  for (let g = from; g < to; g++) {
    const n = g % 2 ? 4 : 3, k = g >> 1, base = n === 4 ? POLS : POLS.filter((_, i) => i !== k % 4), pols = base.map((_, i) => base[(i + (k >> 2)) % n]);
    const rnd = E.mulberry32(seed0 * 7 + g);
    const { gs, capped } = playout({ seed: seed0 + g, players: seatPlayers(n), choose: (gs, me) => {
      const p = pols[me], s = p.endsWith('+s'); E.aiSetNet(nets[s ? p.slice(0, -2) : p]);
      return E.botChoose(gs, { mode: 'net', rnd, search: s ? { kind: 'plan', beam: 3 } : undefined }).a; } });
    // not arriving by the cap counts as last (tied with anyone else who didn't arrive)
    const seats = pols.map((p, i) => { const P = gs.players[i], fail = capped && !P.fin; return { id: p, place: fail ? n : gs.places[i], fin: P.fin || null }; });
    parentPort.postMessage({ game: { time: new Date().toISOString(), match: `${A.name} vs ${B.name}`, g, n, capped, seats } });
  }
  parentPort.postMessage({ done: true });
} else if (process.argv[2] === 'match') {
  const [, , , a, b, G = '256', W = '4'] = process.argv, A = load(a), B = load(b), N = 2 * +G, per = Math.ceil(N / +W), seed0 = 100000 + Math.floor(Math.random() * 1e6) * 10;
  const t0 = Date.now(), tally = {};
  await Promise.all([...Array(+W)].map((_, w) => new Promise((ok, bad) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { from: w * per, to: Math.min(N, (w + 1) * per), A, B, seed0 } });
    wk.on('message', m => { if (m.done) return ok(); appendFileSync(LOG, JSON.stringify(m.game) + '\n'); for (const s of m.game.seats) { const t = tally[s.id] = tally[s.id] || { wins: 0, seats: 0 }; t.seats++; if (s.place === 1) t.wins++; } });
    wk.on('error', bad); })));
  console.log(`${A.name} vs ${B.name}: ${N} games in ${((Date.now() - t0) / 1000).toFixed(0)} s · wins: ` + Object.entries(tally).map(([k, t]) => `${k} ${t.wins}/${t.seats}`).join(' · '));
} else if (process.argv[2] === 'report') {
  const games = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  // the same weights under two names (a snapshot later frozen as a model) count as one player: tools/ai/data/ladder-alias.json
  const AL = existsSync('tools/ai/data/ladder-alias.json') ? JSON.parse(readFileSync('tools/ai/data/ladder-alias.json', 'utf8')) : {};
  const alias = id => { const s = id.endsWith('+s'), b = s ? id.slice(0, -2) : id; return (AL[b] || b) + (s ? '+s' : ''); };
  for (const g of games) for (const x of g.seats) x.id = alias(x.id);
  const ids = [...new Set(games.flatMap(g => g.seats.map(s => s.id)))], ix = Object.fromEntries(ids.map((id, i) => [id, i]));
  const pairs = []; // [winner index, loser index, weight]
  for (const g of games) for (let i = 0; i < g.seats.length; i++) for (let j = i + 1; j < g.seats.length; j++) {
    const a = g.seats[i], b = g.seats[j]; if (a.place < b.place) pairs.push([ix[a.id], ix[b.id], 1]); else if (b.place < a.place) pairs.push([ix[b.id], ix[a.id], 1]); else { pairs.push([ix[a.id], ix[b.id], .5]); pairs.push([ix[b.id], ix[a.id], .5]); } }
  // Bradley-Terry by Newton-free gradient ascent on log-likelihood (natural units), tiny prior toward 0 so unlinked players stay finite
  const r = new Float64Array(ids.length); for (let it = 0; it < 3000; it++) { const gr = new Float64Array(ids.length);
    for (const [w, l, wt] of pairs) { const p = 1 / (1 + Math.exp(r[l] - r[w])); gr[w] += wt * (1 - p); gr[l] -= wt * (1 - p); }
    for (let i = 0; i < ids.length; i++) r[i] += 0.5 * (gr[i] - 0.001 * r[i]) / Math.max(1, pairs.length / ids.length); }
  const info = new Float64Array(ids.length); for (const [w, l, wt] of pairs) { const p = 1 / (1 + Math.exp(r[l] - r[w])); info[w] += wt * p * (1 - p); info[l] += wt * p * (1 - p); }
  const K = 400 / Math.LN10, anchor = ix['first-td2'] ?? 0, elo = i => 1500 + K * (r[i] - r[anchor]), se = i => K / Math.sqrt(info[i] || 1e-9);
  const rows = ids.map((id, i) => { const mine = games.filter(g => g.seats.some(s => s.id === id)); return { id, elo: elo(i), se: se(i), games: mine.length, wins: mine.filter(g => g.seats.find(s => s.id === id).place === 1).length }; }).sort((a, b) => b.elo - a.elo);
  const matches = [...new Set(games.map(g => g.match))];
  let md = `# Model ladder: every frozen network, with and without search\n\n_Updated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · ${games.length.toLocaleString()} games · ${matches.length} matches_\n\n`;
  md += `Ratings are fitted from every game (who finished ahead of whom), Elo scale, anchored at **first-td2 (plain) = 1500**. `
    + `"+s" = the same network planning whole turns (the in-game Humboldt AI plays this way). ± is one standard error: two ratings are clearly different when they differ by more than about 3× the larger ±. `
    + `A new network is **promoted** (becomes the best, and Humboldt's network) only when its +s rating beats the current best's +s by more than 2 standard errors of the difference.\n\n`;
  md += `| Rank | Player | Rating | ± | Games | Wins |\n|---|---|---|---|---|---|\n`;
  rows.forEach((x, i) => md += `| ${i + 1} | ${x.id.replace('+s', ' **+search**')} | **${Math.round(x.elo)}** | ${Math.round(x.se)} | ${x.games} | ${x.wins} |\n`);
  md += `\n## Matches played\n\n` + matches.map(m => { const gs = games.filter(g => g.match === m); return `- ${m}: ${gs.length} games (${gs[0].time.slice(0, 16).replace('T', ' ')} – ${gs[gs.length - 1].time.slice(11, 16)} UTC)`; }).join('\n') + '\n';
  if (existsSync('tools/ai/data/promotions.log')) md += `\n## Promotions\n\n` + readFileSync('tools/ai/data/promotions.log', 'utf8').trim().split('\n').map(l => `- ${l}`).join('\n') + '\n';
  writeFileSync('ladder-progress.md', md);
  if (process.argv[3]) { const a = rows.find(x => x.id === process.argv[3]), b = rows.find(x => x.id === process.argv[4]); if (a && b) console.log(JSON.stringify({ a: a.id, b: b.id, diff: +(a.elo - b.elo).toFixed(1), se: +Math.hypot(a.se, b.se).toFixed(1) })); }
  else console.log(rows.map(x => `${x.id} ${Math.round(x.elo)}±${Math.round(x.se)} (${x.games})`).join('\n'));
}
