// Layout regression test: at many screen sizes, in normal play and in replay mode, every control is fully on screen
// and no two controls overlap (the board may sit under things: it pans). Run after any UI change:
//   NODE_PATH=$(npm root -g) node test/layout.cjs [--quick] [--shots dir]
// --quick: five sizes (phone portrait and landscape, tablet, laptop, desktop). Sizes run in parallel.
const { browser, serveStatic, settle, openPage } = require('./lib.cjs');
const fs = require('fs'), path = require('path');
// [width, height, device scale]; [1536, 639, 1.25] is the owner's own screen (Chrome on Windows at 125%): his setup is the test
const ALL = [[320, 568], [390, 844], [844, 390], [768, 1024], [1024, 700], [1024, 768], [1280, 720], [1366, 768], [1440, 900], [1536, 639, 1.25], [1920, 1080], [2560, 1440]];
// (--desktop: desktop screens only, 1000 wide or more: Firefox's run, owner 2026-10-05)
const SIZES = (process.argv.includes('--quick') ? [[390, 844], [844, 390], [768, 1024], [1280, 720], [1536, 639, 1.25], [1920, 1080]] : ALL).filter(s => !process.argv.includes('--desktop') || s[0] >= 1000);
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
  // on a portrait phone every turn of the history takes the whole screen: then it is the only thing to check
  const hcFull = document.querySelector('#lside'); if (hcFull && !hcFull.hidden && getComputedStyle(hcFull).position === 'fixed') { const r = hcFull.getBoundingClientRect();
    if (Math.abs(r.width - W) > 1 || Math.abs(r.height - H) > 1) bad.push('full-screen history does not fill the screen'); if (!hcFull.querySelector('.ht, .hnone')) bad.push('history is empty');
    if (!vis(hcFull.querySelector('.hx'))) bad.push('full-screen history has no way out'); return bad; }
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
  add('#lside', 'history column', 'side');
  add('#allc:not([hidden]) #allClose', 'All cards close', 'overlay'); // (an overlay's own controls sit on nothing else)
  if (!vis(document.querySelector('#histBtn'))) bad.push('history button not visible');
  // the history column (when shown): its own cell, with its turns
  const hc = document.querySelector('#lside');
  if (hc && !hc.hidden) { const r = vis(hc); if (!r || r.height < 80) bad.push('history column too small'); if (!hc.querySelector('.ht, .hnone')) bad.push('history column is empty'); }
  // 1. fully on screen (the player chips may scroll sideways inside their strip)
  for (const it of items) { const r = it.r; if (it.group === 'chips') continue;
    if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) bad.push(`${it.name} off screen (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)})`); }
  // 2. no overlaps between different groups (controls in the same group are laid out by one container)
  const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j]; if (a.group === b.group) continue;
    // (an overlay covers the game: its own controls may lie over the game's content, but never on the top bar's controls,
    // which stay readable through it)
    if ((a.group === 'overlay' || b.group === 'overlay') && ![a.group, b.group].some(g => g === 'hud' || g === 'chips')) continue;
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (hit(a.r, b.r)) bad.push(`${a.name} overlaps ${b.name}`); }
  // 3. the hand: every card at least half visible, and never under a control
  document.querySelectorAll('#cards .card:not(.fly):not(.mghost)').forEach((c, i) => { const r = vis(c); if (!r) return; // (cards in flight are animations, not the hand)
    for (const it of items) if (['dock', 'side', 'act', 'prompt', 'hud'].includes(it.group) && hit(r, it.r)) bad.push(`hand card ${i} under ${it.name}`); });
  return [...new Set(bad)];
};

