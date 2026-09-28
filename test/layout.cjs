// Layout regression test: at many screen sizes, in normal play and in replay mode, every control is fully on screen
// and no two controls overlap (the board may sit under things: it pans). Run after any UI change:
//   NODE_PATH=$(npm root -g) node test/layout.cjs [--shots dir]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SIZES = [[320, 568], [390, 844], [844, 390], [768, 1024], [1024, 700], [1024, 768], [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440]];
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const log = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/replay.json'), 'utf8'));

// every control that must be reachable; groups that may not overlap each other
const CHECK = () => {
  // the part of an element you can actually see: clipped by every ancestor that clips (scroll strips, the game area)
  const vis = e => { if (!e) return null; const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return null;
    let r = e.getBoundingClientRect(), L = r.left, T = r.top, R = r.right, B = r.bottom;
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const st = getComputedStyle(a);
      if (st.overflow !== 'visible' || st.overflowX !== 'visible' || st.overflowY !== 'visible') { const q = a.getBoundingClientRect(); L = Math.max(L, q.left); T = Math.max(T, q.top); R = Math.min(R, q.right); B = Math.min(B, q.bottom); } }
    return R - L > 1 && B - T > 1 ? { left: L, top: T, right: R, bottom: B, width: R - L, height: B - T } : null; };
  const W = innerWidth, H = innerHeight, bad = [];
  const items = [];
  const add = (sel, name, group) => document.querySelectorAll(sel).forEach((e, i) => { const r = vis(e); if (r) items.push({ name: name + (i ? '#' + i : ''), r, group, el: e }); });
  add('#hud .tbtn, #hud #menuBtn', 'hud button', 'hud');
  add('#hud .pchip', 'player chip', 'chips');
  add('#prompt', 'prompt', 'prompt');
  add('#mkt:not(.hid) .mslot, #mkt:not(.hid) .alltile', 'market card', 'mkt');
  add('.zoomctl button', 'zoom button', 'zoom');
  add('#deckPile', 'deck pile', 'piles'); add('#discPile', 'discard pile', 'piles');
  add('#actBtns button', 'turn button', 'act');
  add('#rdock button, #rdock input, #rdock #rbPos', 'replay control', 'dock');
  add('#rside', 'bot view', 'side');
  if (!vis(document.querySelector('#jrnBtn'))) bad.push('journal button not visible');
  // an open journal: the whole panel on screen, with its list and close button
  const jm = document.querySelector('#overlay .modal.jrn');
  if (jm) { const r = jm.getBoundingClientRect(); if (r.left < 0 || r.top < 0 || r.right > W || r.bottom > H) bad.push('journal off screen');
    const lg = vis(jm.querySelector('#log')), cb = vis(jm.querySelector('#jClose')); if (!lg || lg.height < 40) bad.push('journal list too small'); if (!cb) bad.push('journal close button hidden');
    if (!jm.querySelector('#log .le')) bad.push('journal is empty'); }
  // 1. fully on screen (the player chips may scroll sideways inside their strip)
  for (const it of items) { const r = it.r; if (it.group === 'chips') continue;
    if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) bad.push(`${it.name} off screen (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)})`); }
  // 2. no overlaps between different groups (controls in the same group are laid out by one container)
  const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j]; if (a.group === b.group) continue;
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (hit(a.r, b.r)) bad.push(`${a.name} overlaps ${b.name}`); }
  // 3. the hand: every card at least half visible, and never under a control
  document.querySelectorAll('#cards .card').forEach((c, i) => { const r = vis(c); if (!r) return;
    for (const it of items) if (['dock', 'side', 'act', 'prompt', 'hud'].includes(it.group) && hit(r, it.r)) bad.push(`hand card ${i} under ${it.name}`); });
  return [...new Set(bad)];
};

(async () => {
  const b = await chromium.launch(); let fails = 0, checks = 0;
  // served over http (as on the site), so the page can fetch the AI network (/ai/first.bin) for the replay's evaluation
  const pub = path.join(__dirname, '..', 'public'), srv = require('http').createServer((q, r) => {
    const f = path.join(pub, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(pub) || !fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
  await new Promise(res => srv.listen(0, '127.0.0.1', res));
  const url = `http://127.0.0.1:${srv.address().port}/`;
  for (const [w, h] of SIZES) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(url); await p.waitForTimeout(600);
    // normal play: start a local game from the setup screen
    await p.click('#sGo'); await p.waitForTimeout(1600);
    const states = [['play', null], ['journal', async () => { await p.click('#jrnBtn', { timeout: 5000 }); }], ['play, market closed', async () => { await p.click('#mktBtn', { timeout: 5000 }); }],
      // another player's turn as a recap under the prompt (more steps than fit on a phone), market closed and open
      ['recap of an AI turn', async () => { await p.evaluate(() => { const E = window.__ED, S = E.S; S.players[1].ai = 'raleigh';
        E.playEvents([{ e: 'play', pl: 1, k: 'move', ts: ['explorer'], n: 1, sym: 'j' }, { e: 'play', pl: 1, k: 'action', ts: ['cartographer'], n: 2 },
          { e: 'play', pl: 1, k: 'rubble', ts: ['traveler', 'sailor'] }, { e: 'play', pl: 1, k: 'buy', ts: ['traveler', 'traveler', 'explorer'], got: 'scout', paid: 2.5 },
          { e: 'gain', pl: 1, t: 'scout' }, { e: 'play', pl: 1, k: 'end', kept: 1, disc: 1 }], 0); E.render(); }); }],
      ['recap, market open', async () => { await p.click('#mktBtn', { timeout: 5000 }); await p.waitForTimeout(300); const n = await p.evaluate(() => document.querySelectorAll('#feed .fg:not(.gone)').length); if (!n) throw new Error('no recap shown'); }],
      ['replay journal', async () => { await p.evaluate(l => window.__ED.openReplay(l, null), log); await p.waitForTimeout(1200);
        await p.evaluate(() => { const r = document.querySelector('#rbR'); r.value = Math.floor(r.max * .4); r.dispatchEvent(new Event('input')); }); await p.click('#jrnBtn', { timeout: 5000 }); }],
      ['replay', null],
      ['replay, bot view hidden', async () => { await p.click('#rbA', { timeout: 5000 }); }],
      ['replay, market closed', async () => { await p.click('#rbA', { timeout: 5000 }); await p.click('#mktBtn', { timeout: 5000 }); }]];
    for (const [name, setup] of states) {
      await p.keyboard.press('Escape').catch(() => {}); // close any overlay a previous step opened
      try { if (setup) await setup(); } catch (e) { fails++; console.log(`FAIL ${w}×${h} ${name}: could not set up (${e.message.split('\n')[0]})`); continue; }
      await p.mouse.move(w / 2, 1); // park the pointer away from the hand (hovered cards lift by design)
      await p.waitForTimeout(900);
      const bad = await p.evaluate(CHECK); checks++;
      if (bad.length) { fails++; console.log(`FAIL ${w}×${h} ${name}:\n   ` + bad.join('\n   ')); }
      if (shots) await p.screenshot({ path: `${shots}/layout_${w}x${h}_${name.replace(/[^a-z]+/g, '-')}.png` });
    }
    if (errs.length) { fails++; console.log(`FAIL ${w}×${h} page errors: ${errs.join('; ')}`); }
    await p.close();
  }
  await b.close(); srv.close();
  console.log(fails ? `layout: ${fails} failing of ${checks} checks` : `layout ok: ${checks} checks at ${SIZES.length} sizes`);
  process.exit(fails ? 1 : 0);
})();
