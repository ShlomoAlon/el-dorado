// Frame budget: one whole game at the owner's screen, played through the real UI at full animation speed, with the machine
// to itself (test/run.mjs runs it alone, after everything else), and every frame of it judged: the work on the page's main
// thread (script, style, layout, paint) of each task must stay within 14.3 ms, a frame at 70 fps (owner, 2026-10-03:
// calibrated for an uncontended, reasonable machine). Along the way it opens the menu, Rules, a player's cards and the
// All cards spread, so their entrances are judged too. Read from a trace (frames come at a fixed 60 per second here, so the
// time between them can't show 70 fps): every task over budget is listed with what the game was doing then.
//   NODE_PATH=$(npm root -g) node test/framebudget.cjs [--moves n]   (n: the person's first n moves, every overlay included;
//   without it, the whole game: test/run.mjs --full)
const { chromium, serveStatic, openPage, settle, report } = require('./lib.cjs');
const { step } = require('./playstep.cjs');
const fs = require('fs'), path = require('path'), os = require('os');
const T = report('framebudget'), BUDGET = 1000 / 70; // ms
const arg = process.argv.slice(2), MOVES = arg.includes('--moves') ? +arg[arg.indexOf('--moves') + 1] : Infinity;
(async () => {
  const srv = await serveStatic(), b = await chromium.launch(), t0 = Date.now();
  const p = await openPage(b, 'framebudget', { viewport: { width: 1536, height: 639 }, deviceScaleFactor: 1.25 });
  await p.goto(srv.url); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
  await p.click('#sGo'); await p.waitForFunction(() => window.__ED.S && !window.__ED.UI.preview && !document.querySelector('#menu').open);
  await p.evaluate(() => window.__ED.aiPace(.3)); // (the AIs' pauses shorter; their moves and every animation at full speed)
  await settle(p);
  const trace = path.join(os.tmpdir(), 'framebudget-' + process.pid + '.json');
  await b.startTracing(p, { path: trace, categories: ['toplevel', 'blink.user_timing', 'devtools.timeline'] });
  const mark = label => p.evaluate(l => performance.mark(l), label);
  // an overlay opened and closed as a player would, its entrance and exit judged with everything else
  const overlays = [['menu', '#menuBtn', '#sBack'], ['rules', '#rulesBtn', '#rClose'], ['a player\'s cards', '#players .pchip:nth-child(2)', '#pClose']];
  let steps = 0, opened = 0;
  try {
    for (; steps < Math.min(1500, MOVES); steps++) {
      await p.waitForFunction(() => { const E = window.__ED; return E.S.over || (E.canAct() && !E.walking() && E.UI.mode !== 'pay' && E.UI.mode !== 'discardFor'); }, null, { timeout: 60000 });
      await settle(p);
      if (await p.evaluate(() => window.__ED.S.over)) break;
      // (every overlay early, so even a short run judges each one; then one now and then)
      if ((steps < 3 * overlays.length && steps % 3 === 1) || steps % 12 === 6) { const [name, open, close] = overlays[opened++ % overlays.length];
        await mark('open ' + name); await p.click(open); await settle(p); await p.waitForTimeout(300); await mark('close ' + name); await p.click(close); await settle(p); }
      const r = await p.evaluate(step); await mark(r.split(':')[0]);
      if (r.startsWith('unmapped')) break;
    }
  } catch (e) { T.ok('the game ran to the end', false, e.message.split('\n')[0]); }
  await p.waitForTimeout(800); await mark('results');
  await b.stopTracing();
  T.ok(MOVES < Infinity ? `the first ${MOVES} moves played through the UI` : 'a whole game played through the UI', MOVES < Infinity ? steps >= MOVES || await p.evaluate(() => window.__ED.S.over) : await p.evaluate(() => window.__ED.S.over), steps + ' moves');
  // the page's main thread: its top-level tasks, each labelled with the last thing the test did before it
  const ev = JSON.parse(fs.readFileSync(trace, 'utf8')); fs.unlinkSync(trace);
  const list = Array.isArray(ev) ? ev : ev.traceEvents;
  const main = list.find(e => e.ph === 'M' && e.name === 'thread_name' && e.args.name === 'CrRendererMain'), pid = main.pid, tid = main.tid;
  const marks = list.filter(e => e.pid === pid && e.cat === 'blink.user_timing' && (e.ph === 'R' || e.ph === 'I' || e.ph === 'n' || e.ph === 'b')).map(e => [e.ts, e.name]).sort((a, c) => a[0] - c[0]);
  const labelAt = ts => { let l = 'start'; for (const [t, n] of marks) { if (t > ts) break; l = n; } return l; };
  const tasks = list.filter(e => e.pid === pid && e.tid === tid && e.ph === 'X' && /RunTask$/.test(e.name) && e.dur);
  const over = tasks.filter(e => e.dur / 1000 > BUDGET).map(e => ({ ms: e.dur / 1000, at: labelAt(e.ts) }));
  const by = {}; for (const o of over) { const k = o.at.replace(/ \(.*\)$/, ''); (by[k] = by[k] || []).push(o.ms); }
  const rows = Object.entries(by).sort((a, c) => Math.max(...c[1]) - Math.max(...a[1])).map(([k, v]) => `${k}: ${v.length} over, worst ${Math.max(...v).toFixed(1)} ms`);
  const worst = tasks.reduce((m, e) => Math.max(m, e.dur / 1000), 0);
  T.ok(`every task on the page's main thread within ${BUDGET.toFixed(1)} ms (70 fps)`, !over.length, `${over.length} of ${tasks.length} tasks over, worst ${worst.toFixed(1)} ms${rows.length ? '\n   ' + rows.join('\n   ') : ''}`);
  console.log(`     ${steps} moves in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  await b.close(); srv.close(); T.done();
})();
