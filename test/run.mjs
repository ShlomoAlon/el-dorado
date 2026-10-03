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
/* every test has a time limit that matches when it should end: what it normally takes in this run (normal: seconds, side by
   side with the others), half as much again for a busy machine (runs swing by about a fifth), and 5 s. A test past it has
   hung: it is stopped (its whole process group: browsers, servers) and fails with what it printed so far, instead of the run
   waiting (owner, 2026-10-03: never run anything without a timer that roughly matches when it's supposed to end) */
const run = ([name, cmd, normal]) => new Promise(res => { const t = Date.now(), limit = Math.round(1.5 * normal + 5); let out = '', hung = false;
  const c = spawn(cmd, { cwd: root, shell: true, detached: true, env: { ...process.env, NODE_PATH } });
  c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d);
  const timer = setTimeout(() => { hung = true; try { process.kill(-c.pid, 'SIGKILL'); } catch (e) { /* expected: it exited just now */ } }, limit * 1000);
  c.on('close', code => { clearTimeout(timer); if (hung) out += `\nFAIL ${name}: still running after ${limit} s (normally about ${normal} s): stopped as hung; its output so far is above\n`;
    res({ name, code: hung ? 'hung' : code, out, s: ((Date.now() - t) / 1000).toFixed(0) }); }); });
const res = await Promise.all([
  ['lint', 'node test/lint.mjs', 15],
  ['rules', 'node test/rules.test.mjs', 2],
  ['engine', 'node test/engine.test.mjs' + (full ? '' : ' --quick'), full ? 120 : 50],
  ['layout', 'node test/layout.cjs' + (full ? '' : ' --quick'), full ? 130 : 60],
  ['flows', 'node test/flows.cjs', 40],
  ['taps', 'node test/taps.cjs', 15],
  ['play', 'node test/play.cjs' + (full ? ' --games 6' : ''), full ? 180 : 80], // whole games through the UI, every assertion on (coverage)
  ['menus', 'node test/menus.cjs', 20],
  ['worker', 'npx wrangler deploy --dry-run --outdir /tmp/wdry', 20],
  ...(online ? [['online', 'node test/online.cjs', 290]] : []),
].map(run));
// the timing measurements (frame costs, wheel latency) need a quiet machine: they run once everything else has finished
res.push(await run(['firstpaint', 'node test/firstpaint.cjs', 12])); // (timed: run alone) the start screen drawn within 100 ms of the HTML arriving
res.push(await run(['frames', 'node test/frames.cjs', 10]));
if (full) res.push(await run(['render', 'node test/render.cjs', 30]));
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
