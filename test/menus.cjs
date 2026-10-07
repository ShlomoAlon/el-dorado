// The menus as a person uses them, on this device (no server): the three tabs (This device, Online, Settings) and Replays
// from Settings; a game kept on this device listed with who won, and opened from Replays comes back to Replays when closed;
// during a game the same menu with the game's bar, everything else greyed but Settings, and coming back (a reload) starts at it;
// the results at the end of a game.
// (Online menus, the room lobby and signing out: test/online.cjs.)
//   NODE_PATH=$(npm root -g) node test/menus.cjs
const { browser, serveStatic, openPage, settle, report, menuGo } = require('./lib.cjs');
const fs = require('fs'), path = require('path');
const T = report('menus'), LOG = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/replay.json'), 'utf8'));
(async () => {
  const srv = await serveStatic(), b = await browser.launch(), p = await openPage(b, 'menus');
  const until = (f, a, ms = 15000) => p.waitForFunction(f, a, { timeout: ms }).then(() => true, () => false);
  const check = async (name, f, a, ms) => T.ok(name, await until(f, a, ms));
  const screen = s => `!document.querySelector('section[data-screen="${s}"]').hidden`;
  await p.goto(srv.url); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
  // the menu as ever: three tabs (This device, Online, Settings), This device first. During a game (owner, 2026-10-07) the
  // same menu, with the game's bar (Continue, End game, Resign) on top and everything else greyed but Settings
  const shows = g => { const m = document.querySelector('#menu'); return m.open && document.querySelectorAll('#sMode label').length === 3 && document.querySelector('#ingame').hidden === !g
    && m.classList.contains('ingame') === g && [...document.querySelectorAll('fieldset.lock')].every(f => f.disabled === g) && document.querySelector('#sGo').disabled === g
    && document.querySelector('#sReplays').disabled === g && !document.querySelector('#sMode input[value=settings]').disabled; };
  await check('This device first, no game: no game bar, nothing greyed', new Function('g', `return (${shows})(g) && ${screen('setup')}`), false);
  // keys an older version kept (playtest 2: eldorado-save-v4/-v5, -side, -rexp) are gone once the page loads; its own stay
  await p.evaluate(() => { for (const k of ['eldorado-save-v4', 'eldorado-save-v5', 'eldorado-side', 'eldorado-rexp']) localStorage.setItem(k, '1'); localStorage.setItem('other-site', '1'); });
  await p.reload(); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
  await check('old keys are removed when the page loads, and only ours', () => !Object.keys(localStorage).some(k => /^eldorado-(save-v[45]|side|rexp)$/.test(k)) && localStorage.getItem('other-site') === '1');
  await menuGo(p, 'online');
  await check('Online (this copy can\'t reach the server, and says so)', new Function(`return ${screen('online')} && !document.querySelector('#oOff').hidden`));
  // a game finished on this device is listed under Your games: its result first (all AIs here: who won), then the course
  await p.evaluate(L => localStorage.setItem('eldorado-games-v2', JSON.stringify([{ ...L, created: Date.now() }])), LOG);
  await menuGo(p, 'replays');
  await check('Replays', new Function(`return ${screen('replays')}`));
  const won = LOG.players.filter((_, i) => LOG.result.places[i] === 1).map(x => x.name).join(' & ');
  await check('a game kept here: who won, then where and when (no upload button)', w => { const b = document.querySelector('#rMine [data-lid] b'); return !!b && b.textContent === 'Won by ' + w && !document.querySelector('#rUp'); }, won);
  // opening it plays it; closing it comes back to Replays
  // closed while the advisor is still thinking (as a quick player does): its answer, arriving after, must find nothing broken.
  // The replay is closed in the same moment the page asks the AI's worker for advice (not caught by polling: the answer can
  // come between two looks)
  await p.evaluate(() => { const pm = Worker.prototype.postMessage; Worker.prototype.postMessage = function (m, ...r) { pm.call(this, m, ...r);
    if (m && m.t === 'advise' && !window.__R) { window.__R = window.__ED.G.replay; queueMicrotask(() => { const b = document.querySelector('#menuBtn'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })); b.click(); }); } }; }); // (a microtask: once the frame asking has finished, before any answer can come back; pressed as a player presses, pointer down then click)
  await p.click('#rMine [data-lid]');
  await check('a kept game opens as a replay; the advisor is asked, and the replay closed at once', () => !!window.__R && !window.__ED.G.replay);
  await check('the advice arrives after the replay closed', () => window.__R.asking.size === 0);
  await check('closing it comes back to Replays', new Function(`return !window.__ED.G.replay && document.querySelector('#menu').open && ${screen('replays')} && document.querySelector('input[name=mode][value=settings]').checked`));
  // a game: the menu over it has the game bar; a replay watched from there keeps the game
  // a screen that scrolls keeps its way back and title at the top and its main action at the foot in sight (owner,
  // 2026-10-06), at the owner's size and on a phone: each screen scrolled through, top to bottom (the page's own check
  // judges every scroll), and a screen that fits shows no edge lines
  for (const vp of [{ width: 1229, height: 511 }, { width: 390, height: 844 }, { width: 390, height: 600 }]) { // (1536×639 at 125%: 1229×511 CSS pixels)
    await p.setViewportSize(vp); await settle(p);
    for (const v of ['local', 'online', 'replays', 'settings']) { await menuGo(p, v); await settle(p);
      const r = await p.evaluate(async () => { const f = document.querySelector('#mform'), sec = f.querySelector('section[data-screen]:not([hidden])'), fr = () => f.getBoundingClientRect();
        const seen = el => { if (!el) return true; const a = el.getBoundingClientRect(), b = fr(); return a.top >= b.top - 1 && a.bottom <= b.bottom + 1; };
        const head = sec.querySelector(':scope > .mhead') || document.querySelector('#mtop'), foot = sec.querySelector(':scope > .mrow'), scrolls = f.scrollHeight > f.clientHeight + 1; let ok = true;
        for (let y = 0; y <= f.scrollHeight; y += 120) { f.scrollTop = y; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); ok = ok && seen(head) && seen(foot); }
        f.scrollTop = 0; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return { ok, scrolls, lines: f.classList.contains('scrolled') || (!scrolls && f.classList.contains('more')) }; });
      T.ok(`${vp.width}×${vp.height} ${v}: its pinned parts stay in sight as it scrolls${r.scrolls ? '' : ' (it fits)'}, no edge line at the top`, r.ok && !r.lines, JSON.stringify(r)); } }
  await p.setViewportSize({ width: 1280, height: 800 }); await settle(p); // (the test's own size again)
  // Replays goes back to Settings by its ‹ Settings, or Esc
  await menuGo(p, 'replays'); await p.keyboard.press('Escape'); await check('Esc: from Replays back to Settings', new Function(`return ${screen('settings')}`));
  await menuGo(p, 'replays'); await p.click('#rBack'); await check('‹ Settings: back to Settings', new Function(`return ${screen('settings')}`));
  await menuGo(p, 'settings'); await check('Settings: sound, the buy reminder', () => !document.querySelector('section[data-screen=settings]').hidden && !!document.querySelector('#setSnd') && !!document.querySelector('#sBuyWarn'));
  await menuGo(p, 'local'); await check('This device', new Function(`return ${screen('setup')}`));
  await p.click('#sGo'); await check('the game starts', () => !!window.__ED.S && !window.__ED.UI.preview && !document.querySelector('#menu').open);
  await settle(p);
  // a player's chip shows two piles: the discard pile, and everything else they own (hand, draw pile, in play: not where each is)
  const other = await p.evaluate(() => (window.__ED.S.cur + 1) % window.__ED.S.players.length);
  await p.click(`#players .pchip:nth-child(${other + 1})`);
  await check("another player's chip: the discard pile, and everything else they own", i => { const q = window.__ED.S.players[i], P = [...document.querySelectorAll('#overlay .ppart')], h = P.map(e => e.querySelector('h3').firstChild.textContent.trim());
    return h.join() === 'Discard pile,Everything else,Blockades' && P[0].querySelectorAll('.mcard').length === q.discard.length && P[1].querySelectorAll('.mcard').length === q.hand.length + q.deck.length + q.play.length; }, other);
  await p.click('#pClose'); await settle(p);
  const pos = await p.evaluate(() => JSON.stringify(window.__ED.S.players.map(q => q.hand)));
  // the menu during a game is the same main menu, with the game's buttons open and nothing that would start or join another
  // (owner, 2026-10-06: "if you're in a game, you're in a game"): New game, Online and Replays greyed
  await p.click('#menuBtn'); await check('Menu during a game: the game\'s bar (Continue, End game, Resign); This device, Online and Replays greyed; Settings open', new Function('g', `return (${shows})(g) && ${screen('setup')}`), true);
  // coming back (a reload: the tab closed and opened again) starts at the game's menu, not in the game: Continue goes in,
  // the position kept (the AIs wait while the menu is open)
  await p.reload(); await p.waitForFunction(() => window.__ED && window.__ED.S);
  await check('reloaded: the game in progress, behind the main menu', shows, true);
  await check('the same position', r => JSON.stringify(window.__ED.S.players.map(q => q.hand)) === r, pos);
  await p.click('#sBack'); await check('Continue: back in the game', () => !document.querySelector('#menu').open && !!window.__ED.S && !window.__ED.S.over && !window.__ED.G.replay);
  await settle(p); await p.click('#menuBtn'); await check('the menu again', shows, true);
  await p.keyboard.press('Escape'); await check('Escape: back to the game', () => !document.querySelector('#menu').open && !window.__ED.S.over);
  // from the menu to the window it opens and back (Resign, then Keep playing), and End game from the menu straight to the
  // results: the game never shows bare between two overlays (the page's cover check fails the test at once if it does)
  await p.click('#menuBtn'); await check('Menu again', shows, true);
  await settle(p); await p.click('#sResign'); await check('Resign asks first', () => !!document.querySelector('#overlay #rsNo'));
  await settle(p); await p.click('#overlay #rsNo'); await check('Keep playing: back to the game', () => !document.querySelector('#overlay .scrim:not(.closing)') && !window.__ED.S.over);
  await settle(p); await p.waitForTimeout(1100); await p.click('#menuBtn'); await check('and the menu once more', () => document.querySelector('#menu').open);
  await settle(p); await p.click('#sEnd'); await check('End game asks first', () => !!document.querySelector('#overlay #egYes'));
  await settle(p); await p.click('#overlay #egYes');
  await check('ended from the menu: the results', () => window.__ED.S.over && !!document.querySelector('#overlay #gNew'));
  await settle(p); await p.waitForTimeout(1100); // (the cover check watches a second after each change)
  await p.click('#overlay #gNew'); await check('New game: the start screen', new Function(`return document.querySelector('#menu').open && ${screen('setup')}`));
  await p.click('#sGo'); await check('another game starts', () => !!window.__ED.S && !window.__ED.S.over && !window.__ED.UI.preview && !document.querySelector('#menu').open); await settle(p);
  // the end of a game: two resign, the third wins, the results come up; New game goes back to the start screen
  await p.evaluate(() => { __ED.act({ t: 'resign' }); }); await p.evaluate(() => { __ED.act({ t: 'resign' }); });
  await check('game over: the results', () => window.__ED.S.over && !!document.querySelector('#overlay #gNew') && document.querySelectorAll('#overlay .prow').length === 3);
  await p.click('#overlay #gNew'); await check('New game: the start screen', new Function(`return document.querySelector('#menu').open && ${screen('setup')}`));
  T.ok('no page errors', !p.errors.length, p.errors.slice(0, 5).join(' | '));
  await b.close(); srv.close(); T.done();
})().catch(e => { console.error(e); process.exit(1); });
