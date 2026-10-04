// The design editor (src/client/editor, owner 2026-10-05): loaded only from a link with ?edit, and then usable: a menu screen
// laid out on a grid, a block split, styled, folded behind More options and tried, a new screen, the cards' options in a
// game, the design downloaded; and a page without ?edit never fetches it.
//   NODE_PATH=$(npm root -g) node test/editor.cjs
const { chromium, serveStatic, openPage, settle, report } = require('./lib.cjs');
const T = report('editor');
(async () => {
  const srv = await serveStatic(), b = await chromium.launch();
  const p = await openPage(b, 'editor', { viewport: { width: 1536, height: 639 }, deviceScaleFactor: 1.25, acceptDownloads: true });
  p.on('dialog', d => d.accept(d.type() === 'prompt' ? 'title' : undefined));
  await p.goto(srv.url + '?edit'); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
  T.ok('?edit: the editor opens', await p.waitForSelector('#edPanel .ed-head', { timeout: 8000 }).then(() => true, () => false));
  const blocks = () => p.evaluate(() => { const s = document.querySelector('#mform > section[data-screen]:not([hidden])'); return [...s.querySelectorAll('[data-edk]')].filter(e => e.style.gridRow).map(e => { const r = e.getBoundingClientRect(); return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2, k: e.dataset.edk }; }); });
  await p.click('#edPanel [data-act=grid]');
  T.ok('the screen is a grid', await p.evaluate(() => getComputedStyle(document.querySelector('#mform > section[data-screen=setup]')).display === 'grid'));
  let bl = await blocks(), last = bl[bl.length - 1]; await p.mouse.click(last.x, last.y); await p.click('#edPanel [data-act=split]');
  T.ok('a row of buttons splits into its own blocks', (await blocks()).length > bl.length, `${bl.length} → ${(await blocks()).length}`);
  bl = await blocks(); await p.mouse.click(bl[0].x, bl[0].y);
  for (const [a, v] of [['st-font', 'serif'], ['st-text', 'xl'], ['st-align', 'center'], ['st-surface', 'framed']]) await p.click(`#edPanel [data-act=${a}][data-v=${v}]`);
  T.ok('a block takes styles from the lists', await p.evaluate(k => { const e = document.querySelector(`[data-edk="${k}"]`); return ['ed-font-serif', 'ed-text-xl', 'ed-align-center', 'ed-surface-framed'].every(c => e.classList.contains(c)); }, bl[0].k));
  await p.click('#edPanel [data-act=w-]'); bl = await blocks(); const before = await p.evaluate(k => document.querySelector(`[data-edk="${k}"]`).style.gridColumn, bl[0].k);
  await p.mouse.move(bl[0].x, bl[0].y); await p.mouse.down(); await p.mouse.move(bl[0].x + 400, bl[0].y, { steps: 6 }); await p.mouse.up();
  T.ok('a block dragged snaps to another column', await p.evaluate(([k, b]) => document.querySelector(`[data-edk="${k}"]`).style.gridColumn !== b, [bl[0].k, before]));
  bl = await blocks(); await p.mouse.click(bl[3].x, bl[3].y); await p.click('#edPanel [data-act=fold]'); await p.click('#edPanel [data-act=edit]'); // (trying it)
  T.ok('a folded block is behind More options', await p.evaluate(k => getComputedStyle(document.querySelector(`[data-edk="${k}"]`)).display === 'none' && !!document.querySelector('.ed-more'), bl[3].k));
  await p.click('.ed-more'); T.ok('More options shows it', await p.evaluate(k => getComputedStyle(document.querySelector(`[data-edk="${k}"]`)).display !== 'none', bl[3].k));
  await p.click('#edPanel [data-act=newscreen]'); T.ok('a new screen', await p.evaluate(() => !!document.querySelector('#mform > section[data-screen=title]')));
  await p.click('#edPanel [data-tab=options]'); await p.click('#edPanel [data-opt=cards][data-v=c]');
  await p.evaluate(() => document.querySelector('#sGo').click()); await p.waitForFunction(() => window.__ED.S && !window.__ED.UI.preview && !document.querySelector('#menu').open, null, { timeout: 8000 }); await settle(p);
  T.ok('the cards\' option shows in a game', await p.evaluate(() => document.documentElement.dataset.edcards === 'c' && document.querySelectorAll('#cards .card').length > 0));
  await p.click('#edPanel [data-act=mini]'); T.ok('the panel shrinks to its title', !(await p.$('#edPanel .ed-body'))); await p.click('#edPanel [data-act=mini]');
  await p.click('#edPanel [data-tab=export]'); const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#edPanel [data-act=download]')]);
  const txt = require('fs').readFileSync(await dl.path(), 'utf8'); T.ok('the design downloads as a file', /"screens"/.test(txt) && /"setup"/.test(txt), dl.suggestedFilename());
  const p2 = await openPage(b, 'no edit'); const reqs = []; p2.on('request', q => reqs.push(q.url())); await p2.goto(srv.url); await p2.waitForFunction(() => window.__ED && document.querySelector('#menu').open); await p2.waitForTimeout(800);
  T.ok('without ?edit the editor is never fetched', !reqs.some(u => /\/ed\.[0-9a-f]+\.js/.test(u)) && !(await p2.$('#edPanel')));
  T.ok('no page errors (assertions included)', !p.errors.length && !p2.errors.length, [...p.errors, ...p2.errors].slice(0, 3).join(' | '));
  await b.close(); srv.close(); T.done();
})();
