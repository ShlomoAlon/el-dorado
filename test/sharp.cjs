// Sharp at rest (owner, 2026-10-05: "Sharpness problems have a zero tolerance. The only tolerance that we have for sharpness
// is while something is in motion"). Every piece of text on screen, once the page is at rest, is drawn the way the screen
// draws its sharpest text: sub-pixel (ClearType on the owner's Windows), never the plain grey smoothing Chrome falls back to
// for text in a layer of its own that isn't solid, at a fraction of a pixel, scaled, faded or about to move. Grey smoothing
// on a 1080p screen looks fuzzy and of a lower resolution (the owner's words, about the menus). The same causes (a layer
// resampled, stretched or not on whole pixels) soften pictures and edges too, so text is the probe for all of it.
// How it is measured, as the screen shows it: an edge pixel of grey-smoothed text is the background and the text's colour
// mixed in one proportion; sub-pixel text mixes each colour channel in its own proportion. Every text on screen is judged:
// the share of its edge pixels whose channels disagree. Chrome runs with sub-pixel text on (Linux has it off by default), on
// the GPU route (which layers Chrome makes is what decides it: lib.cjs), at the owner's screen (1536×639 at 125%).
// The board's picture (#stage: terrain, explorers, its labels) is not judged: it moves by design and the owner judges it fine.
// A card's text is part of its picture (rounded, shadowed, tilted in the fan: grey-smoothed): a card is judged as a picture,
// against the same card drawn plainly.
//   NODE_PATH=$(npm root -g) node test/sharp.cjs
const { chromium, serveStatic, openPage, settle, report } = require('./lib.cjs');
const zlib = require('zlib');
const T = report('sharp');
// a PNG's pixels (8-bit RGB or RGBA, not interlaced: what Chrome's screenshots are)
function pixels(buf) {
  let i = 8, w = 0, h = 0, ch = 4; const idat = [];
  while (i < buf.length) { const len = buf.readUInt32BE(i), type = buf.toString('ascii', i + 4, i + 8), d = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ch = d[9] === 6 ? 4 : 3; } else if (type === 'IDAT') idat.push(d); i += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, out = Buffer.alloc(w * h * ch);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= ch ? out[y * stride + x - ch] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= ch && y ? out[(y - 1) * stride + x - ch] : 0;
      const p = a + b - c, pr = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      out[y * stride + x] = (row[x] + [0, a, b, (a + b) >> 1, pr][f]) & 255; } }
  return { w, h, ch, out };
}
/* how sharp one text is, in a picture of the screen: r its rectangle (device pixels), fg its colour. The background is the
   rectangle's commonest colour. Returns { share, edges } (share: of its edge pixels, those mixed per channel), or null when
   it can't be judged (a background that isn't one colour, or a colour too close to it in all but one channel) */
function judge(img, r, fg) {
  const { w, h, ch, out } = img, x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y)), x1 = Math.min(w, Math.ceil(r.x + r.w)), y1 = Math.min(h, Math.ceil(r.y + r.h));
  const count = new Map(); let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * ch, k = (out[i] << 16) | (out[i + 1] << 8) | out[i + 2]; count.set(k, (count.get(k) || 0) + 1); n++; }
  if (!n) return null; let bk = 0, bn = 0; for (const [k, c] of count) if (c > bn) { bn = c; bk = k; }
  if (bn < n * .35) return null; // (no one background colour: over a picture or a gradient)
  const bg = [bk >> 16, (bk >> 8) & 255, bk & 255], chans = [0, 1, 2].filter(c => Math.abs(fg[c] - bg[c]) >= 48);
  if (chans.length < 2) return null;
  let edges = 0, mixed = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * ch, a = chans.map(c => (out[i + c] - bg[c]) / (fg[c] - bg[c])), m = a.reduce((s, v) => s + v, 0) / a.length;
    if (m < .2 || m > .8) continue; edges++; if (Math.max(...a) - Math.min(...a) > .2) mixed++; }
  return edges < 12 ? null : { share: mixed / edges, edges };
}
/* every text on screen, outside the board: its rectangle (CSS pixels), its colour, and who it is. Only text that is on top
   (nothing covers its middle) and shown (not faded) */
