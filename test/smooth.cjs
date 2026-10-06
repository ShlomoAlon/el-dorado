// Smoothness in every engine (owner, 2026-10-06: port what can be ported; the frame budget reads Chrome's own trace, this
// reads the frames themselves): the board dragged, zoomed in fast bursts (the owner's iPhone: a hitch on a fast zoom) and a
// few moves played, while the page records the time of every frame it is given. A frame that comes more than twice the
// usual interval after the last one was dropped. Run in Chrome (with the suite) and in WebKit and Firefox (run.mjs --engines).
//   NODE_PATH=$(npm root -g) node test/smooth.cjs        (ENGINE=webkit|firefox for the other engines)
const { browser, ENGINE, serveStatic, openPage, settle, report, menuGo } = require('./lib.cjs');
const { step } = require('./playstep.cjs');
const T = report('smooth (' + ENGINE + ')');
// what each part may drop, at most: the share of frames dropped and the longest gap (ms). A gap of 100 ms is a visible hitch
const LIMIT = { drop: 0.05, gap: 100 };
(async () => {
  const srv = await serveStatic(), b = await browser.launch();
  const p = await openPage(b, 'smooth', { viewport: { width: 1536, height: 639 }, deviceScaleFactor: 1.25 });
  await p.goto(srv.url); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
  await menuGo(p, 'local'); await p.click('#sGo'); await p.waitForFunction(() => window.__ED.S && !window.__ED.UI.preview && !document.querySelector('#menu').open);
  await p.evaluate(() => window.__ED.aiPace(.3)); await settle(p);
  // the page's own record of its frames: started and read per part
  const rec = () => p.evaluate(() => { const f = window.__frames = []; const tick = t => { if (window.__frames !== f) return; f.push(t); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  const judge = async name => { const f = await p.evaluate(() => { const f = window.__frames; window.__frames = null; return f; });
    const d = f.slice(1).map((t, i) => t - f[i]), sorted = [...d].sort((a, c) => a - c), usual = sorted[sorted.length >> 1] || 16.7;
    const dropped = d.filter(x => x > 2 * usual).length, gap = Math.max(0, ...d);
    T.ok(`${name}: no hitch (at most ${LIMIT.drop * 100}% of frames dropped, no gap over ${LIMIT.gap} ms)`, d.length > 10 && dropped / d.length <= LIMIT.drop && gap <= LIMIT.gap,
      `${d.length} frames every ${usual.toFixed(1)} ms, ${dropped} dropped (${(100 * dropped / Math.max(1, d.length)).toFixed(1)}%), longest gap ${gap.toFixed(0)} ms`); };
  const vp = await p.evaluate(() => { const r = document.querySelector('#vp').getBoundingClientRect(); return { x: r.left + r.width * .45, y: r.top + r.height * .5 }; });
  // 1. the board dragged around
  await rec(); await p.mouse.move(vp.x, vp.y); await p.mouse.down();
  for (let i = 0; i < 60; i++) { await p.mouse.move(vp.x + Math.sin(i / 8) * 200, vp.y + Math.cos(i / 10) * 100); await p.waitForTimeout(16); }
  await p.mouse.up(); await p.waitForTimeout(400); await judge('dragging the board');
  // 2. fast zoom bursts: in and out quickly, several times, then the zoom settles and is baked in
  await rec(); await p.mouse.move(vp.x, vp.y);
  for (let k = 0; k < 4; k++) { for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, k % 2 ? 120 : -120); await p.waitForTimeout(12); } await p.waitForTimeout(150); }
  await p.waitForTimeout(800); await judge('fast zoom bursts');
  // 3. a few moves of the game, the AIs' turns between them (cards fly, explorers walk, the turn changes)
  await settle(p); await rec();
  for (let s = 0; s < 8; s++) { await p.waitForFunction(() => { const E = window.__ED; return E.S.over || (E.canAct() && !E.walking() && E.UI.mode !== 'pay' && E.UI.mode !== 'discardFor'); }, null, { timeout: 60000 });
    if (await p.evaluate(() => window.__ED.S.over)) break; await p.evaluate(step); }
  await settle(p); await judge('moves and turns');
  T.ok('no page errors (assertions included)', !p.errors.length, p.errors.join(' | '));
  await b.close(); srv.close(); T.done();
})();
