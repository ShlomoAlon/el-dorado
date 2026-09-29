// Screenshots for design decisions D2, D5, D7, D8 (one script for before / A / B, so the shots line up).
//   cd <repo on the branch to shoot> && node build.mjs && NODE_PATH=$(npm root -g) node <this file> <tag> <outdir> [D2,D5,D7,D8]
// tag: before | A | B. Each shot is named D<n>-<tag>-<state>-<1440|390>.png (close-ups: -1440@2x).
const path = require('path'), fs = require('fs');
const { chromium, serveStatic, settle } = require(path.join(process.cwd(), 'test/lib.cjs'));
const [tag, out, which = 'D2,D5,D7,D8'] = process.argv.slice(2);
const want = new Set(which.split(','));
const log = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test/fixtures/replay.json'), 'utf8'));
fs.mkdirSync(out, { recursive: true });

// the same deal every time: Math.random is a seeded generator
const SEED = () => { let a = 20260929; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

async function page(b, w, h, dsf = 1) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
  await ctx.addInitScript(SEED);
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message));
  return p;
}
const idle = async p => { await p.waitForFunction(() => !window.__ED.UI.anim, null, { timeout: 10000 }).catch(() => {}); await settle(p); await p.waitForTimeout(150); await settle(p); };
async function open(p, url) { await p.goto(url); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open); await p.evaluate(() => document.fonts.ready); await settle(p); }
async function start(p, n = 3) {
  if (n !== 3) await p.click(`#sN label[data-v="${n}"]`);
  await p.click('#sGo'); await p.waitForFunction(() => window.__ED.S && !window.__ED.UI.preview && !document.querySelector('#menu').open);
  await idle(p);
}
// one turn for the player up: play up to k cards, each onto its farthest reachable space, then end the turn (keeping nothing)
async function turn(p, k = 2) {
  for (let i = 0; i < k; i++) {
    const moved = await p.evaluate(() => { const E = window.__ED, S = E.S, pl = S.players[S.cur];
      for (const id of pl.hand) { E.onHandCard(id); const ks = [...E.UI.targets.entries()].filter(([, t]) => t.t === 'move').map(([k]) => k);
        if (ks.length) { ks.sort((a, b) => { const [ax, ay] = a.split(',').map(Number), [bx, by] = b.split(',').map(Number); return (bx + by / 2) - (ax + ay / 2); }); E.doMove(ks[0]); return true; }
        E.cancelMode(); }
      return false; });
    await idle(p); if (!moved) break;
  }
  await p.evaluate(() => { const E = window.__ED; E.cancelMode(); E.startEndTurn(); if (E.UI.mode === 'buyWarn') E.startEndTurn(); E.finishTurn(); });
  await idle(p);
}
async function shot(p, name, clip) {
  const f = path.join(out, name + '.png');
  if (clip) { const r = await p.evaluate(({ sel, pad }) => { const els = [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length); let L = 1e9, T = 1e9, R = -1e9, B = -1e9;
      for (const e of els) { const q = e.getBoundingClientRect(); L = Math.min(L, q.left); T = Math.min(T, q.top); R = Math.max(R, q.right); B = Math.max(B, q.bottom); }
      L = Math.max(0, L - pad); T = Math.max(0, T - pad); R = Math.min(innerWidth, R + pad); B = Math.min(innerHeight, B + pad); return { x: L, y: T, width: R - L, height: B - T }; }, clip);
    await p.screenshot({ path: f, clip: r }); }
  else await p.screenshot({ path: f });
  console.log('shot', name, p.errs.length ? 'ERRORS: ' + p.errs.join(' | ') : '');
}
const N = (d, st, size) => `${d}-${tag}-${st}-${size}`;

(async () => {
  const b = await chromium.launch(), srv = await serveStatic(), url = srv.url;
  for (const [w, h, sz] of [[1440, 900, '1440'], [390, 844, '390']]) {
    // start screen
    if (want.has('D2') || want.has('D8')) { const p = await page(b, w, h); await open(p, url);
      for (const d of ['D2', 'D8']) if (want.has(d)) await shot(p, N(d, 'start', sz)); await p.context().close(); }
    // a game in mid-play (six turns: two rounds), the History panel expanded, the Menu during the game
    if (want.has('D2') || want.has('D8')) { const p = await page(b, w, h); await open(p, url); await start(p);
      for (let t = 0; t < 6; t++) await turn(p, 2);
      await p.evaluate(() => { const E = window.__ED, id = E.S.players[E.S.cur].hand[0]; E.onHandCard(id); }); await idle(p);
      for (const d of ['D2', 'D8']) if (want.has(d)) await shot(p, N(d, 'game', sz));
      if (want.has('D2')) {
        await p.evaluate(() => window.__ED.cancelMode()); await idle(p);
        const r = await p.locator('#histSize').boundingBox(); await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await p.mouse.down();
        await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2 + h * .38, { steps: 8 }); await p.mouse.up(); await idle(p);
        await shot(p, N('D2', 'history', sz));
        await p.click('#menuBtn'); await idle(p); await shot(p, N('D2', 'menu', sz));
      }
      await p.context().close(); }
    // D7: four players, everyone has moved; the chips; the setup's colour choice
    if (want.has('D7')) { const p = await page(b, w, h); await open(p, url);
      await p.click('#sN label[data-v="4"]'); await settle(p);
      await shot(p, N('D7', 'setup', sz));
      await start(p, 4); for (let t = 0; t < 4; t++) await turn(p, 1);
      await shot(p, N('D7', 'board4', sz));
      await p.context().close(); }
  }
  // close-ups (1440, 2×)
  if (want.has('D5') || want.has('D7')) { const p = await page(b, 1440, 900, 2); await open(p, url);
    if (want.has('D7')) { await p.click('#sN label[data-v="4"]'); await settle(p); await shot(p, N('D7', 'setup-colours', '1440@2x'), { sel: '#seats', pad: 12 }); }
    await start(p, want.has('D7') ? 4 : 3); for (let t = 0; t < 4; t++) await turn(p, 1);
    if (want.has('D7')) { await shot(p, N('D7', 'chips', '1440@2x'), { sel: '#players', pad: 10 }); await shot(p, N('D7', 'explorers', '1440@2x'), { sel: '#pieces .pin', pad: 70 }); }
    if (want.has('D5')) {
      await shot(p, N('D5', 'zoom', '1440@2x'), { sel: '.zoomctl', pad: 12 });
      await shot(p, N('D5', 'hud', '1440@2x'), { sel: '#hud .hbtns', pad: 10 });
      await p.evaluate(l => window.__ED.openReplay(l, null), log); await p.waitForFunction(() => window.__ED.G.replay); await idle(p);
      await p.evaluate(() => { const r = document.querySelector('#rbR'); r.value = Math.floor(r.max * .4); r.dispatchEvent(new Event('input')); }); await idle(p);
      await shot(p, N('D5', 'replay', '1440@2x'), { sel: '#rdock', pad: 0 });
    }
    await p.context().close(); }
  // D5 at phone size: the replay dock and the corner buttons in their real place
  if (want.has('D5')) { const p = await page(b, 390, 844, 2); await open(p, url); await start(p);
    await shot(p, N('D5', 'zoom', '390@2x'), { sel: '.zoomctl, #hud', pad: 8 });
    await p.evaluate(l => window.__ED.openReplay(l, null), log); await p.waitForFunction(() => window.__ED.G.replay); await idle(p);
    await shot(p, N('D5', 'replay', '390@2x'), { sel: '#rdock', pad: 0 });
    await p.context().close(); }
  await b.close(); srv.close();
})();
