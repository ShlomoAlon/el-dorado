// The chosen menu mix (1b 2b 3a 4a 5c) and the Online screens, against a local game server: node mixshoot2.cjs <outdir>
const { chromium, startServer, openPage, settle } = require('/home/user/el-dorado/test/lib.cjs');
const fs = require('fs'), path = require('path'); const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const SEED = () => { let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const MIX = '1b2b3a4a5c', SIZES = [['desk', { width: 1536, height: 639 }, 1.25], ['phone', { width: 390, height: 844 }, 2]];
(async () => {
  const srv = await startServer(), b = await chromium.launch(), errs = [];
  try {
    const open = async (vp, dpr) => { const p = await openPage(b, 'mix', { viewport: vp, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
      await p.addInitScript(SEED); await p.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '#toast{display:none!important}'; document.head.appendChild(s); })); await p.goto(srv.url + '?mix=' + MIX); await p.waitForFunction(() => window.__ED && document.fonts.status === 'loaded'); await settle(p); await p.waitForTimeout(300); return p; };
    const shot = async (p, name) => { await settle(p); await p.waitForTimeout(300); await p.screenshot({ path: path.join(out, name + '.png') }); console.log('shot', name); };
    const click = (p, sel) => p.evaluate(s => document.querySelector(s).click(), sel);
    const inGame = p => p.waitForFunction(() => window.__ED.S && !window.__ED.UI.preview && !document.querySelector('#menu').open, null, { timeout: 30000 });
    for (const [dev, vp, dpr] of SIZES) {
      let p = await open(vp, dpr);
      await shot(p, `title-${dev}`);
      // Online: signed out, then signed in (Play, Leaderboard), then a room made with Create
      await p.click('#sMode label[data-v="online"]'); await p.waitForSelector('#devName', { state: 'visible' }); await shot(p, `online-signedout-${dev}`);
      await p.fill('#devName', 'Ana'); await p.click('#devGo'); await p.waitForFunction(() => __ED.NET.user); await p.waitForTimeout(800); await shot(p, `online-play-${dev}`);
      await p.click('label:has(input[name=otab][value=board])'); await p.waitForFunction(() => document.querySelector('#lbList .lb')); await shot(p, `online-board-${dev}`);
      await p.click('label:has(input[name=otab][value=play])'); await click(p, '#cGo');
      await p.waitForFunction(() => __ED.NET.connected && __ED.NET.roomS && __ED.NET.roomS.seats.length === 1, null, { timeout: 15000 }); await shot(p, `online-room-${dev}`);
      await click(p, '#rlLeave'); await p.waitForTimeout(400);
      errs.push(...p.errors); await p.close();
      // the setup (More options open) and the course pictures
      p = await open(vp, dpr); await click(p, '#tSetup'); await p.evaluate(() => document.querySelector('input[name=np][value="4"]').click()); await shot(p, `setup-${dev}`);
      await p.evaluate(() => { const c = document.querySelector('#sC').closest('.field'), f = document.querySelector('#mform'); f.scrollTop = c.offsetTop - 20; }); await shot(p, `course-${dev}`);
      errs.push(...p.errors); await p.close();
      // a game: the Menu during it, then the page opened again with it saved
      p = await open(vp, dpr); await click(p, '#tAI'); await inGame(p); await p.waitForTimeout(500);
      await click(p, '#menuBtn'); await p.waitForTimeout(400); await shot(p, `ingame-${dev}`);
      await click(p, '#tCont'); await p.waitForTimeout(300);
      await p.reload(); await p.waitForFunction(() => window.__ED && document.fonts.status === 'loaded' && document.querySelector('#menu').open); await settle(p); await p.waitForTimeout(600); await shot(p, `saved-${dev}`);
      errs.push(...p.errors); await p.close();
    }
  } finally { console.log('page errors:', errs.length, errs.slice(0, 4).join(' | ').slice(0, 600)); await b.close(); srv.stop(); }
})();
