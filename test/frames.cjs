// Frame-cost checks on a phone (390×844, touch, CPU slowed 4×): what one interaction costs the browser, from a trace.
//   - select a card, move an explorer, cancel: no restyle of the whole board (at most a few hundred elements), no long task
//   - the explorer's move (slide and hop) and the cards' moves run on the compositor (no animation fell back to the main thread)
//   NODE_PATH=$(npm root -g) node test/frames.cjs [--verbose]
const { chromium, settle, openPage } = require('./lib.cjs');
const path = require('path');
const V = process.argv.includes('--verbose');
let fails = 0; const ok = (name, pass, detail) => { if (!pass) fails++; console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`); };
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.animations', 'cc', 'benchmark'];
function summary(T) {
  const tasks = T.filter(e => e.name === 'RunTask' && e.dur).map(e => e.dur / 1000), style = T.filter(e => e.name === 'UpdateLayoutTree' && e.dur);
  const anims = T.filter(e => e.name === 'Animation' && e.ph === 'n' && e.args && e.args.data && 'compositeFailed' in e.args.data);
  return { longest: Math.max(0, ...tasks), styled: Math.max(0, ...style.map(e => (e.args && e.args.elementCount) || 0)), styleMs: style.reduce((a, e) => a + e.dur / 1000, 0),
    anims: anims.length, notComposited: anims.filter(e => e.args.data.compositeFailed).length };
}
(async () => {
  const b = await chromium.launch(), p = await openPage(b, 'frames', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }), errs = p.errors; // (assertion failures count: openPage)
  await p.goto('file://' + path.join(__dirname, '..', 'public/index.html'));
  await p.waitForFunction(() => window.__ED && window.__ED.S); await p.click('#sGo');
  await p.waitForFunction(() => !window.__ED.UI.preview && !window.__ED.walking() && document.querySelectorAll('#cards .card').length === 4); await settle(p);
  const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const traced = async (label, f, ms = 900) => { await p.waitForTimeout(300); await b.startTracing(p, { categories: CATS }); await p.evaluate(f); await p.waitForTimeout(ms);
    const s = summary(JSON.parse((await b.stopTracing()).toString()).traceEvents); if (V) console.log('     ', label, JSON.stringify(s)); return s; };
  // a card that can move an explorer, and a space it reaches
  // (a deal can start a player with no card that moves an explorer: then the next player tries, as many turns as needed)
  const pick = await p.evaluate(() => { const E = window.__ED;
    for (let turn = 0; turn < 8; turn++) { const S = E.S, P = S.players[S.cur];
      for (const id of P.hand) { E.onHandCard(id); E.render(); const k = [...E.targets()].find(([k, t]) => k[0] !== 'B' && t.kind === 'move'); E.cancelMode(); E.render(); if (k) return { id, k: k[0] }; }
      E.act({ t: 'end', keep: [] }); E.render(); }
    return null; });
  await p.waitForFunction(() => !window.__ED.walking());
  if (!pick) { console.log('FAIL no move found: ' + await p.evaluate(() => JSON.stringify({ mode: window.__ED.UI.mode, cover: window.__ED.UI.cover, act: window.__ED.canAct(), hand: window.__ED.S.players[window.__ED.S.cur].hand.map(id => window.__ED.S.cards[id]) }))); process.exit(1); }
  const sel = await traced('select', `window.__ED.onHandCard(${JSON.stringify(pick.id)})`);
  ok('select a card: no big restyle', sel.styled < 400, `${sel.styled} elements restyled, longest task ${sel.longest.toFixed(0)} ms`);
  ok('select a card: no long task', sel.longest < 120, `${sel.longest.toFixed(0)} ms (CPU ÷4)`);
  const mv = await traced('move', `window.__ED.doMove(${JSON.stringify(pick.k)})`, 1400);
  ok('move: no big restyle', mv.styled < 400, `${mv.styled} elements restyled, longest task ${mv.longest.toFixed(0)} ms`);
  ok('move: animations on the compositor', mv.anims >= 3 && mv.notComposited === 0, `${mv.anims} animations, ${mv.notComposited} on the main thread`);
  const cn = await traced('cancel', `window.__ED.cancelMode()`);
  // a phone may take a few hundred ms to draw the frame after a move: the walk must start after that frame, from its start
  await p.waitForFunction(() => !window.__ED.walking());
  const walk = await p.evaluate(async () => { const E = window.__ED;
    for (let turn = 0; turn < 8; turn++) { const S = E.S, P = S.players[S.cur];
      for (const id of P.hand) { E.onHandCard(id); const k = [...E.targets()].find(([k, t]) => k[0] !== 'B' && t.kind === 'move'); if (k) {
        E.doMove(k[0]); const el = [...document.querySelectorAll('#pieces .piece')].find(e => e.style.zIndex === '3'); if (!el) return { err: 'no moving explorer' };
        const at0 = el.style.transform;
        await new Promise(r => requestAnimationFrame(() => { const t = performance.now(); while (performance.now() - t < 300); r(); })); // the slow frame
        const during = el.getAnimations().length, still = el.style.transform === at0;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const a = el.getAnimations()[0], hop = el.querySelector('.pin').getAnimations()[0];
        return { during, still, t: a ? Math.round(a.currentTime) : null, hops: hop ? hop.effect.getTiming().iterations : 0 }; }
        E.cancelMode(); }
      E.act({ t: 'end', keep: [] }); }
    return { err: 'no move found' }; });
  ok('move after a slow frame: the walk plays from its start', !walk.err && walk.during === 0 && walk.still && walk.t !== null && walk.t < 120 && walk.hops >= 1, JSON.stringify(walk));
  ok('cancel: no big restyle', cn.styled < 400, `${cn.styled} elements restyled`);
  ok('no page errors (assertions included)', !errs.length, errs.join(' | '));
  await b.close(); console.log(fails ? `frames: ${fails} failing` : 'frames ok'); process.exit(fails ? 1 : 0);
})();
