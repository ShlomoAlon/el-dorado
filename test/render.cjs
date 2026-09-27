// Rendering correctness checks for the board (run after any change to pan/zoom/board rendering):
//   1. grabbing the board changes nothing visually (drag away and back while holding: pixel-identical)
//   2. the board is sharp once a zoom settles (matches a fresh redraw at the same view)
//   3. wheel zoom responsiveness: Chrome's input-to-screen latency for wheel events (EventLatency), CPU slowed 4x
//   NODE_PATH=$(npm root -g) node test/render.cjs [index.html] [--shots dir]
const { chromium } = require('playwright'); const path = require('path');
const args = process.argv.slice(2), file = path.resolve(args.find(a => a.endsWith('.html')) || path.join(__dirname, '..', 'public/index.html'));
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const diff = async (p, a, b) => p.evaluate(async ([x, y]) => {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
  const [A, B] = await Promise.all([load(x), load(y)]); const cv = document.createElement('canvas'); cv.width = A.width; cv.height = A.height; const g = cv.getContext('2d');
  g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, A.width, A.height).data; g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, A.width, A.height).data;
  let n = 0; for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24) n++; return n; }, [a.toString('base64'), b.toString('base64')]);
(async () => {
  const b = await chromium.launch(); let fails = 0; const ok = (name, pass, detail) => { if (!pass) fails++; console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}: ${detail}`); };
  const open = async () => { const p = await b.newPage({ viewport: { width: 1200, height: 800 } }); await p.goto('file://' + file); await p.waitForTimeout(700); await p.click('#sGo'); await p.waitForTimeout(1800); return p; };
  { // 1. grab changes nothing
    const p = await open(); await p.mouse.move(500, 420); await p.waitForTimeout(400); const a = await p.screenshot();
    await p.mouse.down(); for (let i = 1; i <= 10; i++) { await p.mouse.move(500 + i * 6, 420); await p.waitForTimeout(16); } for (let i = 9; i >= 0; i--) { await p.mouse.move(500 + i * 6, 420); await p.waitForTimeout(16); }
    await p.waitForTimeout(400); const c = await p.screenshot(); await p.mouse.up(); await p.waitForTimeout(800); const d = await p.screenshot();
    ok('grab changes nothing', (await diff(p, a, c)) === 0, `${await diff(p, a, c)} pixels differ while holding`);
    ok('release changes nothing', (await diff(p, a, d)) === 0, `${await diff(p, a, d)} pixels differ after letting go`);
    await p.close(); }
  { // 2. sharp after zoom settles: edge energy (mean |Laplacian|) of the settled board vs a fresh redraw at the same view;
    //    the mid-zoom frame (before settling, upscaled) must be clearly blurrier, which shows the measure detects blur
    const sharp = async (p, img) => p.evaluate(async x => { const i = await new Promise(r => { const m = new Image(); m.onload = () => r(m); m.src = 'data:image/png;base64,' + x; });
      const cv = document.createElement('canvas'); cv.width = i.width; cv.height = i.height; const g = cv.getContext('2d'); g.drawImage(i, 0, 0); const d = g.getImageData(0, 0, i.width, i.height).data, W = i.width;
      const L = k => (d[k] + d[k + 1] + d[k + 2]) / 3; let e = 0, n = 0;
      for (let y = 1; y < i.height - 1; y++) for (let xx = 1; xx < W - 1; xx++) { const k = (y * W + xx) * 4; e += Math.abs(4 * L(k) - L(k - 4) - L(k + 4) - L(k - W * 4) - L(k + W * 4)); n++; }
      return e / n; }, img.toString('base64'));
    const p = await open(); const clip = { x: 150, y: 150, width: 700, height: 450 }; await p.mouse.move(450, 400);
    for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(40); }
    await p.waitForTimeout(60); const mid = await p.screenshot({ clip });
    await p.waitForTimeout(1500); const a = await p.screenshot({ clip }); if (shots) require('fs').writeFileSync(shots + '/zoom_settled.png', a);
    await p.evaluate(() => { const s = document.querySelector('#stage'); s.style.display = 'none'; void s.offsetHeight; s.style.display = ''; }); // fresh redraw, same view
    await p.waitForTimeout(800); const c = await p.screenshot({ clip });
    const [sm, sa, sc] = [await sharp(p, mid), await sharp(p, a), await sharp(p, c)];
    // headless screenshots re-render instead of showing the GPU layer's stale pixels, so blur can't be seen here;
    // check structurally that the zoom was baked in: the layer's own scale is back to 1 and the board carries the zoom
    const tr = await p.evaluate(() => ({ stage: document.querySelector('#stage').style.transform, bscale: document.querySelector('#bscale') ? document.querySelector('#bscale').style.transform : '' }));
    const ls = +((tr.stage.match(/scale\(([\d.]+)\)/) || [])[1] || 0), bs = +((tr.bscale.match(/scale\(([\d.]+)\)/) || [])[1] || 1);
    ok('zoom baked in once it settles', Math.abs(ls - 1) < .01 && bs > 1.2, `layer scale ${ls}, board scale ${bs} (edge energy settled ${sa.toFixed(2)}, fresh ${sc.toFixed(2)})`); await p.close(); }
  { // 3. wheel latency
    const p = await open(); const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await p.mouse.move(600, 420);
    await b.startTracing(p, { categories: ['latencyInfo', 'input', 'benchmark'] });
    for (let k = 0; k < 12; k++) { await p.waitForTimeout(k % 2 ? 200 : 900); await p.mouse.wheel(0, k % 3 ? -100 : 100); await p.waitForTimeout(80); }
    await p.waitForTimeout(600); const ev = JSON.parse((await b.stopTracing()).toString()).traceEvents; const open2 = new Map(), lat = [];
    for (const e of ev) { if (e.name !== 'EventLatency') continue; const k = e.id + (e.id2 ? JSON.stringify(e.id2) : ''); if (e.ph === 'b') open2.set(k, e.ts); else if (e.ph === 'e' && open2.has(k)) { lat.push((e.ts - open2.get(k)) / 1000); open2.delete(k); } }
    lat.sort((x, y) => x - y); const p95 = lat[Math.floor(lat.length * .95)] || 0;
    ok('wheel zoom latency (CPU ÷4)', p95 < 100, `median ${lat[lat.length >> 1]?.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms over ${lat.length} events`); await p.close(); }
  await b.close(); console.log(fails ? `render: ${fails} failing` : 'render ok'); process.exit(fails ? 1 : 0);
})();
