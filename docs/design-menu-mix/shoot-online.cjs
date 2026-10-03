// Menu mix, parts 6-13 (Online, room lobby, Replays), against a local game server: node mixshoot3.cjs <outdir>
const { chromium, startServer, openPage, settle } = require('/home/user/el-dorado/test/lib.cjs');
const fs = require('fs'), path = require('path'); const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const LOG = JSON.parse(fs.readFileSync('/home/user/el-dorado/test/fixtures/replay.json', 'utf8'));
const SEED = () => { let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const SIZES = [['desk', { width: 1536, height: 639 }, 1.25], ['phone', { width: 390, height: 844 }, 2]];
(async () => {
  const srv = await startServer(), b = await chromium.launch(), errs = [];
  let n = 0;
  try {
    const open = async (mix, vp, dpr, signed) => { const p = await openPage(b, 'mix ' + mix, { viewport: vp, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
      await p.addInitScript(SEED); await p.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '#toast{display:none!important}'; document.head.appendChild(s); }));
      await p.addInitScript(L => { try { localStorage.setItem('eldorado-games-v2', JSON.stringify([{ ...L, created: Date.now() - 3600e3 }])); } catch (e) { /* expected: none */ } }, LOG);
      await p.goto(srv.url + '?mix=' + mix); await p.waitForFunction(() => window.__ED && document.fonts.status === 'loaded'); await settle(p); await p.waitForTimeout(300);
      await p.click('#sMode label[data-v="online"]'); await p.waitForSelector('#devName', { state: 'visible' });
      if (signed) { await p.fill('#devName', 'Ana' + (n++ ? '' : '')); await p.click('#devGo'); await p.waitForFunction(() => __ED.NET.user); await p.waitForTimeout(600); }
      return p; };
    const shot = async (p, name) => { await p.mouse.move(1, 1); await settle(p); await p.waitForTimeout(300); await p.screenshot({ path: path.join(out, name + '.png') }); console.log('shot', name); };
    const click = (p, sel) => p.evaluate(s => document.querySelector(s).click(), sel);
    const done = async p => { errs.push(...p.errors); await p.close(); };
    for (const [dev, vp, dpr] of SIZES) {
      for (const v of ['6a', '6b']) { const p = await open(v, vp, dpr, false); await shot(p, `6-${v}-${dev}`); await done(p); }
      for (const v of ['7a', '7b']) { const p = await open(v, vp, dpr, true); await shot(p, `7-${v}-${dev}`); await done(p); }
      for (const v of ['8a', '8b']) { const p = await open(v, vp, dpr, true); await click(p, '#oCreateT'); await shot(p, `8-${v}-${dev}`); await done(p); }
      { const p = await open('9b', vp, dpr, true); await shot(p, `9-9b-home-${dev}`); await p.click('#oJoinT'); await shot(p, `9-9b-${dev}`); await done(p); }
      { const p = await open('9a', vp, dpr, true); await shot(p, `9-9a-${dev}`); await done(p); }
      { const p = await open('10a', vp, dpr, true); await p.click('label:has(input[name=otab][value=board])'); await p.waitForFunction(() => document.querySelector('#lbList .lb')); await shot(p, `10-10a-${dev}`); await done(p); }
      { const p = await open('10b', vp, dpr, true); await shot(p, `10-10b-home-${dev}`); await click(p, '#oBoardT'); await p.waitForFunction(() => document.querySelector('#lbList .lb')); await shot(p, `10-10b-${dev}`); await done(p); }
      for (const v of ['11a', '11b']) { const p = await open(v, vp, dpr, true); await shot(p, `11-${v}-${dev}`); await done(p); }
      for (const v of ['12a', '12b']) { const p = await open(v + '8a', vp, dpr, true); await click(p, '#oCreateT'); await click(p, '#cGo');
        await p.waitForFunction(() => __ED.NET.connected && __ED.NET.roomS && __ED.NET.roomS.seats.length === 1, null, { timeout: 15000 }); await shot(p, `12-${v}-${dev}`);
        if (v === '12a') { await click(p, '.seatrow.addai'); await shot(p, `12-12a-ai-${dev}`); }
        await click(p, '#rlLeave'); await p.waitForTimeout(300); await done(p); }
      for (const v of ['13a', '13b']) { const p = await open(v, vp, dpr, true); await p.click('#sMode label[data-v="replays"]'); await p.waitForTimeout(800); await shot(p, `13-${v}-${dev}`); await done(p); }
    }
  } finally { console.log('page errors:', errs.length, errs.slice(0, 4).join(' | ').slice(0, 600)); await b.close(); srv.stop(); }
})();
