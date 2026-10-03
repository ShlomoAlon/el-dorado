// The menus as a person uses them, on this device (no server): the start screen's three tabs (This device / Online /
// Replays) and no extra Back or Replays buttons; a game kept on this device listed with who won, and opened from Replays
// comes back to Replays when closed; during a
// game the menu shows the game bar, and watching a replay from there keeps the game; the results at the end of a game.
// (Online menus, the room lobby and signing out: test/online.cjs.)
//   NODE_PATH=$(npm root -g) node test/menus.cjs
const { chromium, serveStatic, openPage, settle, report } = require('./lib.cjs');
const fs = require('fs'), path = require('path');
const T = report('menus'), LOG = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/replay.json'), 'utf8'));
(async () => {
  const srv = await serveStatic(), b = await chromium.launch(), p = await openPage(b, 'menus');
  const until = (f, a, ms = 15000) => p.waitForFunction(f, a, { timeout: ms }).then(() => true, () => false);
  const check = async (name, f, a, ms) => T.ok(name, await until(f, a, ms));
  const screen = s => `!document.querySelector('section[data-screen="${s}"]').hidden`;
  await p.goto(srv.url); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
  await check('start screen: three tabs, no Back or Replays buttons', () => document.querySelectorAll('#sMode label').length === 3 && !document.querySelector('[data-go]') && !document.querySelector('#sReplays'));
  // keys an older version kept (playtest 2: eldorado-save-v4/-v5, -side, -rexp) are gone once the page loads; its own stay
  await p.evaluate(() => { for (const k of ['eldorado-save-v4', 'eldorado-save-v5', 'eldorado-side', 'eldorado-rexp']) localStorage.setItem(k, '1'); localStorage.setItem('other-site', '1'); });
  await p.reload(); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
  await check('old keys are removed when the page loads, and only ours', () => !Object.keys(localStorage).some(k => /^eldorado-(save-v[45]|side|rexp)$/.test(k)) && localStorage.getItem('other-site') === '1');
  await p.click('#sMode label[data-v="online"]');
  await check('Online tab (this copy can\'t reach the server, and says so)', new Function(`return ${screen('online')} && !document.querySelector('#oOff').hidden`));
  // a game finished on this device is listed under Your games: its result first (all AIs here: who won), then the course
  await p.evaluate(L => localStorage.setItem('eldorado-games-v2', JSON.stringify([{ ...L, created: Date.now() }])), LOG);
  await p.click('#sMode label[data-v="replays"]');
  await check('Replays tab', new Function(`return ${screen('replays')}`));
  const won = LOG.players.filter((_, i) => LOG.result.places[i] === 1).map(x => x.name).join(' & ');
  await check('a game kept here: who won, then where and when (no upload button)', w => { const b = document.querySelector('#rMine [data-lid] b'); return !!b && b.textContent === 'Won by ' + w && !document.querySelector('#rUp'); }, won);
  // opening it plays it; closing it comes back to Replays
  await p.click('#rMine [data-lid]');
  await check('a kept game opens as a replay', () => !!window.__ED.G.replay && !document.querySelector('#menu').open);
  // closed while the advisor is still thinking (as a quick player does): its answer, arriving after, must find nothing broken
  await check('the advisor is asked about the replay\'s first position, and the replay closed at once', () => { const R = window.__ED.G.replay; if (!R || !R.asking.size) return false;
    window.__R = R; document.querySelector('#menuBtn').click(); return !window.__ED.G.replay; });
  await check('the advice arrives after the replay closed', () => window.__R.asking.size === 0);
  await check('closing it comes back to Replays', new Function(`return !window.__ED.G.replay && document.querySelector('#menu').open && ${screen('replays')} && document.querySelector('input[name=mode][value=replays]').checked`));
  // a game: the menu over it has the game bar; a replay watched from there keeps the game
  await p.click('#sMode label[data-v="local"]'); await check('This device tab', new Function(`return ${screen('setup')}`));
  await p.click('#sGo'); await check('the game starts', () => !!window.__ED.S && !window.__ED.UI.preview && !document.querySelector('#menu').open);
  await settle(p);
  // a player's chip shows what can be seen of their cards: another player's hand face down, never its faces
  const other = await p.evaluate(() => (window.__ED.S.cur + 1) % window.__ED.S.players.length);
  await p.click(`#players .pchip:nth-child(${other + 1})`);
  await check("another player's chip: their hand face down", i => { const o = document.querySelector('#overlay .ppart'); return !!o && o.querySelectorAll('.pback').length === window.__ED.S.players[i].hand.length && !o.querySelector('.mcard'); }, other);
  await p.click('#pClose'); await settle(p);
  const pos = await p.evaluate(() => JSON.stringify(window.__ED.S.players.map(q => q.hand)));
  await p.click('#menuBtn'); await check('Menu during a game: the game bar and the tabs', () => document.querySelector('#menu').open && !document.querySelector('#ingame').hidden && !document.querySelector('#sMode').hidden);
  await p.click('#sMode label[data-v="replays"]'); await p.click('#rMine [data-lid]');
  await check('a replay during a game', () => !!window.__ED.G.replay);
  await settle(p); await p.click('#menuBtn');
  await check('closing it comes back to Replays, the game kept', new Function('r', `return !window.__ED.G.replay && ${screen('replays')} && !document.querySelector('#ingame').hidden && JSON.stringify(window.__ED.S.players.map(q => q.hand)) === r`), pos);
  await p.click('#sBack'); await check('Back to game', () => !document.querySelector('#menu').open && !!window.__ED.S && !window.__ED.G.replay);
  // from the menu to the window it opens and back (Resign, then Keep playing), and End game from the menu straight to the
  // results: the game never shows bare between two overlays (the page's cover check fails the test at once if it does)
  await p.click('#menuBtn'); await check('Menu again', () => document.querySelector('#menu').open && !document.querySelector('#ingame').hidden);
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
