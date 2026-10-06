// Every check in one command. Independent checks run side by side; the timing measurements run afterwards, alone.
//   node test/run.mjs            build, import lint, rules, engine (quick), layout (6 sizes, the owner's screen included), game flows, board taps, played games (3), menus, worker bundle, frame costs, the frame budget (20 moves), sharp text and cards  (~130 s)
//   node test/run.mjs --online   also online play end to end, against a game server the test starts itself  (+~45 s)
//   node test/run.mjs --full     everything: engine (60 games + AI on every course), layout (12 sizes), played games (6), online, board rendering
//   node test/run.mjs --gpu      the game's tests on Chrome's GPU route, one at a time (due every 5 commits)
//   node test/run.mjs --engines  the game's tests in WebKit (Safari's engine) and Firefox (desktop), one at a time (due every 10 commits): layout, flows,
//                                taps, play, menus, editor, online, firstpaint, smooth. Chrome only: frames, framebudget, render, sharp (they read Chrome's own internals)
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
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
    // a test that has grown past its normal fails here, while it still finishes: its normal is stale. (Left alone, the limit
    // drifted until the test was stopped as hung, which read as a hang: render grew from 30 s to 80 s, 2026-10-05)
    const s = (Date.now() - t) / 1000, grown = !hung && !code && s > 1.3 * normal + 3;
    if (grown) out += `\nFAIL ${name}: took ${s.toFixed(0)} s, normally about ${normal} s: it has grown, update its normal in run.mjs (or find what made it slower)\n`;
    res({ name, code: hung ? 'hung' : grown ? 'grown' : code, out, s: s.toFixed(0) }); }); });
if (arg.includes('--gpu')) {
  const rs = [];
  for (const t of [['layout', 'node test/layout.cjs --quick', 75], ['flows', 'node test/flows.cjs', 50], ['taps', 'node test/taps.cjs', 16], ['play', 'node test/play.cjs', 130], ['menus', 'node test/menus.cjs', 24]])
    rs.push(await run(t, { GPU: '1' }));
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true }); for (const r of rs) fs.writeFileSync(path.join(root, 'test-results', 'gpu-' + r.name + '.log'), r.out); // (each test's whole output, as the suite keeps it)
  for (const r of rs) { const last = r.out.trim().split('\n').filter(l => l.trim()).pop() || ''; console.log(`${r.code ? 'FAIL' : 'ok  '} ${r.name.padEnd(7)} ${String(r.s).padStart(3)} s  ${last.slice(0, 140)}`); if (r.code) console.log(r.out.split('\n').filter(l => /^\s*FAIL\b|assertion failed/.test(l)).slice(0, 6).join('\n')); }
  const badG = rs.filter(r => r.code).length; if (!badG) fs.writeFileSync(gpuFile, head() + '\n');
  console.log(badG ? `\n${badG} failing on the GPU route` : `\nall ok on the GPU route (recorded: ${head().slice(0, 7)})`); process.exit(badG ? 1 : 0);
}
/* the other engines (owner, 2026-10-05): the game's tests in Safari's engine (WebKit) and Firefox's, at least every 10 commits
   (the suite fails when it is due); a pass records the commit (test/engines-run.txt). One test at a time, as on the GPU route:
   side by side they crowded this machine until timed waits failed (the terrain's 8 s, in WebKit, 2026-10-05). Firefox at
   desktop sizes only (owner: no Firefox for phones). An engine not in this container is fetched first, the build the installed
   Playwright names, from its download mirror */
const enginesFile = path.join(root, 'test/engines-run.txt');
const ENGINE_TESTS = { webkit: [['layout', 'node test/layout.cjs --quick', 60], ['flows', 'node test/flows.cjs', 40], ['taps', 'node test/taps.cjs', 15], ['play', 'node test/play.cjs', 150], ['menus', 'node test/menus.cjs', 20], ['editor', 'node test/editor.cjs', 40], ['online', 'node test/online.cjs', 200], ['firstpaint', 'node test/firstpaint.cjs', 15], ['smooth', 'node test/smooth.cjs', 45]], // (the editor 37 s in WebKit, 10 in Chrome)
  firefox: [['layout', 'node test/layout.cjs --quick --desktop', 50], ['flows', 'node test/flows.cjs', 40], ['taps', 'node test/taps.cjs', 15], ['play', 'node test/play.cjs --desktop', 150], ['menus', 'node test/menus.cjs', 35], ['editor', 'node test/editor.cjs', 25], ['online', 'node test/online.cjs', 200], ['firstpaint', 'node test/firstpaint.cjs', 15], ['smooth', 'node test/smooth.cjs', 45]] }; // (the editor 22 s in Firefox; menus 35 s: a browser of its own for each page)
