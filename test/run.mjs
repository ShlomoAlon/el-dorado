// All the checks, in one command, run side by side:
//   node test/run.mjs          build, lint, engine (quick), layout (5 sizes), game flows, worker bundle; then frame costs  (~45 s)
//   node test/run.mjs --full   engine (all 60 games + AI on every course), layout (11 sizes), board rendering as well
// (the online end-to-end test needs a local server: see CLAUDE.md)
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), full = process.argv.includes('--full');
const NODE_PATH = [process.env.NODE_PATH, execSync('npm root -g').toString().trim()].filter(Boolean).join(path.delimiter);
const t0 = Date.now(); execSync('node build.mjs', { cwd: root, stdio: 'inherit' });
const jobs = [
  ['lint', 'node test/lint.mjs'],
  ['engine', 'node test/engine.test.mjs' + (full ? '' : ' --quick')],
  ['layout', 'node test/layout.cjs' + (full ? '' : ' --quick')],
  ['flows', 'node test/flows.cjs'],
  ['worker', 'npx wrangler deploy --dry-run --outdir /tmp/wdry'],
];
const run = ([name, cmd]) => new Promise(res => { const t = Date.now(); let out = '';
  const c = spawn(cmd, { cwd: root, shell: true, env: { ...process.env, NODE_PATH } });
  c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d);
  c.on('close', code => res({ name, code, out, s: ((Date.now() - t) / 1000).toFixed(0) })); });
const res = await Promise.all(jobs.map(run));
// the timing measurements (frame costs, wheel latency) need a quiet machine: they run once everything else has finished
res.push(await run(['frames', 'node test/frames.cjs']));
if (full) res.push(await run(['render', 'node test/render.cjs']));
for (const r of res) { const last = r.out.trim().split('\n').filter(l => l.trim()).pop() || ''; console.log(`${r.code ? 'FAIL' : 'ok  '} ${r.name.padEnd(7)} ${String(r.s).padStart(3)} s  ${last.slice(0, 110)}`); }
for (const r of res.filter(r => r.code)) console.log(`\n---- ${r.name} ----\n${r.out.trim().split('\n').slice(-40).join('\n')}`);
const bad = res.filter(r => r.code).length;
console.log(bad ? `\n${bad} failing (${((Date.now() - t0) / 1000).toFixed(0)} s)` : `\nall ok (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(bad ? 1 : 0);
