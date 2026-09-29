// node shoot.cjs <label> <outdir> <states,...>   (run from the repo root, NODE_PATH=$(npm root -g))
// states: mid allcards buying market hand chips  -> files <state>-<1440|390>.png / <state>@2x.png
const path = require('path'), fs = require('fs');
const { chromium, serveStatic, settle } = require(path.join(process.cwd(), 'test/lib.cjs'));
const [label, out, statesArg] = process.argv.slice(2);
const want = new Set((statesArg || 'mid,allcards,buying,market,hand,chips').split(','));
fs.mkdirSync(out, { recursive: true });
const seedScript = () => { let a = 20260929; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; try { localStorage.clear(); } catch (e) { } };
(async () => {
  const CT = (await import(path.join(process.cwd(), 'src/engine.gen.js'))).CT;
  const srv = await serveStatic(), b = await chromium.launch();
  const errors = [];
  async function game(vw, vh, dpr) {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr || 1 }), p = await ctx.newPage();
    p.on('pageerror', e => errors.push(vw + ': ' + e.message));
    await p.addInitScript(seedScript);
    await p.goto(srv.url); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
    await p.click('#sGo'); await p.waitForFunction(() => window.__ED.S && !document.querySelector('#menu').open);
    const idle = async () => { await p.waitForFunction(() => !window.__ED.UI.anim, null, { timeout: 10000 }).catch(() => { }); await settle(p); };
    await idle();
    // six scripted turns (two rounds): move with every non-coin card as far as it reaches, buy the dearest affordable market card, end
    for (let turn = 0; turn < 6; turn++) {
      for (let k = 0; k < 6; k++) {
        const moved = await p.evaluate(CT => { const E = window.__ED, S = E.S, P = S.players[S.cur];
          for (const id of P.hand) { const d = CT[S.cards[id]]; if (!d || d.c === 'y' || d.c === 'p') continue;
            E.onHandCard(id); let best = null; for (const [k, v] of E.UI.targets) { if (v.kind && /camp|disc|bl/.test(v.kind)) continue; if (v.need) continue; if (!best || (v.cost || 0) > (best[1].cost || 0)) best = [k, v]; }
            if (best) { E.doMove(best[0]); return true; } E.cancelMode(); }
          return false; }, CT);
        await idle(); if (!moved) break;
        // a card with budget left stays active: finish it
        await p.evaluate(() => { const E = window.__ED; if (E.UI.mode !== 'idle') E.cancelMode(); });
      }
      await p.evaluate(CT => { const E = window.__ED, S = E.S, P = S.players[S.cur]; if (S.turn.bought) return;
        const cash = P.hand.reduce((a, id) => a + (CT[S.cards[id]].c === 'y' ? CT[S.cards[id]].p : .5), 0);
        let best = -1; S.market.forEach((s, i) => { if (s.n > 1 && CT[s.t].cost <= Math.floor(cash) && (best < 0 || CT[s.t].cost > CT[S.market[best].t].cost)) best = i; });
        if (best >= 0) E.act({ t: 'buy', type: S.market[best].t, cards: [...P.hand] }); }, CT);
      await idle();
      await p.evaluate(() => { const E = window.__ED; if (E.UI.mode !== 'idle') E.cancelMode(); E.act({ t: 'end', keep: [] }); });
      await idle();
    }
    await p.evaluate(() => { const E = window.__ED; E.cancelMode && E.UI.mode !== 'idle' && E.cancelMode(); document.querySelectorAll('#hist,.hist').forEach(() => { }); E.render(); });
    await p.mouse.move(vw / 2, 5); await idle();
    return { p, ctx, idle };
  }
  const shot = async (p, name, opt) => { await settle(p); await p.waitForTimeout(250); await p.screenshot({ path: path.join(out, name), ...opt }); console.log('shot', name); };
  const clipOf = async (p, sel, pad = 14) => { const r = await p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; }, sel);
    if (!r) return null; const x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad); return { x, y, width: r.width + 2 * pad, height: r.height + 2 * pad }; };
  const openAll = async p => { await p.evaluate(() => { const t = document.querySelector('#allTile'); if (t && t.offsetParent) t.click(); else document.querySelector('#mktBtn').click(); }); };
  const buy = async p => p.evaluate(CT => { const E = window.__ED, S = E.S, P = S.players[S.cur];
    const cash = P.hand.reduce((a, id) => a + (CT[S.cards[id]].c === 'y' ? CT[S.cards[id]].p : .5), 0);
    let best = -1; S.market.forEach((s, i) => { if (s.n > 0 && CT[s.t].cost <= cash && CT[s.t].cost >= 2 && (best < 0 || CT[s.t].cost > CT[S.market[best].t].cost)) best = i; });
    if (best < 0) S.market.forEach((s, i) => { if (s.n > 0 && CT[s.t].cost <= cash && best < 0) best = i; });
    E.pickFromMarket('m', best < 0 ? 0 : best);
    const coin = P.hand.find(id => CT[S.cards[id]].c === 'y'); if (coin && E.UI.mode === 'pay') E.onHandCard(coin); }, CT);
  for (const [vw, vh] of [[1440, 900], [390, 844]]) {
    const { p, ctx, idle } = await game(vw, vh, 1);
    if (want.has('mid')) await shot(p, `mid-${vw}.png`);
    if (want.has('buying')) { await buy(p); await idle(); await shot(p, `buying-${vw}.png`); await p.evaluate(() => window.__ED.cancelMode()); await idle(); }
    if (want.has('allcards')) { await openAll(p); await idle(); await shot(p, `allcards-${vw}.png`); await p.keyboard.press('Escape'); await p.evaluate(() => { const c = document.querySelector('#allClose'); if (c && c.offsetParent) c.click(); }); await idle(); }
    await ctx.close();
  }
  if (want.has('market') || want.has('hand') || want.has('chips')) for (const [vw, vh] of [[1440, 900], [390, 844]]) {
    const { p, ctx, idle } = await game(vw, vh, 2);
    const sfx = vw === 1440 ? '' : '-390';
    if (want.has('market')) { const c = await clipOf(p, process.env.MKTSEL || '#mkt'); if (c) await shot(p, `market${sfx}@2x.png`, { clip: c }); }
    if (want.has('hand') && vw === 1440) { const c = await clipOf(p, '#cards', 30); if (c) await shot(p, `hand@2x.png`, { clip: c }); }
    if (want.has('chips') && vw === 1440) { const c = await clipOf(p, '#players', 8); if (c) await shot(p, `chips@2x.png`, { clip: c }); }
    await ctx.close();
  }
  console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
  await b.close(); srv.close();
})();
