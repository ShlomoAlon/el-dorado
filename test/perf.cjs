// Interaction performance: board drag-pan, wheel zoom and a card drag, with the CPU throttled (default 4x).
// Reports frame times (mean, p95, frames over 25 ms) and where the browser spent its time (script / style / layout),
// plus the heaviest JS functions from a CPU profile.
//   NODE_PATH=$(npm root -g) node test/perf.cjs [path/to/index.html] [--cpu 4] [--size 1440x900] [--profile]
const { chromium, openPage, menuGo } = require('./lib.cjs');
const path = require('path');
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const file = args.find(a => a.endsWith('.html')) || path.join(__dirname, '..', 'public/index.html');
const CPU = +(opt('--cpu') || 4), [W, H] = (opt('--size') || '1440x900').split('x').map(Number), PROFILE = args.includes('--profile');

(async () => {
  const b = await chromium.launch({ timing: true }); const p = await openPage(b, 'perf', { viewport: { width: W, height: H } });
  const cdp = await p.context().newCDPSession(p);
  await p.goto('file://' + path.resolve(file)); await p.waitForTimeout(700);
  await menuGo(p, 'local'); await p.click('#sGo'); await p.waitForTimeout(1800);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  // frame recorder
  await p.evaluate(() => { window.__fr = []; let last = performance.now(); const loop = t => { window.__fr.push(t - last); last = t; window.__raf = requestAnimationFrame(loop); }; window.__raf = requestAnimationFrame(loop); });
  const board = await p.evaluate(() => { const r = document.querySelector('#vp').getBoundingClientRect(); return { x: r.left + r.width * .45, y: r.top + r.height * .45 }; });
  const scenarios = {
    'drag the board': async () => { await p.mouse.move(board.x, board.y); await p.mouse.down();
      for (let i = 0; i < 90; i++) { await p.mouse.move(board.x + Math.sin(i / 9) * 220, board.y + Math.cos(i / 11) * 120); await p.waitForTimeout(16); }
      await p.mouse.up(); },
    // the start of a grab: 12 short drags; for each, the worst frame in its first 150 ms and the first move's size
    'grab starts': async () => { await p.evaluate(() => { window.__gs = []; });
      for (let k = 0; k < 12; k++) { const x = board.x - 100 + k * 17, y = board.y + (k % 3) * 20;
        await p.mouse.move(x, y); await p.waitForTimeout(250);
        await p.evaluate(() => { const st = document.querySelector('#stage'); window.__g0 = { t: performance.now(), tr: st.style.transform, fr: window.__fr.length }; });
        await p.mouse.down();
        for (let i = 1; i <= 12; i++) { await p.mouse.move(x + i * 2, y + i); await p.waitForTimeout(16); }
        await p.mouse.up();
        await p.evaluate(() => { const g = window.__g0, fr = window.__fr.slice(g.fr); let t = 0, worst = 0; for (const f of fr) { if (t > 150) break; worst = Math.max(worst, f); t += f; } window.__gs.push(worst); });
      }
      const gs = await p.evaluate(() => window.__gs); console.log('  grab starts: worst frame in the first 150 ms of each grab (ms): ' + gs.map(x => x.toFixed(0)).join(' ')); },
    'wheel zoom': async () => { await p.mouse.move(board.x, board.y);
      for (let i = 0; i < 60; i++) { await p.mouse.wheel(0, i < 30 ? -60 : 60); await p.waitForTimeout(16); } },
    'drag a card': async () => { const c = await p.evaluate(() => { const e = document.querySelector('#cards .card'); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * .3 }; });
      await p.mouse.move(c.x, c.y); await p.mouse.down();
      for (let i = 0; i < 70; i++) { await p.mouse.move(c.x + Math.sin(i / 8) * 200, c.y - 40 - i * 4); await p.waitForTimeout(16); }
      await p.keyboard.press('Escape'); await p.mouse.up(); await p.waitForTimeout(300); },
  };
  const rows = [];
  if (PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const TRACE = args.includes('--trace'), traces = [];
  for (const [name, run] of Object.entries(scenarios)) {
    await p.waitForTimeout(400); await p.evaluate(() => { window.__fr.length = 0; });
    if (TRACE) await b.startTracing(p, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'cc', 'gpu', 'blink'] });
    const m0 = await metrics(); const t0 = Date.now(); await run(); const secs = (Date.now() - t0) / 1000; const m1 = await metrics();
    if (TRACE) { const ev = JSON.parse((await b.stopTracing()).toString()).traceEvents; const agg = new Map(), thr = new Map();
      for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') thr.set(e.pid + ':' + e.tid, e.args.name);
      // self time per event name (children subtracted), per thread
      const byThread = new Map(); for (const e of ev) if (e.ph === 'X' && e.dur) { const k = e.pid + ':' + e.tid; if (!byThread.has(k)) byThread.set(k, []); byThread.get(k).push(e); }
      for (const [k, list] of byThread) { list.sort((a, c) => a.ts - c.ts || c.dur - a.dur); const st = [];
        for (const e of list) { while (st.length && st[st.length - 1].ts + st[st.length - 1].dur <= e.ts) st.pop(); if (st.length) st[st.length - 1].child = (st[st.length - 1].child || 0) + e.dur; st.push(e); }
        for (const e of list) { const key = (thr.get(k) || '?').replace(/\d+$/, '') + ' · ' + e.name; agg.set(key, (agg.get(key) || 0) + Math.max(0, e.dur - (e.child || 0))); } }
      traces.push([name, [...agg].sort((a, c) => c[1] - a[1]).slice(0, 14).map(([k, v]) => `      ${(v / 1000 / secs).toFixed(1).padStart(6)} ms/s  ${k}`).join('\n')]); }
    const fr = (await p.evaluate(() => window.__fr.slice(1))).sort((a, b) => a - b);
    const mean = fr.reduce((a, x) => a + x, 0) / fr.length, p95 = fr[Math.floor(fr.length * .95)] || 0, long = fr.filter(x => x > 25).length;
    const d = k => ((m1[k] - m0[k]) * 1000 / secs).toFixed(0); // ms of work per second of interaction
    rows.push(`${name.padEnd(15)} ${fr.length} frames · mean ${mean.toFixed(1)} ms (${(1000 / mean).toFixed(0)} fps) · p95 ${p95.toFixed(1)} ms · over 25 ms: ${long} · per second: script ${d('ScriptDuration')} ms, style ${d('RecalcStyleDuration')} ms (${((m1.RecalcStyleCount - m0.RecalcStyleCount) / secs).toFixed(0)}×), layout ${d('LayoutDuration')} ms (${((m1.LayoutCount - m0.LayoutCount) / secs).toFixed(0)}×)`);
  }
  console.log(`${path.relative(process.cwd(), file)} · ${W}×${H} · CPU ÷${CPU}`); for (const r of rows) console.log('  ' + r);
  for (const [n, t] of traces) console.log(`  trace: ${n} (self time per second of interaction)\n${t}`);
  if (PROFILE) { const { profile } = await cdp.send('Profiler.stop');
    const self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n])), dt = profile.timeDeltas; const tot = new Map();
    profile.samples.forEach((id, i) => { const n = byId.get(id), f = n.callFrame, k = `${f.functionName || '(anonymous)'} ${f.url ? path.basename(f.url) : ''}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); });
    const all = [...self.values()].reduce((a, x) => a + x, 0);
    console.log('  heaviest (self time):'); for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`    ${(v / all * 100).toFixed(1).padStart(5)}%  ${k}`); }
  await b.close();
})();
