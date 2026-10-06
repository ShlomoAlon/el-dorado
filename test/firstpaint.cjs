// The start screen is drawn at once: the page's first round trip (index.html, under 14 KB compressed: build.mjs checks it)
// carries everything the start screen needs, and the browser draws it right after the HTML arrives (owner, 2026-10-01:
// within 100 ms on a desktop, the limit of what a person perceives as instant; aiming lower), in its final look (no fade,
// nothing moving in).
//   NODE_PATH=$(npm root -g) node test/firstpaint.cjs
const { browser, ENGINE, serveStatic, openPage, report } = require('./lib.cjs');
const T = report('firstpaint');
const RUNS = 5, med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
// budgets: ms from the HTML's arrival to the start screen drawn (the median of RUNS loads); the phone's is looser for now (owner).
// Every engine (ENGINE: run.mjs --engines); the phone's slower CPU is Chrome's own emulation, so that profile is Chrome's
const PROFILES = [['desktop', 1, 100, { width: 1536, height: 639 }, 1.25], ...(ENGINE === 'chromium' ? [['phone (4x slower CPU)', 4, 350, { width: 390, height: 844 }, 2]] : [])];
// the start screen as a person sees it: the menu open, opaque, not animating, with its controls on screen
const COMPLETE = () => { const d = document.querySelector('#menu'), vis = s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; // (drawn; whether Start is within reach at a short window is playtest 2 A7)
  const miss = ['#sMode', '#seats .seat', 'input[name=np]+span', '#sGo'].filter(s => !vis(s));
  if (!d.open || getComputedStyle(d).display === 'none') miss.push('the menu is not shown');
  if (+getComputedStyle(d).opacity < 1 || +getComputedStyle(d.querySelector('form')).opacity < 1) miss.push('the menu is not opaque');
  if (document.getAnimations().some(a => a.playState === 'running' && d.contains(a.effect && a.effect.target))) miss.push('the menu is animating in');
  return miss; };
(async () => {
  const srv = await serveStatic(), b = await browser.launch();
  // 1. the HTML and its CSS alone draw the whole start screen (the script only adds to it)
  { const p = await openPage(b, 'no script', { alone: true, viewport: { width: 1536, height: 639 }, deviceScaleFactor: 1.25, javaScriptEnabled: false });
    await p.goto(srv.url, { waitUntil: 'load' }); await p.waitForTimeout(400);
    const miss = await p.evaluate(COMPLETE); T.ok('the first round trip alone draws the whole start screen (no script)', !miss.length, miss.join('; ')); await p.context().close(); }
  // 2. how soon after the HTML arrives it is drawn, complete (first contentful paint, with the screen complete at that point)
  for (const [name, cpu, budget, viewport, dpr] of PROFILES) {
    const R = [], bad = [];
    for (let i = 0; i < RUNS; i++) {
      const p = await openPage(b, 'firstpaint', { alone: true, viewport, deviceScaleFactor: dpr });
      if (cpu > 1) await (await p.context().newCDPSession(p)).send('Emulation.setCPUThrottlingRate', { rate: cpu });
      // (read once the page has loaded: asking the page while it loads is work in it, and in Firefox it put the first paint
      // off by 200 ms; the paint's time is recorded by the browser either way)
      // (and in a browser already running, as a player's is: one load first. In Firefox each test page has a browser of its
      // own, just started, and its first load measured the browser's start, 240 ms, not the page's)
      await p.goto(srv.url, { waitUntil: 'load' }); await p.goto(srv.url, { waitUntil: 'load' });
      await p.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length, null, { timeout: 15000 });
      const t = await p.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0].startTime - performance.getEntriesByType('navigation')[0].responseEnd);
      const miss = await p.evaluate(COMPLETE); if (miss.length) bad.push(miss.join('; '));
      R.push(t); await p.context().close();
    }
    const m = Math.round(med(R));
    T.ok(`${name}: the start screen is drawn within ${budget} ms of the HTML arriving`, m <= budget, `median ${m} ms (${R.map(Math.round).join(', ')})`);
    T.ok(`${name}: complete when first drawn (opaque, not animating in)`, !bad.length, bad[0]);
  }
  await b.close(); srv.close(); T.done();
})();