const texts = () => {
  const out = [], seen = new Set(), wk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), rg = document.createRange();
  for (let t = wk.nextNode(); t; t = wk.nextNode()) {
    const p = t.parentElement; if (!p || !t.data.trim() || seen.has(p) || p.closest('#stage, .card, .mcard, script, style, #diag')) continue;
    if (!p.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    rg.selectNodeContents(t); const q = rg.getBoundingClientRect(); if (q.width < 4 || q.height < 4) continue;
    if (q.right < 0 || q.bottom < 0 || q.left > innerWidth || q.top > innerHeight) continue;
    const hit = document.elementFromPoint(Math.min(innerWidth - 1, q.left + q.width / 2), Math.min(innerHeight - 1, q.top + q.height / 2));
    if (!hit || !p.contains(hit)) continue; // (covered, by a dialog or the sticky bar, or cut off by its scroller: what is on top there is not it)
    const m = getComputedStyle(p).color.match(/[\d.]+/g).map(Number); if (m.length > 3 && m[3] < 1) continue; // (see-through text: its colour isn't known)
    seen.add(p); const id = (p.id ? '#' + p.id : p.tagName.toLowerCase() + (p.classList[0] ? '.' + p.classList[0] : '')) + ((p.closest('[id]') && !p.id) ? ' in #' + p.closest('[id]').id : '');
    out.push({ who: id + ' "' + t.data.trim().slice(0, 24) + '"', x: Math.max(0, q.left), y: Math.max(0, q.top), w: Math.min(innerWidth, q.right) - Math.max(0, q.left), h: Math.min(innerHeight, q.bottom) - Math.max(0, q.top), fg: m.slice(0, 3) });
  }
  return out;
};
/* how much fine detail a picture shows: the mean step between neighbouring pixels' brightness (a picture stretched from a
   smaller one, or resampled between pixels, steps less) */
function detail(img, r) {
  const { w, ch, out } = img, L = (x, y) => { const i = (y * w + x) * ch; return .3 * out[i] + .59 * out[i + 1] + .11 * out[i + 2]; };
  let sum = 0, n = 0;
  for (let y = Math.ceil(r.y); y < Math.floor(r.y + r.h) - 1; y++) for (let x = Math.ceil(r.x); x < Math.floor(r.x + r.w) - 1; x++) { sum += Math.abs(L(x + 1, y) - L(x, y)) + Math.abs(L(x, y + 1) - L(x, y)); n++; }
  return sum / n;
}
/* a card at rest is as sharp as the same card drawn plainly: a copy of it, upright, unscaled, at whole pixels, at the size
   it shows (a picture kept for motion is stretched instead of drawn again: will-change). Compared inside its edges */