(async () => {
  const b = await browser.launch(); let fails = 0, checks = 0;
  // served over http (as on the site), so the page can fetch the AI network (/ai/first.<hash>.bin) for the replay's evaluation
  const srv = await serveStatic(), url = srv.url;
  const one = async ([w, h, dpr = 1]) => {
    const out = [];
    const p = await openPage(b, `${w}×${h}`, { viewport: { width: w, height: h }, deviceScaleFactor: dpr }), errs = p.errors; // (assertion failures count: openPage)
    await p.goto(url); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
    // normal play: start a local game from the setup screen
    await p.click('#sGo'); await p.waitForFunction(() => window.__ED.S && !window.__ED.UI.preview && !document.querySelector('#menu').open);
    const states = [['play', null],
      // the All cards overlay over the game (from its tile; where the market is too narrow, the Market button opens it)
      ['All cards open', async () => { await p.click(await p.evaluate(() => { const t = document.querySelector('#allTile'); return t && t.offsetParent && !document.querySelector('#mkt').classList.contains('cramped') ? '#allTile' : '#mktBtn'; }), { timeout: 5000 }); await p.waitForSelector('#allc:not([hidden])', { timeout: 5000 }); }],
      // a market card under the pointer (it grows to be read): it must not cover the top bar (playtest 2, A7)
      ['market card under the pointer', async () => { const r = await p.evaluate(() => { const e = document.querySelector('#mkt:not(.hid):not(.cramped) #market .mslot:not(.empty)'); if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
        if (r) { await p.mouse.move(r.x, r.y); await p.waitForTimeout(400); } }],
      // a hand card chosen (it rises above the hand): nothing it rises over is a control (playtest 2, A7: over End turn on a phone)
      ['a card chosen', async () => { await p.evaluate(() => { const E = window.__ED; const h = E.S.players[E.S.cur].hand; E.onHandCard(h[h.length - 1]); E.render(); /* (the rightmost: nearest the turn buttons) */ }); await settle(p); }],
      ['history on the left', async () => { await p.evaluate(() => window.__ED.cancelMode()); await p.click('#histBtn', { timeout: 5000 }); }],
      ['history hidden', async () => { await p.click(await p.evaluate(() => getComputedStyle(document.querySelector('#lside')).position === 'fixed') ? '#lside .hx' : '#histBtn', { timeout: 5000 }); }],
      ['play, market closed', async () => { await p.click('#histBtn', { timeout: 5000 }); await p.click('#mktBtn', { timeout: 5000 }); }], // (back under the prompt)
      // another player's turn as a recap under the prompt (more steps than fit on a phone), market closed and open
      // another player's turn, arriving step by step as it's played (a long one: it goes on to a second line), into the
      // game's journal as the engine writes it; between steps the page settles, so the layout-shift and churn assertions
      // see every step join the row (nothing already shown may move)
      ['recap of an AI turn, step by step', async () => {
        for (const st of [{ k: 'move', ts: ['explorer'], n: 1, sym: 'j' }, { k: 'move', ts: ['scout'], n: 2, sym: 'j' }, { k: 'action', ts: ['cartographer'], n: 2 },
          { k: 'rubble', ts: ['traveler', 'sailor'] }, { k: 'move', ts: ['explorer'], n: 1, sym: 'j' }, { k: 'buy', ts: ['traveler', 'traveler', 'explorer'], got: 'scout', paid: 2.5 },
          { k: 'end', kept: 1, disc: 1, ts: ['sailor'] }]) {
          // (at an AI's pace, ~0.7 s apart: well after the last click, so a jump isn't excused as following an input)
          await p.waitForTimeout(700); await p.evaluate(st => { const E = window.__ED, S = E.S; S.log.push({ e: 'play', pl: (S.cur + 1) % S.players.length, ...st, r: S.round }); E.render(); }, st); await settle(p); } }],
      // (owner, 2026-10-01: the recap shows only where the prompt holds six cards; beside an open market on a small phone it hides)
      ['recap, market open', async () => { await p.click('#mktBtn', { timeout: 5000 }); await settle(p); const r = await p.evaluate(() => { const pr = document.querySelector('#prompt'), ps = getComputedStyle(pr);
        return { n: document.querySelectorAll('#feed .fg').length, room: pr.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight), six: parseFloat(ps.getPropertyValue('--six')) }; });
        if ((r.room >= r.six - .5) !== (r.n > 0)) throw new Error(`recap ${r.n ? 'shown' : 'hidden'} with room ${r.room} for ${r.six}`); }],
      ['replay, history on the left', async () => { await p.evaluate(l => window.__ED.openReplay(l, null), log); await p.waitForFunction(() => window.__ED.G.replay); await settle(p);
        await p.evaluate(() => { const r = document.querySelector('#rbR'); r.value = Math.floor(r.max * .4); r.dispatchEvent(new Event('input')); }); await p.click('#histBtn', { timeout: 5000 }); }],
      ['replay', async () => { await p.click(await p.evaluate(() => getComputedStyle(document.querySelector('#lside')).position === 'fixed') ? '#lside .hx' : '#histBtn', { timeout: 5000 }); }], // (history hidden)
      ['replay, bot view hidden', async () => { await p.click('#rbA', { timeout: 5000 }); }],
      ['replay, market closed', async () => { await p.click('#rbA', { timeout: 5000 }); await p.click('#mktBtn', { timeout: 5000 }); }]];
    for (const [name, setup] of states) {
      await p.keyboard.press('Escape'); // close any overlay a previous step opened
      try { if (setup) await setup(); } catch (e) { fails++; out.push(`FAIL ${w}×${h} ${name}: could not set up (${e.message.split('\n').filter(l => /Timeout|intercepts|not visible|not stable|waiting for|resolved/.test(l)).slice(0, 6).join(' · ')})`); continue; }
      if (!/under the pointer/.test(name)) await p.mouse.move(w / 2, 1); // park the pointer away from the hand (hovered cards lift by design)
      await settle(p, 6000); // (card flights, panels, the market: whatever the step set moving)
      const bad = await p.evaluate(CHECK); checks++;
      for (const e of errs.splice(0)) bad.push('page error: ' + e.split('\n')[0]); // (an assertion that failed during this step, named with it)
      if (bad.length) { fails++; out.push(`FAIL ${w}×${h} ${name}:\n   ` + bad.join('\n   ')); }
      if (shots) await p.screenshot({ path: `${shots}/layout_${w}x${h}_${name.replace(/[^a-z]+/g, '-')}.png` });
    }
    if (errs.length) { fails++; out.push(`FAIL ${w}×${h} page errors: ${errs.join('; ')}`); }
    await p.close(); if (out.length) console.log(out.join('\n'));
  };
  /* every height between the sizes above, as a person dragging the window's edge passes through them: the fixed sizes reach
     only the layouts that happen at those sizes (a market that measured its own position flipped between shown and hidden
     at heights near 386 and 437, at no size listed: 2026-10-05). The page's own checks judge each height (the layout
     settles, nothing moves without a cause); in play and in a replay, its side columns narrowing the game area */
  const sweep = async ([w, replay]) => {
    const name = `${w} wide, ${replay ? 'a replay' : 'play'}, heights 560 to 260`, p = await openPage(b, name, { viewport: { width: w, height: 560 } });
    await p.goto(url); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
    await p.click('#sGo'); await p.waitForFunction(() => window.__ED.S && !window.__ED.UI.preview && !document.querySelector('#menu').open); await settle(p);
    if (replay) { await p.evaluate(l => window.__ED.openReplay(l, null), log); await p.waitForFunction(() => window.__ED.G.replay); await settle(p); }
    if (!(await p.evaluate(() => window.__ED.UI.mktOpen))) await p.click('#mktBtn'); // (the market open: what the heights decide)
    for (let h = 560; h >= 260 && !p.errors.length; h -= 2) { await p.setViewportSize({ width: w, height: h }); await p.evaluate(() => new Promise(r => setTimeout(r, 60))); } checks++;
    if (p.errors.length) { fails++; console.log(`FAIL ${name}: ${p.errors[0].split('\n')[0]}`); } await p.close();
  };
  // a few sizes at a time (each page waits on its own animations: parallel pages don't slow each other much)
  const queue = [...SIZES.map(s => () => one(s)), () => sweep([1000, false]), ...(process.argv.includes('--desktop') ? [] : [() => sweep([700, true])])];
  await Promise.all([...Array(4)].map(async () => { while (queue.length) await queue.shift()(); }));
  await b.close(); srv.close();
  console.log(fails ? `layout: ${fails} failing of ${checks} checks` : `layout ok: ${checks} checks at ${SIZES.length} sizes`);
  process.exit(fails ? 1 : 0);
})();
