// Writes training-progress.md (repo root, not committed) from tools/ai/data/<course>.log.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const C = process.argv[2] || 'first', LOG = `tools/ai/data/${C}.log`, OUT = 'training-progress.md';
const NAMES = { explorer:'Explorer',traveler:'Traveler',sailor:'Sailor',scout:'Scout',trailblazer:'Trailblazer',pioneer:'Pioneer',giant:'Giant Machete',captain:'Captain',photographer:'Photographer',journalist:'Journalist',chest:'Treasure Chest',millionaire:'Millionaire',jack:'Jack of All Trades',adventurer:'Adventurer',plane:'Prop Plane',transmitter:'Transmitter',cartographer:'Cartographer',scientist:'Scientist',compass:'Compass',travellog:'Travel Log',native:'Native' };
const lines = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n') : [];
const J = l => { try { return JSON.parse(l.slice(l.indexOf('{'))); } catch (e) { return null; } };
const t0 = lines.length ? lines[0].slice(1, 9) : '';
let stage = '', games = 0, rows = [], it = 0, lastGen = null, heurBase = null, bestWr = null;
for (const l of lines) {
  if (l.includes('STAGE')) { stage = l.replace(/^\[.*?\] STAGE /, ''); const m = l.match(/iter (\d+)/); if (m) it = +m[1]; }
  if (l.includes('GEN')) { const j = J(l); if (j) { games += j.games; lastGen = j; if (!heurBase && j.mode === 'heur') heurBase = j; } }
  if (l.includes(' EVAL')) { const j = J(l); if (j) { rows.push({ it, ...j, games }); games += j.games; } }
  if (l.includes('BEST')) bestWr = l.split('rate ')[1];
}
const pct = x => x == null ? '–' : (x * 100).toFixed(0) + '%', n = x => x == null ? '–' : x;
let md = `# Bot training: First Expedition\n\n_Updated ${new Date().toISOString().slice(11, 19)} UTC · started ${t0} · refreshes every 2 minutes_\n\n`;
md += `**Now:** ${stage || 'starting…'}\n\n**Games played so far:** ${games.toLocaleString()} · **best win rate vs heuristic bots:** ${bestWr ? pct(+bestWr) : '–'}\n\n`;
md += `### Test matches after each iteration\n3-player games: the trained bot against two heuristic bots (seats rotated), plus some 3-bot races where all three are the trained bot.\nA **33% win rate = as strong as the heuristic**; higher is better. **Rounds** = the round in which an explorer reaches El Dorado (lower is faster).\n\n`;
md += `| Iter | Games so far | Bot win rate | Bot arrives in round | Heuristic arrives in round | 3 bots racing: first arrival | Games hitting the 60-round cap |\n|---|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.it} | ${r.games.toLocaleString()} | **${pct(r.netWinRate)}** | ${n(r.netArrival)} | ${n(r.heurArrival)} | ${n(r.raceFirstArrival)} | ${r.capped} |\n`;
if (!rows.length) md += `| – | – | – | – | – | – | – |\n`;
if (lastGen && (lastGen.buysNet || lastGen.buysHeur)) {
  const b = lastGen.mode === 'self' ? lastGen.buysNet : lastGen.buysHeur, tot = Object.values(b || {}).reduce((a, x) => a + x, 0) || 1;
  md += `\n### What it buys (latest ${lastGen.mode === 'self' ? 'self-play' : 'heuristic'} batch, ${lastGen.games} games${lastGen.mode === 'self' ? ', includes 15% random purchases for exploration' : ''})\n\n| Card | Bought | Share |\n|---|---|---|\n`;
  for (const [t, c] of Object.entries(b || {}).sort((a, b) => b[1] - a[1])) md += `| ${NAMES[t] || t} | ${c} | ${(c / tot * 100).toFixed(1)}% |\n`;
  const never = Object.keys(NAMES).filter(t => !['explorer', 'traveler', 'sailor'].includes(t) && !(b || {})[t]); if (never.length) md += `\nNever bought in this batch: ${never.map(t => NAMES[t]).join(', ')}\n`;
}
md += `\n### Reference\n- Heuristic bot, 3 players, no noise: first arrival ≈ round 16. Random play never finishes (all games hit the cap).\n- Training games mix 2–4 players and add noise, so their round numbers run a little higher than the clean test games.\n`;
writeFileSync(OUT, md);
