// Page-load benchmark: how fast a person gets from opening the site to playing, at a human click-through pace.
//   NODE_PATH=$(npm root -g) node test/loadbench.cjs [url=http://127.0.0.1:8787/] [runs=5]
// Profiles: desktop (no throttling) and phone (4× slower CPU, 150 ms round trip, 1.6 Mbit/s down — the usual mobile
// test settings), each on a first visit (empty cache) and a repeat visit. The "person" reads the start screen for 1.5 s,
// then clicks Start. Reported (medians, ms from navigation start): first paint, start screen visible, Start usable,
// and after the click: board + hand drawn (the start screen's 160 ms fade-out runs on top of it).
const { chromium } = require('playwright');
const URL0 = process.argv[2] || 'http://127.0.0.1:8787/', RUNS = +(process.argv[3] || 5), READ_MS = 1500;
const PROFILES = [
  { name: 'desktop', cpu: 1, net: null, vp: { width: 1440, height: 900 } },
  { name: 'phone', cpu: 4, net: { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 }, vp: { width: 390, height: 844 } },
];
const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
async function once(browser, P, warm) {
  const ctx = await browser.newContext({ viewport: P.vp, deviceScaleFactor: P.name === 'phone' ? 2 : 1 });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable'); if (P.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: P.cpu });
  if (P.net) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...P.net });
  if (warm) { await page.goto(URL0, { waitUntil: 'load' }); await page.waitForTimeout(1500); } // fills the cache (and anything the page prefetches)
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL0, { waitUntil: 'commit' });
  // start screen visible = the Start button is on screen; usable = it is visible and the page's script has wired it up
  await page.waitForSelector('#sGo', { state: 'visible', timeout: 60000 });
  const tStart = await page.evaluate(() => performance.now());
  const paint = await page.evaluate(() => (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || null);
  // the script has run (the game can start at once from here)
  await page.waitForFunction(() => !!window.__ED, null, { timeout: 60000, polling: 50 });
  const tReady = await page.evaluate(() => performance.now());
  await page.waitForTimeout(READ_MS);
  const tClick = await page.evaluate(() => performance.now());
  await page.click('#sGo');
  // playing = the setup is gone, the board is drawn and the hand's cards are on screen, and a frame has been painted
  // drawn = the board and the hand are in the page and a frame has been painted (the start screen then fades out over 160 ms)
  await page.waitForFunction(() => document.querySelectorAll('#board *').length > 50 && document.querySelectorAll('.card').length >= 4, null, { timeout: 60000, polling: 'raf' });
  const tPlay = await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now())))));
  await ctx.close();
  return { paint, start: tStart, ready: tReady, click: tPlay - tClick, total: tPlay - READ_MS, errs };
}
(async () => {
  const browser = await chromium.launch();
  for (const P of PROFILES) for (const warm of [false, true]) {
    const R = []; for (let i = 0; i < RUNS; i++) R.push(await once(browser, P, warm));
    const e = R.flatMap(r => r.errs);
    console.log(`${P.name.padEnd(7)} ${warm ? 'repeat' : 'first '} visit: first paint ${Math.round(med(R.map(r => r.paint || 0)))} · start screen ${Math.round(med(R.map(r => r.start)))} · script ready ${Math.round(med(R.map(r => r.ready)))} · click→playing ${Math.round(med(R.map(r => r.click)))} · open→playing (minus reading) ${Math.round(med(R.map(r => r.total)))} ms${e.length ? ' · errors: ' + e[0] : ''}`);
  }
  await browser.close();
})();
