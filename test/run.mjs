// Every check in one command. Independent checks run side by side; the timing measurements run afterwards, alone.
//   node test/run.mjs            build, import lint, rules, engine (quick), layout (6 sizes, the owner's screen included), game flows, board taps, played games (3), menus, worker bundle, frame costs  (~60 s)
//   node test/run.mjs --online   also online play end to end, against a game server the test starts itself  (+~45 s)
//   node test/run.mjs --full     everything: engine (60 games + AI on every course), layout (12 sizes), played games (6), online, board rendering
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), arg = process.argv.slice(2), full = arg.includes('--full'), online = full || arg.includes('--online');
const NODE_PATH = [process.env.NODE_PATH, execSync('npm root -g').toString().trim()].filter(Boolean).join(path.delimiter);
const t0 = Date.now(); execSync('node build.mjs', { cwd: root, stdio: 'inherit' });
const run = ([name, cmd]) => new Promise(res => { const t = Date.now(); let out = '';
  const c = spawn(cmd, { cwd: root, shell: true, env: { ...process.env, NODE_PATH } });
  c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d);
  c.on('close', code => res({ name, code, out, s: ((Date.now() - t) / 1000).toFixed(0) })); });
const res = await Promise.all([
  ['lint', 'node test/lint.mjs'],
  ['rules', 'node test/rules.test.mjs'],
  ['engine', 'node test/engine.test.mjs' + (full ? '' : ' --quick')],
  ['layout', 'node test/layout.cjs' + (full ? '' : ' --quick')],
  ['flows', 'node test/flows.cjs'],
  ['taps', 'node test/taps.cjs'],
  ['play', 'node test/play.cjs' + (full ? ' --games 6' : '')], // whole games through the UI, every assertion on (coverage)
  ['menus', 'node test/menus.cjs'],
  ['worker', 'npx wrangler deploy --dry-run --outdir /tmp/wdry'],
  ...(online ? [['online', 'node test/online.cjs']] : []),
].map(run));
// the timing measurements (frame costs, wheel latency) need a quiet machine: they run once everything else has finished
res.push(await run(['firstpaint', 'node test/firstpaint.cjs'])); // (timed: run alone) the start screen drawn within 100 ms of the HTML arriving
res.push(await run(['frames', 'node test/frames.cjs']));
if (full) res.push(await run(['render', 'node test/render.cjs']));
for (const r of res) { const last = r.out.trim().split('\n').filter(l => l.trim()).pop() || ''; console.log(`${r.code ? 'FAIL' : 'ok  '} ${r.name.padEnd(7)} ${String(r.s).padStart(3)} s  ${last.slice(0, 110)}`); }
// every test's whole output is kept (test-results/<name>.log); for a failing test, every failure is printed in full, wherever
// it came in the output, with the indented detail lines under it (the end of the output only when a test crashed before
// reporting any: a failure is never cut off for coming early)
fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
for (const r of res) fs.writeFileSync(path.join(root, 'test-results', r.name + '.log'), r.out);
for (const r of res.filter(r => r.code)) {
  const lines = r.out.split('\n'), shown = [];
  lines.forEach((l, i) => { if (/^\s*FAIL\b/.test(l)) { shown.push(l); for (let j = i + 1; j < lines.length && /^\s{2,}\S/.test(lines[j]) && !/^\s*(ok|FAIL)\b/.test(lines[j]); j++) shown.push(lines[j]); } });
  const body = shown.length ? shown.join('\n') : '(no FAIL line: it stopped before reporting; its last lines)\n' + lines.filter(l => l.trim()).slice(-40).join('\n');
  console.log(`\n---- ${r.name} (whole output: test-results/${r.name}.log) ----\n${body}`);
}
const bad = res.filter(r => r.code).length;
console.log(bad ? `\n${bad} failing (${((Date.now() - t0) / 1000).toFixed(0)} s)` : `\nall ok (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(bad ? 1 : 0);
