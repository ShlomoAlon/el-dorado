// Frame budget: one whole game at the owner's screen, played through the real UI at full animation speed, with the machine
// to itself (test/run.mjs runs it alone, after everything else), and every frame of it judged: the work on the page's main
// thread (script, style, layout, paint) of each task must stay within 14.3 ms, a frame at 70 fps (owner, 2026-10-03:
// calibrated for an uncontended, reasonable machine). Along the way it opens the menu, Rules and a player's cards, so their
// entrances are judged too, and at the end it drags, wheel-zooms and pinches the board (trackpad and touch). Read from a trace (frames come at a fixed 60 per second here, so the
// time between them can't show 70 fps): every task over budget is listed with what the game was doing then.
//   NODE_PATH=$(npm root -g) node test/framebudget.cjs [--moves n]   (n: the person's first n moves, every overlay included;
//   without it, the whole game: test/run.mjs --full)
const { chromium, serveStatic, openPage, settle, report } = require('./lib.cjs');
const { step } = require('./playstep.cjs');
const fs = require('fs'), path = require('path'), os = require('os');
const T = report('framebudget'), BUDGET = 1000 / 70; // ms
const arg = process.argv.slice(2), MOVES = arg.includes('--moves') ? +arg[arg.indexOf('--moves') + 1] : Infinity;
const DETAIL = arg.includes('--detail'); // (each task over budget broken down: script (its slowest function), style, layout, paint)
(async () => {
  const srv = await serveStatic(), b = await chromium.launch(), t0 = Date.now();
  const p = await openPage(b, 'framebudget', { viewport: { width: 1536, height: 639 }, deviceScaleFactor: 1.25 });
  await p.goto(srv.url); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
  await p.click('#sGo'); await p.waitForFunction(() => window.__ED.S && !window.__ED.UI.preview && !document.querySelector('#menu').open);
  await p.evaluate(() => window.__ED.aiPace(.3)); // (the AIs' pauses shorter; their moves and every animation at full speed)
  await settle(p);
  // a phone, touch from the start (as a real one), for the two-finger pinch: its own page, set up before the trace starts
  const ph = await openPage(b, 'framebudget (phone)', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ph.goto(srv.url); await ph.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
  await ph.click('#sGo'); await ph.waitForFunction(() => window.__ED.S && !window.__ED.UI.preview && !document.querySelector('#menu').open); await settle(ph);
  const trace = path.join(os.tmpdir(), 'framebudget-' + process.pid + '.json');
  await b.startTracing(p, { path: trace, categories: ['toplevel', 'blink.user_timing', 'devtools.timeline', ...(DETAIL ? ['disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack'] : [])] });
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
  // the board's gestures, which must stay smooth above all (owner, 2026-10-03): a drag, wheel zoom, a trackpad pinch
  // (ctrl+wheel, as Chrome sends it) and a two-finger touch pinch, each over the board, each marked; the zoom then settles
  // and is baked in (one sharp redraw), which is judged too
  await settle(p);
  const vp = await p.evaluate(() => { const r = document.querySelector('#vp').getBoundingClientRect(); return { x: r.left + r.width * .45, y: r.top + r.height * .5 }; });
  await mark('drag the board'); await p.mouse.move(vp.x, vp.y); await p.mouse.down();
  for (let i = 0; i < 60; i++) { await p.mouse.move(vp.x + Math.sin(i / 8) * 200, vp.y + Math.cos(i / 10) * 100); await p.waitForTimeout(16); }
  await p.mouse.up(); await p.waitForTimeout(400);
  await mark('wheel zoom'); await p.mouse.move(vp.x, vp.y); for (let i = 0; i < 24; i++) { await p.mouse.wheel(0, i < 12 ? -60 : 60); await p.waitForTimeout(30); } await p.waitForTimeout(700);
  await mark('trackpad pinch'); await p.keyboard.down('Control'); for (let i = 0; i < 30; i++) { await p.mouse.wheel(0, i < 15 ? -8 : 8); await p.waitForTimeout(16); } await p.keyboard.up('Control'); await p.waitForTimeout(700);
  await ph.evaluate(() => performance.mark('touch pinch')); { const c = await ph.context().newCDPSession(ph);
    const v = await ph.evaluate(() => { const r = document.querySelector('#vp').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * .4 }; });
    const pts = d => [{ x: v.x - d, y: v.y, id: 1 }, { x: v.x + d, y: v.y, id: 2 }];
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(40) });
    for (let i = 1; i <= 30; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(40 + (i <= 15 ? i : 30 - i) * 6) }); await ph.waitForTimeout(16); }
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await ph.waitForTimeout(800); await ph.evaluate(() => performance.mark('touch pinch done')); }
  await p.waitForTimeout(800);
  await p.waitForTimeout(800); await mark('results');
  if (DETAIL) console.log('     slow updates (the page\'s log): ' + (await p.evaluate(() => window.__ED.diagLog().filter(l => /update \d+ ms/.test(l)).slice(-12).join(' | ')) || 'none'));
  await b.stopTracing();
  T.ok(MOVES < Infinity ? `the first ${MOVES} moves played through the UI` : 'a whole game played through the UI', MOVES < Infinity ? steps >= MOVES || await p.evaluate(() => window.__ED.S.over) : await p.evaluate(() => window.__ED.S.over), steps + ' moves');
  // the page's main thread: its top-level tasks, each labelled with the last thing the test did before it
  const ev = JSON.parse(fs.readFileSync(trace, 'utf8')); fs.unlinkSync(trace);
  const list = Array.isArray(ev) ? ev : ev.traceEvents;
  // (each page's main thread on its own: the game's and the phone's, each with its own marks)
  const over = [], tasks = [];
  for (const main of list.filter(e => e.ph === 'M' && e.name === 'thread_name' && e.args.name === 'CrRendererMain')) {
    const pid = main.pid, tid = main.tid;
    if (!list.some(e => e.pid === pid && e.cat === 'blink.user_timing')) continue; // (a page with no marks: not ours)
    const marks = list.filter(e => e.pid === pid && e.cat === 'blink.user_timing' && (e.ph === 'R' || e.ph === 'I' || e.ph === 'n' || e.ph === 'b')).map(e => [e.ts, e.name]).sort((a, c) => a[0] - c[0]);
    const labelAt = ts => { let l = 'start'; for (const [t, n] of marks) { if (t > ts) break; l = n; } return l; };
    // (top-level tasks only: Chrome logs a task again inside itself, ThreadControllerImpl::RunTask in RunTask, which counted it twice)
    const all = list.filter(e => e.pid === pid && e.tid === tid && e.ph === 'X' && /RunTask$/.test(e.name) && e.dur).sort((a, c) => a.ts - c.ts || c.dur - a.dur);
    const mine = []; let end = -1; for (const e of all) if (e.ts >= end) { mine.push(e); end = e.ts + e.dur; } tasks.push(...mine);
    const pageOver = mine.filter(e => e.dur / 1000 > BUDGET).map(e => ({ ms: e.dur / 1000, at: labelAt(e.ts), e })); over.push(...pageOver);
    if (DETAIL) { const inner = list.filter(e => e.pid === pid && e.tid === tid && e.ph === 'X' && e.dur);
      const KIND = { FunctionCall: 'script', EvaluateScript: 'script', TimerFire: 'script', FireAnimationFrame: 'script', EventDispatch: 'script', UpdateLayoutTree: 'style', Layout: 'layout', Paint: 'paint', PrePaint: 'paint', Layerize: 'paint', 'Commit': 'paint' };
      for (const o of pageOver) { const t = o.e, sum = {}; let fn = null;
        for (const e of inner) { if (e === t || e.ts < t.ts || e.ts + e.dur > t.ts + t.dur) continue; const k = KIND[e.name]; if (!k) continue;
          if (k === 'script' && e.name === 'FunctionCall') { const d = e.args && e.args.data || {}; if (!fn || e.dur > fn.dur) fn = { dur: e.dur, name: (d.functionName || '?') + ' ' + (d.url || '').split('/').pop() + ':' + d.lineNumber }; }
          if (k !== 'script' || !['FunctionCall', 'EventDispatch'].includes(e.name) || !sum.script) sum[k] = (sum[k] || 0) + e.dur / 1000; }
        const lays = inner.filter(e => e.name === 'Layout' && e.ts >= t.ts && e.ts + e.dur <= t.ts + t.dur).map(e => { const bd = e.args && e.args.beginData || {}; const st = (bd.stackTrace || [])[0]; return `${(e.dur / 1000).toFixed(1)} ms, ${bd.dirtyObjects}/${bd.totalObjects} objects${bd.partialLayout ? ' (partial)' : ''}${st ? ' forced by ' + st.functionName + ' ' + (st.url || '').split('/').pop() + ':' + st.lineNumber + ':' + st.columnNumber : ''}`; });
        if (lays.length) console.log('       layouts: ' + lays.join('; '));
        console.log(`     ${o.ms.toFixed(1)} ms at "${o.at}": ` + Object.entries(sum).map(([k, v]) => k + ' ' + v.toFixed(1)).join(', ') + (fn ? ` (slowest function ${fn.name}, ${(fn.dur / 1000).toFixed(1)} ms)` : '')); } }

  }
  const by = {}; for (const o of over) { const k = o.at.replace(/ \(.*\)$/, ''); (by[k] = by[k] || []).push(o.ms); }
  const rows = Object.entries(by).sort((a, c) => Math.max(...c[1]) - Math.max(...a[1])).map(([k, v]) => `${k}: ${v.length} over, worst ${Math.max(...v).toFixed(1)} ms`);
  const worst = tasks.reduce((m, e) => Math.max(m, e.dur / 1000), 0);
  T.ok(`every task on the page's main thread within ${BUDGET.toFixed(1)} ms (70 fps)`, !over.length, `${over.length} of ${tasks.length} tasks over, worst ${worst.toFixed(1)} ms${rows.length ? '\n   ' + rows.join('\n   ') : ''}`);
  console.log(`     ${steps} moves in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  await b.close(); srv.close(); T.done();
})();
