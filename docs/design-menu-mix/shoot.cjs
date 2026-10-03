// Menu mix shots: node mixshoot.cjs <outdir>
const { chromium, serveStatic, openPage, settle } = require('/home/user/el-dorado/test/lib.cjs');
const fs = require('fs'), path = require('path'); const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const SEED = () => { let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const SIZES = [['desk', { width: 1536, height: 639 }, 1.25], ['phone', { width: 390, height: 844 }, 2]];
(async () => {
  const srv = await serveStatic(), b = await chromium.launch(), errs = [];
  const open = async (mix, vp, dpr) => { const p = await openPage(b, 'mix ' + mix, { viewport: vp, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
    await p.addInitScript(SEED); await p.goto(srv.url + '?mix=' + mix); await p.waitForFunction(() => window.__ED && document.fonts.status === 'loaded'); await settle(p); await p.waitForTimeout(300); return p; };
  const shot = async (p, name) => { await settle(p); await p.waitForTimeout(250); await p.screenshot({ path: path.join(out, name + '.png') }); console.log('shot', name); };
  const click = (p, sel) => p.evaluate(s => document.querySelector(s).click(), sel);
  const inGame = p => p.waitForFunction(() => window.__ED.S && !window.__ED.UI.preview && !document.querySelector('#menu').open, null, { timeout: 30000 });
  for (const [dev, vp, dpr] of SIZES) {
    // 1. the title screen, first visit
    for (const v of ['1a', '1b', '1c']) { const p = await open(v + '2a3a4a5a', vp, dpr); await shot(p, `1-${v}-title-${dev}`); errs.push(...p.errors); await p.close(); }
    // after Play: the game (the same for every title variant)
    { const p = await open('1a2a3a4a5a', vp, dpr); await click(p, '#tPlay'); await inGame(p); await p.waitForTimeout(800); await shot(p, `1-after-play-${dev}`); errs.push(...p.errors); await p.close(); }
    // 2. the setup, from Set up a game… (4 players)
    for (const v of ['2a', '2b']) { const p = await open('1a' + v + '3a4a5a', vp, dpr); await click(p, '#tSetup'); await p.evaluate(() => document.querySelector('input[name=np][value="4"]').click()); await shot(p, `2-${v}-setup-${dev}`);
      if (dev === 'phone') { await p.evaluate(() => { const f = document.querySelector('#mform'); f.scrollTop = f.scrollHeight; }); await shot(p, `2-${v}-setup-end-${dev}`); }
      errs.push(...p.errors); await p.close(); }
    // 3. the course choice (More options open, scrolled to the course)
    for (const v of ['3a', '3b']) { const p = await open('1a2b' + v + '4a5a', vp, dpr); await click(p, '#tSetup');
      await p.evaluate(() => { const c = document.querySelector('#sC').closest('.field'); const f = document.querySelector('#mform'); f.scrollTop = c.offsetTop - 20; }); await shot(p, `3-${v}-course-${dev}`); errs.push(...p.errors); await p.close(); }
    // 4. a saved game waiting (a game started, then the page opened again)
    for (const v of ['4a', '4b']) { const p = await open('1a2a3a' + v + '5a', vp, dpr); await click(p, '#tPlay'); await inGame(p); await p.waitForTimeout(500);
      await p.reload(); await p.waitForFunction(() => window.__ED && document.fonts.status === 'loaded' && document.querySelector('#menu').open); await settle(p); await p.waitForTimeout(600);
      await shot(p, `4-${v}-saved-${dev}`); errs.push(...p.errors); await p.close(); }
    // 5. the Menu during a game
    for (const v of ['5a', '5b']) { const p = await open('1a2a3a4a' + v, vp, dpr); await click(p, '#tPlay'); await inGame(p); await p.waitForTimeout(500);
      await click(p, '#menuBtn'); await p.waitForTimeout(400); await shot(p, `5-${v}-ingame-${dev}`); errs.push(...p.errors); await p.close(); }
  }
  console.log('page errors:', errs.length, errs.slice(0, 4).join(' | ').slice(0, 600));
  await b.close(); srv.close && srv.close(); })();
