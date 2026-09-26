// Writes training-progress.md (repo root, not committed) from tools/ai/data/<course>.log.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const C = process.argv[2] || 'first', LOG = `tools/ai/data/${C}.log`, OUT = 'training-progress.md';
const NAMES = { explorer:'Explorer',traveler:'Traveler',sailor:'Sailor',scout:'Scout',trailblazer:'Trailblazer',pioneer:'Pioneer',giant:'Giant Machete',captain:'Captain',photographer:'Photographer',journalist:'Journalist',chest:'Treasure Chest',millionaire:'Millionaire',jack:'Jack of All Trades',adventurer:'Adventurer',plane:'Prop Plane',transmitter:'Transmitter',cartographer:'Cartographer',scientist:'Scientist',compass:'Compass',travellog:'Travel Log',native:'Native' };
const lines = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n') : [];
const J = l => { try { return JSON.parse(l.slice(l.indexOf('{'))); } catch (e) { return null; } };
const t0 = lines.length ? lines[0].slice(1, 9) : '';
let stage = '', games = 0, rows = [], it = 0, H = null, lastGen = null, events = [];
for (const l of lines) {
  if (l.includes('STAGE')) { stage = l.replace(/^\[.*?\] STAGE /, ''); const m = l.match(/iter (\d+)/); if (m) it = +m[1]; }
  if (l.includes('HORIZON up') || l.includes('START')) events.push(l.replace(/^\[(.*?)\] /, '$1 · '));
  if (l.includes('] GEN ')) { const j = J(l); if (j) { games += j.games; lastGen = j; H = j.horizon; } }
  if (l.includes('] EVAL ')) { const j = J(l); if (j) { rows.push({ it, ...j, games }); games += j.games; } }
}
const pct = x => x == null ? '–' : (x * 100).toFixed(0) + '%', n = x => x == null ? '–' : x;
let md = `# Bot training: First Expedition\n\n_Updated ${new Date().toISOString().slice(11, 19)} UTC · started ${t0} · refreshes every 2 minutes_\n\n`;
md += `**Now:** ${stage || 'starting…'}\n\n**Games played so far:** ${games.toLocaleString()}\n\n`;
md += `**How it trains:** the network starts untrained and learns only from its own games (self-play). Games are cut short at the current **horizon** (3 rounds, then 5, 8, 12, 16, full game) and ranked by who got closest to El Dorado. The horizon grows once the bot beats the heuristic in two tests in a row (or stops improving while at least as good).\n\n`;
if (events.length) md += `**Milestones:** ${events.join(' → ')}\n\n`;
md += `### Test after each iteration: trained bot vs heuristic bots, same horizon (half 3-player, half 4-player; no 2-player games anywhere)\n**vs fair share: 1.00 = as good as the heuristic** (a fair share is 33% of 3-player games, 25% of 4-player games). "Route left" = cost of the remaining route when the game stops (lower = got further).\n\n`;
md += `| Iter | Horizon (rounds) | Games so far | vs fair share | Wins 3p / 4p | Bot route left | Heuristic route left | Bot arrives in round | Heuristic arrives in round |\n|---|---|---|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.it} | ${r.horizon} | ${r.games.toLocaleString()} | **${r.vsFair == null ? '–' : r.vsFair.toFixed(2)}** | ${r.win3p == null ? pct(r.netWinRate) + ' (3p)' : pct(r.win3p) + ' / ' + pct(r.win4p)} | ${n(r.netRemaining)} | ${n(r.heurRemaining)} | ${n(r.netArrival)} | ${n(r.heurArrival)} |\n`;
if (!rows.length) md += `| – | – | – | – | – | – | – | – | – |\n`;
if (lastGen && (lastGen.buysNet || lastGen.buysHeur)) {
  const b = lastGen.mode === 'self' ? lastGen.buysNet : lastGen.buysHeur, tot = Object.values(b || {}).reduce((a, x) => a + x, 0) || 1;
  md += `\n### What it buys (latest ${lastGen.mode === 'self' ? 'self-play' : 'heuristic'} batch, ${lastGen.games} games${lastGen.mode === 'self' ? `, horizon ${lastGen.horizon} rounds; includes exploration: softmax choices, a few random moves, a random purchase on 10% of turns` : ''})\n\n| Card | Bought | Share |\n|---|---|---|\n`;
  for (const [t, c] of Object.entries(b || {}).sort((a, b) => b[1] - a[1])) md += `| ${NAMES[t] || t} | ${c} | ${(c / tot * 100).toFixed(1)}% |\n`;
  const never = Object.keys(NAMES).filter(t => !['explorer', 'traveler', 'sailor'].includes(t) && !(b || {})[t]); if (never.length) md += `\nNever bought in this batch: ${never.map(t => NAMES[t]).join(', ')}\n`;
}
if (lastGen && lastGen.transNet) {
  const T = lastGen.transNet, tot = Object.values(T).reduce((a, x) => a + x, 0);
  md += `\n### What it takes with the Transmitter (latest self-play batch; 25% of its Transmitter turns are a forced random pick, reserve included)\n\n`;
  if (!tot) md += `No Transmitter used in this batch.\n`;
  else { md += `| Card | Taken | Share |\n|---|---|---|\n`; for (const [t, c] of Object.entries(T).sort((a, b) => b[1] - a[1])) md += `| ${NAMES[t] || t} | ${c} | ${(c / tot * 100).toFixed(1)}% |\n`; }
}
md += `\n### Reference\n- Heuristic bot, 3 players, full game: first arrival ≈ round 15–16. Random play never finishes.\n- Arrival columns stay empty until the horizon is long enough to reach El Dorado.\n`;
writeFileSync(OUT, md);
