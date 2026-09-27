// Zoom start latency: time from a wheel event to the first frame where the board's transform changed.
//   NODE_PATH=$(npm root -g) node test/zoomlag.cjs [index.html] [--cpu 4]
const { chromium } = require('playwright'); const path = require('path');
const args = process.argv.slice(2), file = args.find(a => a.endsWith('.html')) || path.join(__dirname, '..', 'public/index.html');
const CPU = +(args[args.indexOf('--cpu') + 1] || 4) || 4;
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const cdp = await p.context().newCDPSession(p);
  await p.goto('file://' + path.resolve(file)); await p.waitForTimeout(700); await p.click('#sGo'); await p.waitForTimeout(1500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  // on each wheel event, note its time; on each frame, note when the stage transform first differs
  await p.evaluate(() => { window.__lat = []; let pend = null, last = document.querySelector('#stage').style.transform;
    addEventListener('wheel', e => { if (!pend) pend = { t: e.timeStamp, tr: document.querySelector('#stage').style.transform }; }, { capture: true, passive: true });
    const loop = () => { const tr = document.querySelector('#stage').style.transform; if (pend && tr !== pend.tr) { window.__lat.push(performance.now() - pend.t); pend = null; } requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  await p.mouse.move(600, 450);
  const run = async (label, gap) => { await p.evaluate(() => { window.__lat.length = 0; });
    for (let k = 0; k < 8; k++) { await p.waitForTimeout(gap); await p.mouse.wheel(0, k % 2 ? 100 : -100); await p.waitForTimeout(120); }
    const l = await p.evaluate(() => window.__lat); console.log(`${label}: ${l.map(x => x.toFixed(0)).join(' ')} ms (max ${Math.max(...l).toFixed(0)})`); };
  await run('first notch after 1 s idle      ', 1000);
  await run('notch 300 ms after the previous ', 300 - 120);
  await b.close(); })();
