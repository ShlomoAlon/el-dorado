// Writes training-progress.md (repo root, not committed) from tools/ai/data/<course>.log.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { lineChart, rolling } from './charts.mjs';
const C = process.argv[2] || 'first', LOG = `tools/ai/data/${C}.log`, OUT = 'training-progress.md';
const NAMES = { explorer:'Explorer',traveler:'Traveler',sailor:'Sailor',scout:'Scout',trailblazer:'Trailblazer',pioneer:'Pioneer',giant:'Giant Machete',captain:'Captain',photographer:'Photographer',journalist:'Journalist',chest:'Treasure Chest',millionaire:'Millionaire',jack:'Jack of All Trades',adventurer:'Adventurer',plane:'Prop Plane',transmitter:'Transmitter',cartographer:'Cartographer',scientist:'Scientist',compass:'Compass',travellog:'Travel Log',native:'Native' };
const lines = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n') : [];
const J = l => { try { return JSON.parse(l.slice(l.indexOf('{'))); } catch (e) { return null; } };
const t0 = lines.length ? lines[0].slice(1, 9) : '';
let resumeAt = null, stage = '', games = 0, rows = [], it = 0, H = null, lastGen = null, events = [];
for (const l of lines) {
  if (l.includes('STAGE')) { stage = l.replace(/^\[.*?\] STAGE /, ''); const m = l.match(/iter (\d+)/); if (m) it = +m[1]; }
  if (l.includes('HORIZON') || l.includes('START') || l.includes('] FIX ') || l.includes('] PAUSED ')) events.push(l.replace(/^\[(.*?)\] /, '$1 · '));
  if (l.includes('] GEN ')) { const j = J(l); if (j) { games += j.games; lastGen = j; H = j.horizon; } }
  if (l.includes('] EVAL ')) { const j = J(l); if (j) { rows.push({ it, ...j, games, time: l.slice(1, 9) }); games += j.games; } }
  if (l.includes('] RESUME ')) resumeAt = it + 1;
}
const pct = x => x == null ? '–' : (x * 100).toFixed(0) + '%', n = x => x == null ? '–' : x;
let md = `# Bot training: First Expedition\n\n_Updated ${new Date().toISOString().slice(11, 19)} UTC · started ${t0} · pushed within seconds of every change_\n\n`;
md += `**Now:** ${stage || 'starting…'}\n\n**Games played so far:** ${games.toLocaleString()}\n\n`;
md += `**How it trains:** the network starts untrained and learns only from its own games (self-play). Each game's result is what the finishing place is worth: 1st = 1, 2nd = ¼, 3rd = ⅛, last = 0 (3 players: 1 · ¼ · 0; 4 players: 1 · ¼ · ⅛ · 0); not arriving by round 25 = 0. Games are cut short at the current **horizon** (3 rounds, then 5, 8, 12, 16, then the full game capped at 25 rounds) and ranked by who got closest to El Dorado. The horizon grows once the bot beats the heuristic in two tests in a row (or stops improving while at least as good).\n\n`;
if (events.length) md += `**Milestones:** ${events.join(' → ')}\n\n`;
// charts (SVG, published next to this page): the test result per iteration and the win rates, with the curriculum marked
if (rows.length > 1) {
  const R = rows.filter(r => r.vsFair != null), X = [R[0].it, R[R.length - 1].it], marks = [];
  R.forEach((r, i) => { if (i && r.horizon !== R[i - 1].horizon) marks.push({ x: r.it, label: `horizon ${r.horizon}` }); });
  const bi = R.findIndex(r => r.time >= '23:10:00'); if (bi > 0) marks.push({ x: R[bi].it, label: 'planner benchmark' });
  if (resumeAt) marks.push({ x: resumeAt, label: 'resumed' });
  const vf = R.map(r => [r.it, r.vsFair]);
  writeFileSync('training-vsfair.svg', lineChart({ title: 'Test result per iteration: wins vs the benchmark bot (× its fair share)',
    sub: 'Dots: each test (160 games). Line: average of the last 5. 1.00 = as good as the benchmark.', xLabel: 'Training iteration',
    x: X, y: [0, 3], yTicks: [0, 0.5, 1, 1.5, 2, 2.5, 3], fmtY: v => (+v).toFixed(2) + '×', refs: [{ y: 1, label: 'benchmark' }], marks,
    series: [{ name: 'Bot', pts: rolling(vf, 5), dots: vf }] }));
  const W3 = R.filter(r => r.win3p != null), p3 = W3.map(r => [r.it, r.win3p * 100]), p4 = W3.map(r => [r.it, r.win4p * 100]);
  if (W3.length > 1) writeFileSync('training-wins.svg', lineChart({ title: 'Share of test games the bot wins', sub: 'Average of the last 5 tests. A fair share is 33% at 3 players, 25% at 4.',
    xLabel: 'Training iteration', x: [W3[0].it, W3[W3.length - 1].it], y: [0, 100], yTicks: [0, 25, 50, 75, 100], fmtY: v => Math.round(v) + '%', marks,
    refs: [{ y: 100 / 3, label: 'fair 3p' }, { y: 25, label: 'fair 4p' }],
    series: [{ name: '3 players', pts: rolling(p3, 5) }, { name: '4 players', pts: rolling(p4, 5) }] }));
  const A = R.filter(r => r.horizon >= 25 && r.netArrival && r.heurArrival);
  if (A.length > 1) writeFileSync('training-arrival.svg', lineChart({ title: 'Round the bot reaches El Dorado (lower is better)', sub: 'Full-length test games only; average of the last 5 tests.',
    xLabel: 'Training iteration', x: [A[0].it, A[A.length - 1].it], y: [13, 19], yTicks: [13, 14, 15, 16, 17, 18, 19], fmtY: v => 'r' + (+v).toFixed(1), marks: marks.filter(m => m.x >= A[0].it),
    series: [{ name: 'Bot', pts: rolling(A.map(r => [r.it, r.netArrival]), 5) }, { name: 'Heuristic', pts: rolling(A.map(r => [r.it, r.heurArrival]), 5) }] }));
  md += `![Test result per iteration](training-vsfair.svg)\n\n![Round the bot reaches El Dorado](training-arrival.svg)\n\n![Share of test games won](training-wins.svg)\n\n`;
}
md += `### Test after each iteration: trained bot vs the benchmark bots, same horizon (half 3-player, half 4-player; no 2-player games anywhere)\n**vs fair share: 1.00 = as good as the benchmark.** From 23:10 the benchmark is the stronger *planner* heuristic (it beats the old heuristic 1.54× its fair share), so the numbers drop at that point; (a fair share is 33% of 3-player games, 25% of 4-player games). "Route left" = cost of the remaining route when the game stops (lower = got further).\n\n`;
md += `| Iter | Horizon (rounds) | Games so far | vs fair share | Wins 3p / 4p | Bot route left | Heuristic route left | Bot arrives in round | Heuristic arrives in round |\n|---|---|---|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.it} | ${r.horizon} | ${r.games.toLocaleString()} | **${r.vsFair == null ? '–' : r.vsFair.toFixed(2)}** | ${r.win3p == null ? pct(r.netWinRate) + ' (3p)' : pct(r.win3p) + ' / ' + pct(r.win4p)} | ${n(r.netRemaining)} | ${n(r.heurRemaining)} | ${n(r.netArrival)} | ${n(r.heurArrival)} |\n`;
if (!rows.length) md += `| – | – | – | – | – | – | – | – | – |\n`;
if (rows.some(r => r.table && r.table.p3)) {
  const N = { net: 'New net + search', oldS: 'Old net + search', netP: 'New net, no search', old: 'Old net (frozen)', heur: 'Heuristic' };
  md += `\n### Four-way test: each player's share of the wins (adds up to 100% per table size)\n\nNew net vs the frozen old net, each with and without search. **Training progress = New net + search vs Old net + search** (search alone makes either net much stronger). 4-player tables seat all four; 3-player tables leave one out in turn. Seats rotated. Until iteration 4 of this run the old net played without search and the heuristic sat at 4-player tables.\n\n| Iter | Table | Games | ${Object.values(N).join(' | ')} |\n|---|---|---|---|---|---|---|---|\n`;
  for (const r of rows.filter(r => r.table && r.table.p3)) for (const k of ['p3', 'p4']) { const tn = r.table[k]; if (!tn) continue;
    md += `| ${r.it} | ${k[1]}-player | ${tn.games} | ${Object.keys(N).map(p => tn[p] ? `**${Math.round(tn[p].wins / tn.games * 100)}%** (${tn[p].wins})` : '–').join(' | ')} |\n`; }
}
if (lastGen && (lastGen.buysNet || lastGen.buysHeur)) {
  const b = lastGen.mode === 'self' ? lastGen.buysNet : lastGen.buysHeur, tot = Object.values(b || {}).reduce((a, x) => a + x, 0) || 1;
  md += `\n### What it buys (latest ${lastGen.mode === 'self' ? 'self-play' : 'heuristic'} batch, ${lastGen.games} games${lastGen.mode === 'self' ? `, horizon ${lastGen.horizon} rounds; exploration level ${lastGen.explore ?? 1}: softmax choices, a few random moves, and in ${Math.round(50 * (lastGen.explore ?? 1))}% of games every player starts with the same extra card (favouring cards the bot rarely buys)` : ''})\n\n| Card | Bought | Share |\n|---|---|---|\n`;
  for (const [t, c] of Object.entries(b || {}).sort((a, b) => b[1] - a[1])) md += `| ${NAMES[t] || t} | ${c} | ${(c / tot * 100).toFixed(1)}% |\n`;
  const never = Object.keys(NAMES).filter(t => !['explorer', 'traveler', 'sailor'].includes(t) && !(b || {})[t]); if (never.length) md += `\nNever bought in this batch: ${never.map(t => NAMES[t]).join(', ')}\n`;
}
if (lastGen && lastGen.transNet) {
  const T = lastGen.transNet, tot = Object.values(T).reduce((a, x) => a + x, 0);
  md += `\n### What it takes with the Transmitter (latest self-play batch; its own choices, no forced picks)\n\n`;
  if (!tot) md += `No Transmitter used in this batch.\n`;
  else { md += `| Card | Taken | Share |\n|---|---|---|\n`; for (const [t, c] of Object.entries(T).sort((a, b) => b[1] - a[1])) md += `| ${NAMES[t] || t} | ${c} | ${(c / tot * 100).toFixed(1)}% |\n`; }
}
if (lastGen && lastGen.decisions) {
  md += `\n### Every kind of decision the bot makes (latest self-play batch)\nEach of these is also explored at random now and then, so the bot keeps testing alternatives.\n\n| Decision | What it chose (count · share) |\n|---|---|\n`;
  for (const [k, v] of Object.entries(lastGen.decisions)) { const tot = Object.values(v).reduce((a, x) => a + x, 0) || 1;
    md += `| ${k} | ${Object.entries(v).sort((a, b) => b[1] - a[1]).map(([x, c]) => `${NAMES[x] || x}: ${c} (${(c / tot * 100).toFixed(0)}%)`).join(' · ')} |\n`; }
  const ex = lastGen.exploration || {}, LBL = { softmax: 'picked a near-best option (softmax)', random: 'fully random action', typed: 'random kind of decision, random option', gift: 'games with a gift card for every player', forceBuy: 'forced random purchase (retired)', forceTransmit: 'forced Transmitter pick (retired)', noBuyTurn: 'turns with buying switched off' };
  md += `\n**Exploration in that batch:** ${Object.entries(ex).map(([k, c]) => `${LBL[k] || k}: ${c}`).join(' · ') || '–'}\n`;
}
const stuckTotal = rows.reduce((a, r) => a + (r.stuck || 0), 0);
md += `\n**Full-length games where someone hadn't arrived by round 25 (likely bugs, saved for inspection):** ${stuckTotal}\n`;
md += `\n### Reference\n- Heuristic bot, 3 players, full game: first arrival ≈ round 15–16. Random play never finishes.\n- Arrival columns stay empty until the horizon is long enough to reach El Dorado.\n`;
writeFileSync(OUT, md);
