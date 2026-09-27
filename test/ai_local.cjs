// Local play against the AI: pick AI seats in the setup screen, start, and check the AIs take their turns
// (the neural network loads from /ai/first.bin) and hand the table back to the human.
//   NODE_PATH=$(npm root -g) node test/ai_local.cjs [--shots dir]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const root = path.join(__dirname, '..', 'public');
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(b); }); });
const fail = m => { console.log('FAIL: ' + m); process.exitCode = 1; };
srv.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch(); const errs = []; let netHits = 0;
  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile });
    p.on('pageerror', e => errs.push(`${w}: ${e.message}`)); p.on('request', q => { if (q.url().endsWith('/ai/first.bin')) netHits++; });
    await p.goto(base); await p.waitForTimeout(700);
    // 3 players: me + Humboldt + Raleigh
    await p.selectOption('#pt1', 'humboldt'); await p.waitForTimeout(150);
    await p.selectOption('#pt2', 'raleigh'); await p.waitForTimeout(250);
    if (shots) await p.screenshot({ path: `${shots}/ai_setup_${w}.png` });
    const rows = await p.evaluate(() => [...document.querySelectorAll('.prow.seat')].map(r => { const b = r.getBoundingClientRect(); return { right: b.right, sw: r.querySelector('.sws').getBoundingClientRect().right, h: b.height }; }));
    for (const r of rows) if (r.sw > r.right + 1 || r.sw > w) fail(`${w}: seat row overflows`);
    await p.click('#sGo'); await p.waitForTimeout(800);
    const st = () => p.evaluate(() => { const S = window.__ED.S; return { cur: S.cur, round: S.round, over: S.over, ai: S.players.map(q => q.ai || ''), can: window.__ED.canAct(), log: S.log.length }; });
    let s = await st();
    if (s.ai.join() !== ',humboldt,raleigh') fail('AI seats not in the game: ' + s.ai.join());
    for (let t = 0; t < 3; t++) {
      // my turn: end it
      for (let i = 0; i < 40 && !(await st()).can; i++) await p.waitForTimeout(500);
      s = await st(); if (!s.can || s.cur !== 0) { fail(`${w}: never got the turn back (cur ${s.cur})`); break; }
      if (t === 1 && shots) await p.screenshot({ path: `${shots}/ai_myturn_${w}.png` });
      await p.evaluate(() => window.__ED.act({ t: 'end', keep: [] }));
      await p.waitForTimeout(1500);
      if (t === 0 && shots) await p.screenshot({ path: `${shots}/ai_aiturn_${w}.png` });
      const view = await p.evaluate(() => ({ can: window.__ED.canAct(), cur: window.__ED.S.cur, prompt: document.querySelector('#prompt').textContent }));
      if (view.cur !== 0 && view.can) fail('human can act during an AI turn');
      if (view.cur !== 0 && !/playing/.test(view.prompt)) fail('prompt during AI turn: ' + view.prompt);
    }
    s = await st();
    if (s.round < 3) fail('AIs did not play through rounds: round ' + s.round);
    console.log(`${w}×${h}: round ${s.round}, ${s.log} log lines`);
    await p.close();
  }
  if (!netHits) fail('the network file was never fetched');
  if (errs.length) fail('page errors: ' + errs.join('; '));
  await b.close(); srv.close();
  if (!process.exitCode) console.log('ai local ok');
});
