// Rendering correctness checks for the board (run after any change to pan/zoom/board rendering):
//   1. grabbing the board changes nothing visually (drag away and back while holding: pixel-identical)
//   2. the zoom is baked in once it settles (layer scale back to 1, #bscale carries the zoom); edge energy printed as info only
//   3. wheel zoom responsiveness: Chrome's input-to-screen latency for wheel events (EventLatency), CPU slowed 4x
//   NODE_PATH=$(npm root -g) node test/render.cjs [index.html] [--shots dir]
const { chromium, openPage } = require('./lib.cjs'); const path = require('path');
const args = process.argv.slice(2), file = path.resolve(args.find(a => a.endsWith('.html')) || path.join(__dirname, '..', 'public/index.html'));
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const diff = async (p, a, b) => p.evaluate(async ([x, y]) => {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
  const [A, B] = await Promise.all([load(x), load(y)]); const cv = document.createElement('canvas'); cv.width = A.width; cv.height = A.height; const g = cv.getContext('2d');
  g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, A.width, A.height).data; g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, A.width, A.height).data;
  let n = 0; for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24) n++; return n; }, [a.toString('base64'), b.toString('base64')]);
(async () => {
  const b = await chromium.launch(); let fails = 0; const ok = (name, pass, detail) => { if (!pass) fails++; console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}: ${detail}`); };
  const errs = [], open = async () => { const p = await openPage(b, 'render', { viewport: { width: 1200, height: 800 } }); errs.push(p.errors); await p.goto('file://' + file); await p.waitForTimeout(700); await p.click('#sGo'); await p.waitForTimeout(1800); return p; };
  { // 1. grab changes nothing
    const p = await open(); await p.mouse.move(500, 420); await p.waitForTimeout(400); const a = await p.screenshot();
    await p.mouse.down(); for (let i = 1; i <= 10; i++) { await p.mouse.move(500 + i * 6, 420); await p.waitForTimeout(16); } for (let i = 9; i >= 0; i--) { await p.mouse.move(500 + i * 6, 420); await p.waitForTimeout(16); }
    await p.waitForTimeout(400); const c = await p.screenshot(); await p.mouse.up(); await p.waitForTimeout(800); const d = await p.screenshot();
    ok('grab changes nothing', (await diff(p, a, c)) === 0, `${await diff(p, a, c)} pixels differ while holding`);
    ok('release changes nothing', (await diff(p, a, d)) === 0, `${await diff(p, a, d)} pixels differ after letting go`);
    await p.close(); }
  { // 2. zoom baked in once it settles; edge energy (mean |Laplacian|) of mid-zoom, settled and freshly redrawn board printed as info
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
    const tr = await p.evaluate(() => { const b = document.querySelector('#bscale'); return { stage: document.querySelector('#stage').style.transform, bscale: b ? b.style.transform : null }; });
    const info = `edge energy mid-zoom ${sm.toFixed(2)}, settled ${sa.toFixed(2)}, fresh ${sc.toFixed(2)}`;
    if (tr.bscale === null) console.log(`n/a  zoom baked in once it settles: no #bscale in this build (${info})`);
    else { const ls = +((tr.stage.match(/scale\(([\d.]+)\)/) || [])[1] || 1), bs = +((tr.bscale.match(/scale\(([\d.]+)\)/) || [])[1] || 1);
      ok('zoom baked in once it settles', Math.abs(ls - 1) <= .01 && bs > 1.2, `layer scale ${ls}, board scale ${bs} (${info})`); }
    await p.close(); }
  { // 2b. drawn at the zoom's resolution: after zooming to the most and settling, the board's layers have tiles drawn at the
    // resolution that zoom needs: every layer Chrome draws, whoever made it (Chrome makes layers of its own: the labels and
    // overlays above the baked terrain stayed soft, 2026-10-04; the terrain itself is baked pixels, its density checked by the
    // page at every rest: camera.js), read from Chrome's own trace (tiles below it are an enlarged, soft picture; a will-change
    // hint kept on at rest held them at the first zoom's: a third of the detail at the most, 2026-10-04). Screenshots can't
    // see this: headless Chrome draws the board afresh for them
    const p = await open(); await p.mouse.move(450, 400); for (let i = 0; i < 30; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(30); } await p.waitForTimeout(1500);
    const tr = require('path').join(require('os').tmpdir(), 'rz-' + process.pid + '.json');
    await b.startTracing(p, { path: tr, categories: ['disabled-by-default-cc.debug'] }); await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await p.waitForTimeout(300); await b.stopTracing();
    const ev = JSON.parse(require('fs').readFileSync(tr, 'utf8')); require('fs').unlinkSync(tr); const L = Array.isArray(ev) ? ev : ev.traceEvents;
    const snaps = L.filter(e => e.ph === 'O' && /LayerTreeHostImpl/.test(e.name) && e.args && e.args.snapshot), out = [];
    const walk = (o, d) => { if (!o || typeof o !== 'object' || d > 14) return; if (o.tilings && o.tilings.length && o.layer_name !== undefined) out.push([(o.layer_name || '?').replace(/^.*?((id|class)='[^']+').*$/, '$1'), Math.max(...o.tilings.map(t => +t.content_scale || 0)) / (+o.ideal_contents_scale || 1)]); for (const k in o) walk(o[k], d + 1); };
    walk(snaps.length && snaps[snaps.length - 1].args.snapshot, 0);
    ok('zoomed in fully, the board is drawn at the resolution it needs', out.some(([n]) => /pieces/.test(n)) && out.every(([, r]) => r >= .95), (out.filter(([, r]) => r < .95).map(([n, r]) => `soft: ${n} ${(100 * r).toFixed(0)}%`).join(', ') || `all ${out.length} layers at 95% or more`));
    await p.close(); }
  { // 2c. frames the screen misses while zooming the way the owner does: bursts of wheel notches with short pauses, zooming
    // again just as the last zoom's repaint starts (the settle comes at 250 ms), in and out, at his laptop's size. Counted from
    // Chrome's own frame records (DroppedFrame: the frames DevTools marks dropped), which see the painting and the screen's
    // drawing, not only the page's thread: the page-thread measures saw none of the hitches he felt (2026-10-04). (At 4K this
    // machine, with no GPU, misses frames drawing the screen alone, so 4K is judged on his)
    const p = await openPage(b, 'render', { viewport: { width: 1536, height: 639 }, deviceScaleFactor: 1.25 }); errs.push(p.errors);
    await p.goto('file://' + file); await p.waitForTimeout(700); await p.click('#sGo'); await p.waitForTimeout(2500); await p.mouse.move(690, 290); await p.waitForTimeout(300);
    const tr = require('path').join(require('os').tmpdir(), 'rd-' + process.pid + '.json');
    await b.startTracing(p, { path: tr, categories: ['disabled-by-default-devtools.timeline.frame'] });
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let burst = 0; burst < 16; burst++) { const dir = burst % 4 < 2 ? -1 : 1;
      for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, dir * 120); await p.waitForTimeout(25 + rnd() * 25); } await p.waitForTimeout(300 + rnd() * 150); }
    await p.waitForTimeout(800); await b.stopTracing();
    const ev = JSON.parse(require('fs').readFileSync(tr, 'utf8')); require('fs').unlinkSync(tr); const L = Array.isArray(ev) ? ev : ev.traceEvents;
    const all = L.filter(e => e.name === 'BeginFrame').length, drop = L.filter(e => e.name === 'DroppedFrame').length, pc = 100 * drop / Math.max(1, all);
    // (1.8%: the terrain drawn again in regions, one a frame, misses 1.2-1.4%; the whole board at once missed 2.1-2.6%)
    ok('zooming in bursts misses few frames', all > 200 && pc <= 1.8, `${drop} of ${all} frames dropped (${pc.toFixed(1)}%)`);
    await p.close(); }
  { // 2d. a zoom, then the board moved before every layer was drawn again at the new zoom (a small pan right after the zoom
    // settles, as the owner does; the camera's own follow glide does the same): once it rests, nothing may stay a stretched
    // picture (the explorers stayed soft until the next zoom, 2026-10-04). The page's rest check states it; this reaches it
    const p = await open(); await p.mouse.move(600, 400); for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(30); }
    await p.waitForTimeout(275); await p.mouse.down(); await p.mouse.move(620, 410, { steps: 3 }); await p.mouse.up(); await p.waitForTimeout(1500);
    ok('a pan right after a zoom: every layer drawn at the zoom shown once at rest', !p.errors.length, p.errors.join(' | ').slice(0, 200) || 'none waiting'); await p.close(); }
  { // 3. wheel latency
    const p = await open(); const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await p.mouse.move(600, 420);
    await b.startTracing(p, { categories: ['latencyInfo', 'input', 'benchmark'] });
    for (let k = 0; k < 12; k++) { await p.waitForTimeout(k % 2 ? 200 : 900); await p.mouse.wheel(0, k % 3 ? -100 : 100); await p.waitForTimeout(80); }
    await p.waitForTimeout(600); const ev = JSON.parse((await b.stopTracing()).toString()).traceEvents; const open2 = new Map(), lat = [];
    for (const e of ev) { if (e.name !== 'EventLatency') continue; const k = e.id + (e.id2 ? JSON.stringify(e.id2) : ''); if (e.ph === 'b') open2.set(k, e.ts); else if (e.ph === 'e' && open2.has(k)) { lat.push((e.ts - open2.get(k)) / 1000); open2.delete(k); } }
    lat.sort((x, y) => x - y); const p95 = lat[Math.floor(lat.length * .95)] || 0;
    // the median is what's checked: over 24 events the slowest few swing between ~90 and ~240 ms from run to run, in old builds too
    const med = lat[lat.length >> 1] || 0; ok('wheel zoom latency (CPU ÷4)', med < 70, `median ${med.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms over ${lat.length} events`); await p.close(); }
  const all = errs.flat(); ok('no page errors (assertions included)', !all.length, all.slice(0, 3).join(' | ') || 'none');
  await b.close(); console.log(fails ? `render: ${fails} failing` : 'render ok'); process.exit(fails ? 1 : 0);
})();