function ensureEngine(name) {
  // (Playwright resolved through NODE_PATH, as the tests find it)
  const req = createRequire(import.meta.url), from = { paths: NODE_PATH.split(path.delimiter) }, pw = req(req.resolve('playwright', from));
  if (fs.existsSync(pw[name].executablePath())) return;
  const core = path.dirname(req.resolve('playwright-core/package.json', { paths: [path.dirname(req.resolve('playwright/package.json', from)), ...from.paths] }));
  const rev = JSON.parse(fs.readFileSync(path.join(core, 'browsers.json'), 'utf8')).browsers.find(b => b.name === name).revision;
  const dir = path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), '.cache/ms-playwright'), `${name}-${rev}`), zip = path.join(os.tmpdir(), `${name}-${rev}.zip`);
  console.log(`fetching ${name} ${rev} (not in this container)`);
  execSync(`curl -sf -o ${zip} https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/${name}/${rev}/${name}-ubuntu-24.04.zip && mkdir -p ${dir} && unzip -qo ${zip} -d ${dir} && touch ${dir}/INSTALLATION_COMPLETE ${dir}/DEPENDENCIES_VALIDATED && rm ${zip}`, { stdio: 'inherit' });
  if (!fs.existsSync(pw[name].executablePath())) throw new Error(`${name} was fetched but its browser is not at ${pw[name].executablePath()}`);
}
if (arg.includes('--engines')) {
  const rs = [];
  for (const e of Object.keys(ENGINE_TESTS)) { ensureEngine(e); for (const t of ENGINE_TESTS[e]) rs.push({ ...await run([e + ' ' + t[0], t[1], t[2]], { ENGINE: e }), engine: e, test: t[0] }); }
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true }); for (const r of rs) fs.writeFileSync(path.join(root, 'test-results', r.engine + '-' + r.test + '.log'), r.out);
  for (const r of rs) { const last = r.out.trim().split('\n').filter(l => l.trim()).pop() || ''; console.log(`${r.code ? 'FAIL' : 'ok  '} ${r.name.padEnd(15)} ${String(r.s).padStart(3)} s  ${last.slice(0, 130)}`); if (r.code) console.log(r.out.split('\n').filter(l => /^\s*FAIL\b|assertion failed/.test(l)).slice(0, 6).join('\n')); }
  const badE = rs.filter(r => r.code).length; if (!badE) fs.writeFileSync(enginesFile, head() + '\n');
  console.log(badE ? `\n${badE} failing on the other engines` : `\nall ok on WebKit and Firefox (recorded: ${head().slice(0, 7)})`); process.exit(badE ? 1 : 0);
}
/* side by side, but never more at once than the machine has cores, the longest first: all ten at once on four cores, each
   ran two to three times slower than alone (the editor test 9 s alone, past its 28 s limit in the suite), and every timed
   check inside a test (a fade's 450 ms, the terrain's 8 s, a frame's budget) judged what else happened to be running, not the
   page. One test per core keeps each near its own pace, so what a test measures is the page */
const pool = async (jobs, n) => { const out = [], order = jobs.map((j, k) => k).sort((a, b) => jobs[b][2] - jobs[a][2]); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < order.length) { const k = order[i++]; out[k] = await run(jobs[k]); } })); return out; };
const res = await pool([
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
], os.cpus().length);
// the timing measurements (frame costs, wheel latency) need a quiet machine: they run once everything else has finished
res.push(await run(['firstpaint', 'node test/firstpaint.cjs', 12])); // (timed: run alone) the start screen drawn within 100 ms of the HTML arriving
res.push(await run(['frames', 'node test/frames.cjs', 10]));
// every frame given to the page during drags, fast zooms and moves (the engine-neutral measure, run in WebKit and Firefox too)
res.push(await run(['smooth', 'node test/smooth.cjs', 12]));
// every frame of a game judged against 70 fps (the work on the page's main thread): the first 20 moves and every overlay; the
// whole game with --full
res.push(await run(['framebudget', 'node test/framebudget.cjs' + (full ? '' : ' --moves 20'), full ? 140 : 25]));
// text and cards sharp at rest, as the screen shows them (GPU route, sub-pixel text on, the owner's screen): every menu tab, a game, the windows
res.push(await run(['sharp', 'node test/sharp.cjs', 40]));
if (full) res.push(await run(['render', 'node test/render.cjs', 80]));
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
// and the other engines: 10 commits or more since they last passed (run.mjs --engines)
{ let since = Infinity; try { since = +execSync(`git rev-list --count ${fs.readFileSync(enginesFile, 'utf8').trim()}..HEAD`, { cwd: root }).toString().trim(); } catch (e) { /* expected: no record yet, or one git doesn't know: due */ }
  if (since >= 10) { res.push({ name: 'engines', code: 1, out: `FAIL the other engines are due (${since === Infinity ? 'never recorded' : since + ' commits since they last passed'}): node test/run.mjs --engines` }); console.log(`FAIL engines   WebKit and Firefox are due: node test/run.mjs --engines`); } }
const bad = res.filter(r => r.code).length;
console.log(bad ? `\n${bad} failing (${((Date.now() - t0) / 1000).toFixed(0)} s)` : `\nall ok (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(bad ? 1 : 0);
