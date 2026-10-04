// Every check in one command. Independent checks run side by side; the timing measurements run afterwards, alone.
//   node test/run.mjs            build, import lint, rules, engine (quick), layout (6 sizes, the owner's screen included), game flows, board taps, played games (3), menus, worker bundle, frame costs, the frame budget (20 moves)  (~95 s)
//   node test/run.mjs --online   also online play end to end, against a game server the test starts itself  (+~45 s)
//   node test/run.mjs --full     everything: engine (60 games + AI on every course), layout (12 sizes), played games (6), online, board rendering
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), arg = process.argv.slice(2), full = arg.includes('--full'), online = full || arg.includes('--online');
const NODE_PATH = [process.env.NODE_PATH, execSync('npm root -g').toString().trim()].filter(Boolean).join(path.delimiter);
const t0 = Date.now(); execSync('node build.mjs', { cwd: root, stdio: 'inherit' });
/* the GPU route (lib.cjs): the game's tests on Chrome's GPU code path, one at a time (side by side they overload this machine's
   emulated GPU), at least every 5 commits (owner, 2026-10-04); a pass records the commit it ran on (test/gpu-run.txt) */
const gpuFile = path.join(root, 'test/gpu-run.txt'), head = () => execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
/* every test has a time limit that matches when it should end: what it normally takes in this run (normal: seconds, side by
   side with the others), half as much again for a busy machine (runs swing by about a fifth), and 5 s. A test past it has
   hung: it is stopped (its whole process group: browsers, servers) and fails with what it printed so far, instead of the run
   waiting (owner, 2026-10-03: never run anything without a timer that roughly matches when it's supposed to end) */
const run = ([name, cmd, normal], env = {}) => new Promise(res => { const t = Date.now(), limit = Math.round(1.5 * normal + 5); let out = '', hung = false;
  const c = spawn(cmd, { cwd: root, shell: true, detached: true, env: { ...process.env, NODE_PATH, ...env } });
  c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d);
  const timer = setTimeout(() => { hung = true; try { process.kill(-c.pid, 'SIGKILL'); } catch (e) { /* expected: it exited just now */ } }, limit * 1000);
  c.on('close', code => { clearTimeout(timer); if (hung) out += `\nFAIL ${name}: still running after ${limit} s (normally about ${normal} s): stopped as hung; its output so far is above\n`;
    res({ name, code: hung ? 'hung' : code, out, s: ((Date.now() - t) / 1000).toFixed(0) }); }); });
if (arg.includes('--gpu')) {
  const rs = [];
  for (const t of [['layout', 'node test/layout.cjs --quick', 75], ['flows', 'node test/flows.cjs', 50], ['taps', 'node test/taps.cjs', 16], ['play', 'node test/play.cjs', 130], ['menus', 'node test/menus.cjs', 24]])
    rs.push(await run(t, { GPU: '1' }));
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true }); for (const r of rs) fs.writeFileSync(path.join(root, 'test-results', 'gpu-' + r.name + '.log'), r.out); // (each test's whole output, as the suite keeps it)
  for (const r of rs) { const last = r.out.trim().split('\n').filter(l => l.trim()).pop() || ''; console.log(`${r.code ? 'FAIL' : 'ok  '} ${r.name.padEnd(7)} ${String(r.s).padStart(3)} s  ${last.slice(0, 140)}`); if (r.code) console.log(r.out.split('\n').filter(l => /^\s*FAIL\b|assertion failed/.test(l)).slice(0, 6).join('\n')); }
  const badG = rs.filter(r => r.code).length; if (!badG) fs.writeFileSync(gpuFile, head() + '\n');
  console.log(badG ? `\n${badG} failing on the GPU route` : `\nall ok on the GPU route (recorded: ${head().slice(0, 7)})`); process.exit(badG ? 1 : 0);
}
const res = await Promise.all([
  ['lint', 'node test/lint.mjs', 15],
  ['rules', 'node test/rules.test.mjs', 2],
  ['engine', 'node test/engine.test.mjs' + (full ? '' : ' --quick'), full ? 120 : 50],
  ['layout', 'node test/layout.cjs' + (full ? '' : ' --quick'), full ? 130 : 60],
  ['flows', 'node test/flows.cjs', 40],
  ['taps', 'node test/taps.cjs', 15],
  ['play', 'node test/play.cjs' + (full ? ' --games 6' : ''), full ? 180 : 80], // whole games through the UI, every assertion on (coverage)
  ['menus', 'node test/menus.cjs', 20],
  ['editor', 'node test/editor.cjs', 15],
  ['worker', 'npx wrangler deploy --dry-run --outdir /tmp/wdry', 20],
  ...(online ? [['online', 'node test/online.cjs', 290]] : []),
].map(run));
// the timing measurements (frame costs, wheel latency) need a quiet machine: they run once everything else has finished
res.push(await run(['firstpaint', 'node test/firstpaint.cjs', 12])); // (timed: run alone) the start screen drawn within 100 ms of the HTML arriving
res.push(await run(['frames', 'node test/frames.cjs', 10]));
// every frame of a game judged against 70 fps (the work on the page's main thread): the first 20 moves and every overlay; the
// whole game with --full
res.push(await run(['framebudget', 'node test/framebudget.cjs' + (full ? '' : ' --moves 20'), full ? 140 : 25]));
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
// the GPU route is due: 5 commits or more since it last passed (run.mjs --gpu)
{ let since = Infinity; try { since = +execSync(`git rev-list --count ${fs.readFileSync(gpuFile, 'utf8').trim()}..HEAD`, { cwd: root }).toString().trim(); } catch (e) { /* expected: no record yet, or one git doesn't know: due */ }
  if (since >= 5) { res.push({ name: 'gpu', code: 1, out: `FAIL the GPU route is due (${since === Infinity ? 'never recorded' : since + ' commits since it last passed'}): node test/run.mjs --gpu` }); console.log(`FAIL gpu       the GPU route is due: node test/run.mjs --gpu`); } }
const bad = res.filter(r => r.code).length;
console.log(bad ? `\n${bad} failing (${((Date.now() - t0) / 1000).toFixed(0)} s)` : `\nall ok (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(bad ? 1 : 0);
