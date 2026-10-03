// Taps and hover on the board find the space from the board's geometry (as card drags do), not from which element is on
// top. The case from the 2026-09-30 playtest: an explorer's figure stands up into the space above its own, so a tap in
// that space (a highlighted target) used to land on the figure and do nothing.
// Checks: a tap on a target a figure covers moves there; hovering it lights it; a tap on my explorer's space reaches it.
//   NODE_PATH=$(npm root -g) node test/taps.cjs
const { chromium, serveStatic, openPage, settle, report } = require('./lib.cjs');
const T = report('taps');
(async () => {
  // the owner's window (1536×639 at 125%): the default fit where the tester met it
  const srv = await serveStatic(), b = await chromium.launch(), p = await openPage(b, 'taps', { viewport: { width: 1536, height: 639 }, deviceScaleFactor: 1.25 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  // a deal where the person moves first; then another player's explorer is put just below a space my card can reach
  let setup = null;
  for (let tries = 0; tries < 20 && !setup; tries++) {
    if (tries) await p.evaluate(() => localStorage.clear()); // (else the page resumes the saved game)
    await p.goto(srv.url); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
    await p.click('#sGo'); await p.waitForFunction(() => window.__ED.S && !window.__ED.UI.preview); await settle(p);
    if (await p.evaluate(() => window.__ED.S.players[window.__ED.S.cur].ai)) continue;
    setup = await p.evaluate(() => { const E = window.__ED, S = E.S, other = (S.cur + 1) % S.players.length;
      for (const id of S.players[S.cur].hand) { E.onHandCard(id); E.render();
        for (const [k, t] of [...E.targets()]) { if (k[0] === 'B' || t.kind !== 'move') continue;
          const [q, r] = k.split(',').map(Number);
          for (const below of [`${q},${r + 1}`, `${q - 1},${r + 1}`]) { const h = E.MAP.hexes.get(below);
            if (!h || h.type === 'm' || S.players.some(pl => pl.pieces.includes(below))) continue;
            S.players[other].pieces[0] = below; E.render();
            if (!E.targets().has(k)) { E.onHandCard(id); E.render(); }
            if (E.targets().has(k)) return { k, below }; } }
        E.cancelMode(); E.render(); }
      return null; });
  }
  T.ok('a target with an explorer just below it', !!setup);
  if (setup) {
    await p.waitForFunction(() => !window.__ED.walking(), null, { timeout: 10000 }); await settle(p);
    // just below the target's centre: inside the space, and inside the figure's box that stands up into it
    const pt = await p.evaluate(k => { const r = document.querySelector(`#board2 .tgt[data-t="${k}"] polygon`).getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2 + 4;
      return { x, y, covered: [...document.querySelectorAll('.pin')].some(e => { const q = e.getBoundingClientRect(); return x > q.left && x < q.right && y > q.top && y < q.bottom; }) }; }, setup.k);
    T.ok('the figure stands over the tap point', pt.covered);
    await p.mouse.move(pt.x, pt.y);
    T.ok('hover lights the covered target', await p.waitForFunction(k => !!document.querySelector(`#board2 .tgt.hot[data-t="${k}"]`), setup.k, { timeout: 3000 }).then(() => true, () => false));
    const before = await p.evaluate(() => JSON.stringify(window.__ED.S.players[window.__ED.S.cur].pieces));
    await p.mouse.click(pt.x, pt.y);
    T.ok('a tap on it moves there', await p.waitForFunction(b => JSON.stringify(window.__ED.S.players[window.__ED.S.cur].pieces) !== b, before, { timeout: 4000 }).then(() => true, () => false));
    // a tap on my explorer's own space (found the same way) reaches it: with a card chosen for it, the card is put down
    await p.waitForFunction(() => !window.__ED.walking(), null, { timeout: 10000 }); await settle(p);
    const sel = await p.evaluate(() => { const E = window.__ED, P = E.S.players[E.S.cur]; E.cancelMode(); E.render();
      for (const id of P.hand) { E.onHandCard(id); E.render(); if (E.UI.mode === 'card' && P.pieces[E.UI.piece] !== 'done') return { k: P.pieces[E.UI.piece] }; E.cancelMode(); E.render(); }
      return null; });
    T.ok('a card chosen for my explorer', !!sel);
    if (sel) {
      await settle(p);
      // (the space's centre on screen, through the board SVG's own transform), a little below: clear of the figure's box above
      const c = await p.evaluate(k => { const h = window.__ED.layout().pos.get(k), svg = document.querySelector('#board'), q = svg.createSVGPoint();
        q.x = h.x; q.y = h.y; const s = q.matrixTransform(svg.getScreenCTM()); return { x: s.x, y: s.y + 6 }; }, sel.k);
      await p.mouse.click(c.x, c.y);
      T.ok('a tap on my explorer reaches it (the card is put down)', await p.waitForFunction(() => window.__ED.UI.mode !== 'card', null, { timeout: 3000 }).then(() => true, () => false));
    }
  }
  // the market: a card under the pointer grows to be read; moving onto the next card's place reaches that card at once, even
  // where the grown one covers it (the page's check fails otherwise: the card underneath has priority)
  { await p.keyboard.press('Escape'); await settle(p);
    const slots = await p.evaluate(() => [...document.querySelectorAll('#market .mslot')].map(e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; }));
    // (a pair side by side: the right one grows to the left over its neighbour)
    const k = slots.findIndex((s, i) => i > 0 && Math.abs(s.y - slots[i - 1].y) < 2 && s.x > slots[i - 1].x);
    T.ok('two market cards side by side', k > 0);
    if (k > 0) { await p.mouse.move(slots[k].x, slots[k].y, { steps: 4 }); await p.waitForTimeout(400);
      await p.mouse.move(slots[k - 1].x + slots[k - 1].w * .3, slots[k - 1].y, { steps: 6 }); await p.waitForTimeout(400);
      T.ok('moving onto the next market card reaches it', await p.evaluate(i => document.querySelectorAll('#market .mslot')[i].matches(':hover'), k - 1)); } }
  // the hand: a card under the pointer rises and its neighbours step aside; moving onto where the next card rests reaches it
  { await p.mouse.move(5, 5); await p.keyboard.press('Escape'); await settle(p);
    const rest = await p.evaluate(() => [...document.querySelectorAll('#cards .card')].filter(e => e.__rest).map(e => e.__rest).sort((a, b) => a.l - b.l));
    T.ok('a hand of two cards or more', rest.length > 1);
    if (rest.length > 1) { const a = rest[0], b2 = rest[1];
      await p.mouse.move(a.l + a.w * .3, a.t + a.h * .6, { steps: 4 }); await settle(p);
      await p.mouse.move(b2.l + b2.w * .6, b2.t + b2.h * .6, { steps: 6 }); await settle(p);
      T.ok('moving onto the next hand card reaches it', await p.evaluate(() => !!window.__ED.UI.hover)); } }
  // the All cards spread: a card hovered just above its lower edge (it lifts a little) stays the one under the pointer
  { await p.mouse.move(5, 5); await p.click('#allTile'); await settle(p);
    const r = await p.evaluate(() => { const e = document.querySelector('#allMarket .mslot'); if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.bottom - 2 }; });
    T.ok('the All cards spread open', !!r);
    if (r) { await p.mouse.move(r.x, r.y - 30, { steps: 3 }); await p.mouse.move(r.x, r.y, { steps: 4 }); await settle(p); await p.mouse.move(r.x + 2, r.y, { steps: 2 }); await settle(p); }
    await p.keyboard.press('Escape'); await settle(p); }
  T.ok('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); srv.close(); T.done();
})();
