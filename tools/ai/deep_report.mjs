// Live report for tools/ai/deep.mjs (deep planner vs the regular planner): writes deep-progress.md (published as DEEP.md).
//   node tools/ai/deep_report.mjs [depth=2] [games planned=24]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { lineChart } from './charts.mjs';
const [, , D = '2', PLAN = '24'] = process.argv, f = `tools/ai/data/deep-${D}.jsonl`;
if (!existsSync(f)) process.exit(0);
const rows = readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).sort((a, b) => a.g - b.g);
const pct = x => (x * 100).toFixed(0) + '%', name = p => p === 'deep' ? '**Deep**' : 'Regular';
let wD = 0, expD = 0, seatsD = 0, cpu = 0, turns = 0; const arrD = [], arrP = [];
for (const r of rows) for (const x of r.players) { const win = x.place === 1 && !(r.capped && !x.fin);
  if (x.p === 'deep') { seatsD++; expD += 1 / r.n; if (win) wD++; if (x.fin) arrD.push(x.fin); } else if (x.fin) arrP.push(x.fin); }
for (const r of rows) { cpu += r.deepCpuSec; turns += r.deepTurns; }
const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '–';
const fair = expD ? wD / expD : 0, se = expD ? Math.sqrt(expD * (1 - expD / seatsD)) / expD : 0;
let md = `# Deep search vs regular search\n\n_Updated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · ${rows.length} of ${PLAN} games played_\n\n`;
md += `**Deep search:** the regular whole-turn planner (beam 3) picks its best 3 complete turns; each is played forward ${D} more of my turns `
  + `(everyone uses the regular planner, hidden cards dealt at random, the same deals for every candidate) and the best one is played. `
  + `**Opponents:** the regular planner. Everyone uses the same current network. One deep seat per game; 3- and 4-player games alternate; seats rotate.\n\n`;
md += `| | Deep search |\n|---|---|\n| Wins | **${wD} of ${rows.length}** games |\n| vs its fair share (1.00 = as good as regular search) | **${fair.toFixed(2)}×** (± ${(1.96 * se).toFixed(2)}, 95%) |\n`
  + `| Arrival round (deep / regular) | ${avg(arrD)} / ${avg(arrP)} |\n| Thinking time | ${turns ? (cpu / turns).toFixed(1) : '–'} CPU-seconds per turn |\n\n`;
{ let w = 0, e = 0; const cum = rows.map((r, i) => { const x = r.players.find(q => q.p === 'deep'); if (x.place === 1 && !(r.capped && !x.fin)) w++; e += 1 / r.n; return [i + 1, w / e]; });
  if (cum.length) { writeFileSync('deep-cum.svg', lineChart({ title: 'Deep search: wins so far vs its fair share', sub: 'After each game. 1.00 = as good as regular search; early values swing a lot.',
    xLabel: 'Games played', x: [1, Math.max(2, +PLAN)], y: [0, 3], yTicks: [0, 0.5, 1, 1.5, 2, 2.5, 3], fmtY: v => (+v).toFixed(2) + '×', refs: [{ y: 1, label: 'regular search' }],
    series: [{ name: 'Deep', pts: cum, dots: cum }] })); md += `![Deep search wins so far](deep-cum.svg)\n\n`; } }
md += `## Game by game\n\n| # | Players | Deep's seat | Winner | Deep's place | Deep arrived | Deep's thinking |\n|---|---|---|---|---|---|---|\n`;
for (const r of rows) { const d = r.players.findIndex(x => x.p === 'deep'), w = r.players.findIndex(x => x.place === 1), x = r.players[d];
  md += `| ${r.g + 1} | ${r.n} | ${d + 1} | ${name(r.players[w].p)} (seat ${w + 1}) | ${x.place} of ${r.n} | ${x.fin ? 'round ' + x.fin : 'no'} | ${(r.deepCpuSec / r.deepTurns).toFixed(1)} s/turn |\n`; }
writeFileSync('deep-progress.md', md);
