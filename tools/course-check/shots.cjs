// Renders single boards (rotation 0, as in the catalogue images) and whole courses from the built page, for the
// side-by-side checks made by compose.py.
//   NODE_PATH=$(npm root -g) node tools/course-check/shots.cjs <outdir> tiles=F,G courses=winding
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = process.argv[2], args = Object.fromEntries(process.argv.slice(3).map(a => a.split('=')));
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await p.goto('file://' + path.resolve(__dirname, '../../public/index.html')); await p.waitForTimeout(800);
  await p.addStyleTag({ content: '#app>:not(#vp),#overlay{display:none!important}' });
  // tile < 0: the whole course; otherwise just that board (index in the route)
  const shoot = async (C, tile, file) => {
    await p.evaluate(C => { __ED.showCourse(C, 1); }, C);
    await p.waitForTimeout(900); // let the fit settle
    const box = await p.evaluate(([C, tile]) => {
      const M = __ED.MAP, Y = __ED.layout(), m = document.querySelector('#board').getScreenCTM();
      const pts = tile < 0 ? [[Y.minX, Y.minY], [Y.minX + Y.w, Y.minY + Y.h]]
        : [...M.hexes.values()].filter(h => h.tile === tile).flatMap(h => { const { x, y } = Y.pos.get(h.k); return [[x - 34, y - 34], [x + 34, y + 34]]; });
      const s = pts.map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
      const xs = s.map(v => v[0]), ys = s.map(v => v[1]);
      return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    }, [C, tile]);
    await p.waitForTimeout(500);
    await p.screenshot({ path: file, clip: box });
  };
  for (const L of (args.tiles || '').split(',').filter(Boolean)) {
    // a throwaway two-board route: the board alone, unrotated (a start board goes first, a terrain board second)
    const start = L === 'A' || L === 'B';
    const C = await p.evaluate(([L, start]) => {
      for (let q = -12; q <= 12; q++) for (let r = -12; r <= 12; r++) {
        const C = { id: 'tile', name: 'tile', p: start ? [[L, 0, 0, 0], ['C', 7, -3, 0]] : [['B', -7, 3, 0], [L, 0, 0, 0]], e: [q, r], s: 'j' };
        try { __ED.showCourse(C, 1); return C; } catch (e) { /* expected: this random layout doesn't fit: try the next */ }
      }
    }, [L, start]);
    await shoot(C, start ? 0 : 1, `${out}/game-${L}.png`);
  }
  for (const id of (args.courses || '').split(',').filter(Boolean)) {
    await shoot(id, -1, `${out}/course-${id}.png`);
  }
  if (errs.length) { console.error(errs); process.exit(1); }
  await b.close();
})();
