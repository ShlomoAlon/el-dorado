// Design shots for D1 (start screen) and D9 (top bar). usage: node shoot.cjs <label: before|A|B> <D1|D9|all> <outdir>
// Options may mark elements with data-shot="open-setup" (the full setup) and data-shot="menu" (the in-game menu button).
const REPO = process.env.REPO || '/home/user/el-dorado';
const { chromium, serveStatic, settle } = require(REPO + '/test/lib.cjs');
const fs = require('fs'), path = require('path');
const [label, which, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const SEED = () => { let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
(async () => {
  const b = await chromium.launch(), srv = await serveStatic(), errs = [];
  const page = async (w, h, dpr = 1, init) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
    await ctx.addInitScript(SEED); if (init) await ctx.addInitScript(init);
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(`${w}: ${e.message}`));
    await p.goto(srv.url); await p.waitForFunction(() => window.__ED && document.fonts.status === 'loaded'); await settle(p); await p.waitForTimeout(300);
    return p;
  };
  const shot = async (p, name, opts = {}) => { await settle(p); await p.waitForTimeout(250); const f = path.join(out, name + '.png'); await p.screenshot({ path: f, ...opts }); console.log('shot', f); };
  const W = w => w === 390 ? [390, 844] : [1440, 900];
  // a 4-player game (you + 3 AIs), played into round 2
  const game4 = async p => {
    await p.evaluate(() => { const f = document.querySelector('#mform');
      f.querySelector('input[name=np][value="4"]').click();
      const who = ['', 'fawcett', 'humboldt', 'raleigh']; who.forEach((v, i) => { const s = f.querySelector(`select[name=who${i}]`); if (s) { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); } });
      const go = f.querySelector('#sGo') || f.querySelector('[data-shot=go]'); go.click(); });
    await p.waitForFunction(() => !__ED.UI.preview && __ED.canAct(), null, { timeout: 30000 });
    await settle(p);
    await p.evaluate(() => { const E = __ED, h = E.S.players[E.S.cur].hand; for (const id of h) { E.onHandCard(id); if (E.UI.targets.size) { E.doMove([...E.UI.targets.keys()][0]); break; } E.cancelMode(); } });
    await settle(p);
    await p.evaluate(() => { __ED.startEndTurn(); if (__ED.UI.mode !== 'idle') __ED.finishTurn(); });
    await p.waitForFunction(() => __ED.S.round >= 2 && __ED.canAct() && !__ED.UI.anim, null, { timeout: 90000 });
    await settle(p); await p.waitForTimeout(2500); await settle(p);
  };
  const menuBtn = p => p.evaluate(() => (document.querySelector('[data-shot=menu]') || document.querySelector('#menuBtn')).click());
  try {
    if (which === 'D1' || which === 'all') for (const w of [1440, 390]) {
      let p = await page(...W(w));
      await shot(p, `D1-${label}-start-${w}`);
      if (w === 390) { await p.evaluate(() => { const f = document.querySelector('#mform'); f.scrollTop = f.scrollHeight; }); await shot(p, `D1-${label}-start-end-390`); await p.evaluate(() => document.querySelector('#mform').scrollTop = 0); }
      await p.evaluate(() => { const o = document.querySelector('[data-shot=open-setup]'); if (o) o.click(); });
      await p.evaluate(() => document.querySelector('#mform input[name=np][value="4"]').click());
      await shot(p, `D1-${label}-setup-${w}`);
      if (w === 390) { await p.evaluate(() => { const f = document.querySelector('#mform'); f.scrollTop = f.scrollHeight; }); await shot(p, `D1-${label}-setup-end-390`); await p.evaluate(() => document.querySelector('#mform').scrollTop = 0); }
      await p.context().close();
      // a saved game waiting: a game in progress saved on this device, then the page opened again
      p = await page(...W(w)); await game4(p);
      await p.reload(); await p.waitForFunction(() => window.__ED); await settle(p); await p.waitForTimeout(1200);
      await shot(p, `D1-${label}-saved-${w}`);
      await p.evaluate(() => { const d = document.querySelector('#menu'); if (d.open) { const c = document.querySelector('[data-shot=continue]') || document.querySelector('#sResume:not([hidden])'); if (c) c.click(); } });
      await p.waitForTimeout(600); await settle(p);
      await menuBtn(p); await p.waitForTimeout(500);
      await shot(p, `D1-${label}-menu-ingame-${w}`);
      await p.context().close();
    }
    if (which === 'D9' || which === 'all') {
      for (const w of [1440, 390]) {
        const p = await page(...W(w)); await game4(p);
        await shot(p, `D9-${label}-game4-${w}`);
        if (w === 1440) await shot(p, `D9-${label}-toprow-${w}`, { clip: { x: 0, y: 0, width: 1440, height: 130 } });
        else await shot(p, `D9-${label}-toprow-${w}`, { clip: { x: 0, y: 0, width: 390, height: 200 } });
        await menuBtn(p); await p.waitForTimeout(500);
        await shot(p, `D9-${label}-menu-ingame-${w}`);
        await p.context().close();
      }
      const p = await page(1440, 900, 2); await game4(p);
      const r = await p.evaluate(() => { const r = document.querySelector('#hud').getBoundingClientRect(); return { x: 0, y: 0, width: r.width, height: Math.ceil(r.bottom + 4) }; });
      await shot(p, `D9-${label}-hud-1440@2x`, { clip: r });
      await p.context().close();
    }
  } finally { await b.close(); srv.close(); if (errs.length) console.log('PAGE ERRORS:\n' + errs.join('\n')); }
})();