async function cardSharp(p, name, sel) {
  await settle(p); await p.waitForTimeout(250); // (at rest: a card still turning or growing is in motion)
  const r = await p.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const q = e.getBoundingClientRect(), m = new DOMMatrixReadOnly(getComputedStyle(e).transform);
    return { x: q.left, y: q.top, w: q.width, h: q.height, upright: Math.abs(m.b) < 1e-6 }; }, sel);
  if (!T.ok(name + ': on screen, upright', !!r && r.upright, sel)) return;
  const dpr = await p.evaluate(() => devicePixelRatio), inner = q => ({ x: (q.x + q.w * .1) * dpr, y: (q.y + q.h * .1) * dpr, w: q.w * .8 * dpr, h: q.h * .8 * dpr });
  const a = detail(pixels(await p.screenshot()), inner(r));
  const c = await p.evaluate(([sel, r]) => { const e = document.querySelector(sel), k = e.cloneNode(true), x = Math.round(innerWidth - r.w - 8), y = 8;
    k.id = 'sharpRef'; k.className = e.className.replace(/\bmcard\b/, '') + ' card'; Object.assign(k.style, { position: 'fixed', left: x + 'px', top: y + 'px', transform: 'none', transition: 'none', zIndex: 2147483647, width: r.w + 'px', height: r.h + 'px', margin: 0 }); k.style.setProperty('--cw', r.w + 'px');
    document.body.appendChild(k); return { x, y, w: r.w, h: r.h }; }, [sel, r]);
  await p.evaluate(() => new Promise(f => requestAnimationFrame(() => requestAnimationFrame(f))));
  const b = detail(pixels(await p.screenshot()), inner(c)); await p.evaluate(() => document.getElementById('sharpRef').remove());
  T.ok(name + ': as sharp as the card drawn plainly', a >= b * .92, `detail ${a.toFixed(2)} against ${b.toFixed(2)} (${Math.round(a / b * 100)}%)`);
}
let judged = 0;
async function screen(p, name) {
  await settle(p); await p.waitForTimeout(250);
  const list = await p.evaluate(texts), dpr = await p.evaluate(() => devicePixelRatio), img = pixels(await p.screenshot());
  const bad = []; let n = 0;
  for (const t of list) { const j = judge(img, { x: t.x * dpr, y: t.y * dpr, w: t.w * dpr, h: t.h * dpr }, t.fg); if (!j) continue; n++; if (j.share < .5) bad.push(`${t.who} ${Math.round(j.share * 100)}%`); }
  judged += n;
  T.ok(`${name}: every text is sharp (sub-pixel) at rest`, !bad.length, `${n} judged` + (bad.length ? `; grey (fuzzy): ${bad.length}: ` + bad.slice(0, 12).join(' | ') : ''));
}
(async () => {
  const srv = await serveStatic(), b = await chromium.launch({ gpu: true, args: ['--enable-lcd-text'] });
  const p = await openPage(b, 'sharp', { viewport: { width: 1229, height: 511 }, deviceScaleFactor: 1.25 });
  // the reference: text on a plain page is drawn sub-pixel here (else this machine can't tell, and the test says so)
  await p.setContent('<body style="margin:0;background:#121d19;color:#ecf1ec;font:13.5px system-ui"><p style="margin:20px">Race through the jungle to the golden city</p><p style="margin:20px;will-change:transform">Grey: a layer about to move</p></body>');
  { const list = await p.evaluate(texts), img = pixels(await p.screenshot()), j = list.map(t => judge(img, { x: t.x * 1.25, y: t.y * 1.25, w: t.w * 1.25, h: t.h * 1.25 }, t.fg));
    T.ok('the reference: a plain page\'s text is sub-pixel here, and grey smoothing is told apart', j[0] && j[0].share > .7 && j[1] && j[1].share < .1, j.map(x => x && Math.round(x.share * 100) + '%').join(', ')); }
  await p.goto(srv.url); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
  await screen(p, 'start screen');
  for (const tab of ['online', 'replays']) { await p.click(`#sMode label[data-v=${tab}]`); await screen(p, tab + ' tab'); }
  await p.click('#sMode label[data-v=local]'); await p.click('#sGo'); await p.waitForFunction(() => window.__ED.S && !document.querySelector('#menu').open);
  await screen(p, 'a game');
  // the card under the pointer
  const c = await p.evaluate(() => { const r = document.querySelector('#cards .card').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 20 }; });
  await p.mouse.move(c.x, c.y); await screen(p, 'a hand card pointed at');
  await cardSharp(p, 'the hand card pointed at', '#cards .card[style*="z-index: 90"]');
  await cardSharp(p, 'a market card', '#market .mslot .mcard');
  // paying: a card picked to pay waits in the tray beside the purchase, tilted; pointed at, it straightens as in the hand
  await p.mouse.move(600, 200); await settle(p);
  const buy = await p.evaluate(() => { const E = window.__ED, c = e => E.CT[e.dataset.k.slice(2)].cost, best = [...document.querySelectorAll('#market .mslot.can')].sort((a, b) => c(b) - c(a))[0]; return best && c(best) >= 2 ? `#market .mslot.can[data-k="${best.dataset.k}"]` : null; });
  if (T.ok('paying: the market has a card that takes more than one coin', !!buy)) {
    await p.click(buy); await settle(p);
    await p.evaluate(() => { const E = window.__ED; E.onHandCard(E.S.players[E.S.cur].hand.find(id => E.coinVal(E.S, id) === 1)); E.render(); });
    await settle(p); const q = await p.evaluate(() => { const e = document.querySelector('#cards .card.pick'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if (T.ok('paying: a card waits in the tray', !!q && await p.evaluate(() => window.__ED.UI.mode === 'pay'))) { await p.mouse.move(q.x, q.y); await cardSharp(p, 'a card in the tray, pointed at', '#cards .card.pick'); }
    await p.keyboard.press('Escape'); await p.mouse.move(600, 200); await settle(p);
  }
  await p.mouse.move(600, 200);
  await p.click('#rulesBtn'); await screen(p, 'the rules window'); await p.keyboard.press('Escape');
  await settle(p); await p.waitForTimeout(500); await p.click('#menuBtn'); await screen(p, 'the menu during a game');
  T.ok('enough text judged to mean something', judged > 60, judged + ' texts');
  T.ok('no page errors', !p.errors.length, p.errors.slice(0, 5).join(' | '));
  await b.close(); srv.close(); T.done();
})().catch(e => { console.error(e); process.exit(1); });
