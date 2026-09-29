// The menus as a person uses them, on this device (no server): the start screen's three tabs (This device / Online /
// Replays) and no extra Back or Replays buttons; a replay opened from Replays comes back to Replays when closed; during a
// game the menu shows the game bar, and watching a replay from there keeps the game; the results at the end of a game.
// (Online menus, the room lobby and signing out: test/online.cjs.)
//   NODE_PATH=$(npm root -g) node test/menus.cjs
const { chromium, serveStatic, openPage, settle, report } = require('./lib.cjs');
const path = require('path');
const T = report('menus'), LOG = path.join(__dirname, 'fixtures/replay.json');
(async () => {
  const srv = await serveStatic(), b = await chromium.launch(), p = await openPage(b, 'menus');
  const until = (f, a, ms = 8000) => p.waitForFunction(f, a, { timeout: ms }).then(() => true, () => false);
  const check = async (name, f, a, ms) => T.ok(name, await until(f, a, ms));
  const screen = s => `!document.querySelector('section[data-screen="${s}"]').hidden`;
  await p.goto(srv.url); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
  await check('start screen: three tabs, no Back or Replays buttons', () => document.querySelectorAll('#sMode label').length === 3 && !document.querySelector('[data-go]') && !document.querySelector('#sReplays'));
  await p.click('#sMode label[data-v="online"]');
  await check('Online tab (this copy can\'t reach the server, and says so)', new Function(`return ${screen('online')} && !document.querySelector('#oOff').hidden`));
  await p.click('#sMode label[data-v="replays"]');
  await check('Replays tab', new Function(`return ${screen('replays')}`));
  // a game log picked from a file opens as a replay; closing it comes back to Replays
  await p.setInputFiles('#rFile', LOG);
  await check('a picked game log opens as a replay', () => !!window.__ED.G.replay && !document.querySelector('#menu').open);
  await settle(p); await p.click('#menuBtn');
  await check('closing it comes back to Replays', new Function(`return !window.__ED.G.replay && document.querySelector('#menu').open && ${screen('replays')} && document.querySelector('input[name=mode][value=replays]').checked`));
  // a game: the menu over it has the game bar; a replay watched from there keeps the game
  await p.click('#sMode label[data-v="local"]'); await check('This device tab', new Function(`return ${screen('setup')}`));
  await p.click('#sGo'); await check('the game starts', () => !!window.__ED.S && !window.__ED.UI.preview && !document.querySelector('#menu').open);
  await settle(p);
  const pos = await p.evaluate(() => JSON.stringify(window.__ED.S.players.map(q => q.hand)));
  await p.click('#menuBtn'); await check('Menu during a game: the game bar and the tabs', () => document.querySelector('#menu').open && !document.querySelector('#ingame').hidden && !document.querySelector('#sMode').hidden);
  await p.click('#sMode label[data-v="replays"]'); await p.setInputFiles('#rFile', LOG);
  await check('a replay during a game', () => !!window.__ED.G.replay);
  await settle(p); await p.click('#menuBtn');
  await check('closing it comes back to Replays, the game kept', new Function('r', `return !window.__ED.G.replay && ${screen('replays')} && !document.querySelector('#ingame').hidden && JSON.stringify(window.__ED.S.players.map(q => q.hand)) === r`), pos);
  await p.click('#sBack'); await check('Back to game', () => !document.querySelector('#menu').open && !!window.__ED.S && !window.__ED.G.replay);
  // the end of a game: two resign, the third wins, the results come up; New game goes back to the start screen
  await p.evaluate(() => { __ED.act({ t: 'resign' }); }); await p.evaluate(() => { __ED.act({ t: 'resign' }); });
  await check('game over: the results', () => window.__ED.S.over && !!document.querySelector('#overlay #gNew') && document.querySelectorAll('#overlay .prow').length === 3);
  await p.click('#overlay #gNew'); await check('New game: the start screen', new Function(`return document.querySelector('#menu').open && ${screen('setup')}`));
  T.ok('no page errors', !p.errors.length, p.errors.slice(0, 5).join(' | '));
  await b.close(); srv.close(); T.done();
})().catch(e => { console.error(e); process.exit(1); });
