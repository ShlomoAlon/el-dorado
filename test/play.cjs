// Played games: whole games through the real page, the person's seat played by an AI that chooses each move and then
// makes it the way a person does (the same calls a tap or a drag makes: pick the card, the explorer, the space; pick a
// market stack, then the cards that pay; End turn, then the reminder, then the cards to keep). The point is coverage:
// every state a game passes through is drawn, with every assertion on (layout shifts, rebuilds, the view's checks),
// including states no scripted test reaches (moving on with a card's leftover strength, the buy reminder, keeping
// cards, removal cards, the Transmitter, base camps, game over). Animations run 20x faster (they still run).
//   NODE_PATH=$(npm root -g) node test/play.cjs [--games n]
const { chromium, serveStatic, openPage, settle, report } = require('./lib.cjs');
const { step } = require('./playstep.cjs');
const T = report('play');
const arg = process.argv.slice(2), GAMES = +(arg[arg.indexOf('--games') + 1] || 0) || 3;
// the sizes the games are played at: the owner's screen, a phone, a tablet
const SIZES = [['owner', { width: 1536, height: 639 }, 1.25], ['phone', { width: 390, height: 844 }, 2], ['tablet', { width: 768, height: 1024 }, 1]];
// and one game passed around one device: two people (both played here) and an AI, hands hidden until each one's Reveal
const PASS = ['pass-and-play', { width: 1536, height: 639 }, 1.25, true];


(async () => {
  const srv = await serveStatic(), b = await chromium.launch(), t0 = Date.now();
  const games = [...Array.from({ length: GAMES }, (_, g) => SIZES[g % SIZES.length]), PASS];
  const results = await Promise.all(games.map(async ([name, viewport, dpr, pass], g) => {
    const p = await openPage(b, `game ${g + 1} (${name})`, { viewport, deviceScaleFactor: dpr });
    const cdp = await p.context().newCDPSession(p); await cdp.send('Animation.enable'); await cdp.send('Animation.setPlaybackRate', { playbackRate: 20 });
    await p.goto(srv.url); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
    // (what the page shows if its start screen can't be used: a rare timeout under load, not yet explained)
    const pageState = () => p.evaluate(() => { const d = document.querySelector('#menu'), g = document.querySelector('#sGo'), r = g && g.getBoundingClientRect(), sec = g && g.closest('section');
      return JSON.stringify({ open: d.open, modal: d.matches(':modal'), cls: d.className, html: document.documentElement.className, screen: sec && sec.dataset.screen, secHidden: sec && sec.hidden, rect: r && [r.x, r.y, r.width, r.height].map(Math.round), disp: getComputedStyle(d).display, scripts: [...document.scripts].map(x => x.src.split('/').pop() || 'inline'), ed: !!window.__ED, S: !!(window.__ED && window.__ED.S), seats: document.querySelectorAll('#seats .seat:not([hidden])').length }); });
    try {
      await p.selectOption('select[name=who1]', pass ? '' : 'raleigh', { timeout: 20000 }); await p.selectOption('select[name=who2]', 'raleigh', { timeout: 20000 });
      if (pass) await p.check('#sPriv');
      await p.click('#sGo', { timeout: 20000 });
    } catch (e) { throw new Error(e.message.split('\n')[0] + ' — page: ' + await pageState()); }
    await p.waitForFunction(() => window.__ED.S && !window.__ED.UI.preview && !document.querySelector('#menu').open);
    await p.evaluate(() => window.__ED.aiPace(.05)); // (the AIs' pauses, 20x shorter: their moves and animations unchanged)
    const did = {}, unmapped = []; let steps = 0;
    // (every other step goes on while an explorer is still walking, as a quick player does: animations never hold up input)
    const ready = quick => p.waitForFunction(q => { const E = window.__ED; return E.S.over || (E.canAct() && (q || !E.walking()) && E.UI.mode !== 'pay' && E.UI.mode !== 'discardFor'); }, quick, { timeout: 60000 });
    try {
      for (; steps < 1500; steps++) {
        if (steps % 2) { await ready(true); if (await p.evaluate(() => window.__ED.walking())) did['during a walk'] = (did['during a walk'] || 0) + 1; }
        else { await ready(false); await settle(p); await p.evaluate(() => window.__ED.fitCheck(true)); } // (the board check at every settled step, not only when its samples happen to see one)
        if (await p.evaluate(() => window.__ED.S.over)) break;
        const r = await p.evaluate(step); const k = r.split(':')[0]; did[k] = (did[k] || 0) + 1; if (r.startsWith('unmapped')) { unmapped.push(r); break; }
      }
    } catch (e) { unmapped.push('stopped: ' + e.message.split('\n')[0]); }
    const over = await p.evaluate(() => !!window.__ED.S.over), round = await p.evaluate(() => window.__ED.S.round);
    const seen = await p.evaluate(() => window.__seen ? { modes: Object.keys(window.__seen.modes), labels: Object.keys(window.__seen.labels) } : { modes: [], labels: [] });
    await p.close();
    return { name, g, over, round, steps, did, modes: seen.modes, labels: seen.labels, unmapped, errors: p.errors };
  }));
  for (const r of results) {
    T.ok(`game ${r.g + 1} (${r.name}): played to the end through the UI`, r.over && !r.unmapped.length, `${r.steps} moves of the person's, round ${r.round}${r.unmapped.length ? '; ' + r.unmapped.join('; ') : ''}`);
    T.ok(`game ${r.g + 1} (${r.name}): no assertion failed, no page error`, !r.errors.length, r.errors.slice(0, 3).join(' | '));
    console.log(`     did: ${JSON.stringify(r.did)}\n     modes: ${r.modes.join(', ')}\n     buttons: ${r.labels.join(', ')}`);
  }
  console.log(`     ${GAMES} games in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  await b.close(); srv.close && srv.close(); T.done();
})();
