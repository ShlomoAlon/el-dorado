// Live report of the search table (tools/ai/data/search-table.jsonl) → search-progress.md (published as SEARCH.md on ai-progress)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const F = 'tools/ai/data/search-table.jsonl', TOTAL = +(process.argv[2] || 24), SITE = 'https://el-dorado.shlomoalon9.workers.dev';
const games = existsSync(F) ? readFileSync(F, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const V = ['plain', '2 turns', '5 turns', '10 turns'], NAME = { plain: 'Plain net (no search)', '2 turns': 'Search 2 turns ahead', '5 turns': 'Search 5 turns ahead', '10 turns': 'Search 10 turns ahead' };
const agg = Object.fromEntries(V.map(v => [v, { g: 0, w: 0, place: 0, pv: 0, arr: [], think: 0, moves: 0, searched: 0, over: 0, po: 0, sa: 0 }]));
const pv = p => [1, .25, .125, 0][p - 1] ?? 0;
for (const g of games) for (const p of g.players) { const a = agg[p.variant]; if (!a) continue; a.g++; if (p.place === 1 && p.arrived) a.w++; a.place += p.place; a.pv += p.arrived || !g.capped ? pv(p.place) : 0;
  if (p.arrived) a.arr.push(p.arrived); a.think += p.thinkSec; a.moves += p.moves; a.searched += p.searched; a.over += p.overruled; a.po += p.playouts; a.sa += p.simActions; }
const avg = x => x.length ? (x.reduce((s, y) => s + y, 0) / x.length).toFixed(1) : '–', f = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d) : '–';
let md = `# Search experiment: does looking ahead make the bot stronger?\n\n_Updated ${new Date().toISOString().slice(11, 19)} UTC · ${games.length} of ${TOTAL} games finished_\n\n`;
md += `**Setup:** 4-player games on First Expedition. At every table: the plain trained network, and the same network with search looking **2, 5 and 10 of its own turns ahead**. Seats rotate every game, so each bot sits in every seat equally. Each searcher gets the same thinking budget per move (~1,000 simulated game actions ≈ 5 s of one CPU core): it takes the plain net's top candidate moves, and for each one plays the game forward many times with the hidden cards re-dealt at random (a "playout"), everyone playing the plain net; it drops the worse half of the candidates each round and picks the move whose playouts turned out best. Deeper search = fewer, longer playouts. The experiment runs at low priority so training keeps the CPU (thinking time below is CPU time).\n\n`;
md += `## Standings\n\n| Bot | Games | Wins | Win rate (fair: 25%) | Avg place | Avg place value | Avg arrival round | Thinking per move | Playouts per move | Overruled the plain choice |\n|---|---|---|---|---|---|---|---|---|---|\n`;
for (const v of V) { const a = agg[v]; md += `| ${NAME[v]} | ${a.g} | ${a.w} | **${a.g ? (a.w / a.g * 100).toFixed(0) + '%' : '–'}** | ${a.g ? f(a.place / a.g, 2) : '–'} | ${a.g ? f(a.pv / a.g, 3) : '–'} | ${avg(a.arr)} | ${a.moves ? f(a.think / a.moves, 2) + ' s' : '–'} | ${a.searched ? f(a.po / a.searched, 0) : '–'} | ${a.searched ? (a.over / a.searched * 100).toFixed(0) + '% of ' + a.searched + ' moves' : '–'} |\n`; }
md += `\nPlace value: 1st = 1, 2nd = ¼, 3rd = ⅛, 4th = 0 (the training reward). With few games, differences of a couple of wins are noise.\n\n## Game by game\n\nEach cell: **place** (round it reached El Dorado) · thinking time · playouts · overruled / searched moves.\n\n| # | Finished | Replay | ${V.map(v => NAME[v]).join(' | ')} |\n|---|---|---|${V.map(() => '---').join('|')}|\n`;
games.forEach((g, i) => { const cell = v => { const p = g.players.find(x => x.variant === v); if (!p) return '–';
  const pl = `**${['1st', '2nd', '3rd', '4th'][p.place - 1]}** (${p.arrived ? 'r' + p.arrived : 'did not arrive'})`;
  return v === 'plain' ? `${pl} · ${f(p.thinkSec, 0)} s` : `${pl} · ${f(p.thinkSec, 0)} s · ${p.playouts} playouts · ${p.overruled}/${p.searched}`; };
  md += `| ${i + 1} | ${g.time.slice(11, 16)} | ${g.replay ? `[watch](${SITE}/?replay=${g.replay})` : '–'} | ${V.map(cell).join(' | ')} |\n`; });
if (!games.length) md += `| – | – | – | ${V.map(() => '–').join(' | ')} |\n`;
writeFileSync('search-progress.md', md);
