// The design editor (src/client/design), used the way the owner uses it: Design in the menu opens its panel (the game
// works as usual), Edit makes the menu's parts editable (a click takes a part, a drag moves it), the edits, Copy for Claude,
// undo all gives the menu back exactly, Edit off and closing leave nothing behind. Also: every element of the menus is a
// part the editor knows (parts.js), so a new building block can't be added without teaching it.
//   NODE_PATH=$(npm root -g) node test/design.cjs
const { chromium, serveStatic, openPage, report } = require('./lib.cjs');
const T = report('design');
(async () => {
  const srv = await serveStatic(), b = await chromium.launch();
  const p = await openPage(b, 'design', { viewport: { width: 1229, height: 511 }, deviceScaleFactor: 1.25, permissions: ['clipboard-read', 'clipboard-write'] });
  await p.goto(srv.url); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
  // its file arrives while the page is idle, and builds nothing (no panel, style or listener) until Design is clicked
  T.ok('the editor\'s file arrives while the page is idle', await p.waitForFunction(() => window.__design, null, { timeout: 8000 }).then(() => true, () => false));
  T.ok('and builds nothing until opened', await p.evaluate(() => !window.__design.built && !document.querySelector('#dPanel, #dHov, #dSel, #dDrop')));
  // opened: the panel in the frame after the click (timed in the page, not by the test's round trips)
  const opened = await p.evaluate(() => new Promise(r => { const t0 = performance.now(); document.querySelector('#designBtn').click(); requestAnimationFrame(() => r(document.querySelector('#dPanel') && !document.querySelector('#dPanel').hidden ? performance.now() - t0 : -1)); }));
  T.ok('Design opens the panel in the next frame', opened >= 0 && opened < 100, opened.toFixed(0) + ' ms');
  T.ok('the panel has the right of the window: the game and the menu make room', await p.evaluate(() => { const pr = document.querySelector('#dPanel').getBoundingClientRect(), m = document.querySelector('#mform').getBoundingClientRect(), g = document.querySelector('#gamecell').getBoundingClientRect(); return m.right <= pr.left && g.right <= pr.left + 1; }));
  T.ok('every element of the menus is a part the editor knows', !(await p.evaluate(() => window.__design.uncovered())).length, (await p.evaluate(() => window.__design.uncovered())).join(', '));
  await p.click('#sN label[data-v="4"]');
  T.ok('with the panel open and Edit off, the menu works as usual', await p.evaluate(() => document.querySelector('#sN input[value="4"]').checked));
  await p.waitForTimeout(300); const norm = h => h.replace(/ ?\bd-(sel|hov|mark|drag|in)\b/g, '').replace(/ class=""/g, '').replace(/ style=""/g, '');
  const orig = norm(await p.evaluate(() => document.querySelector('#mform').innerHTML));
  await p.click('#dPanel [data-a=edit]');
  await p.click('#sN label[data-v="2"]');
  T.ok('in Edit, a click takes the part (a switch whole) and does nothing else', await p.evaluate(() => !document.querySelector('#sN input[value="2"]').checked && /^Switch "2 \/ 3 \/ 4"/.test(document.querySelector('#dPanel .dsel b').textContent)));
  await p.dblclick('#sN label[data-v="3"]');
  T.ok('a double-click reaches one of its options', await p.evaluate(() => /^Option "3"/.test(document.querySelector('#dPanel .dsel b').textContent)));
  await p.keyboard.press('Escape');
  // a button: its type, size, width, a note
  await p.click('#sGo');
  T.ok('a click on a button takes the button', await p.evaluate(() => /^Button "Start expedition"/.test(document.querySelector('#dPanel .dsel b').textContent)));
  await p.click('#dPanel [data-a=type][data-v=plain]'); await p.click('#dPanel [data-a=w][data-v=d-w1]');
  await p.fill('#dPanel [data-a=note]', 'Should this be at the top?'); await p.click('#dPanel h3');
  T.ok('type and width are the theme\'s classes', await p.evaluate(() => { const e = document.querySelector('#sGo'); return !e.classList.contains('pri') && e.classList.contains('btn') && e.classList.contains('d-w1') && !e.getAttribute('style'); }));
  // a drag: the button into the Players field, sliding into place
  const a = await p.locator('#sGo').boundingBox(), t = await p.locator('#sN').boundingBox();
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await p.mouse.down(); await p.mouse.move(a.x + a.width / 2, a.y - 20, { steps: 4 }); await p.mouse.move(t.x + 40, t.y - 14, { steps: 8 });
  T.ok('while dragging, a line shows where it would land', await p.evaluate(() => getComputedStyle(document.querySelector('#dDrop')).display === 'block'));
  await p.mouse.up(); await p.waitForTimeout(400);
  T.ok('dropped, the button is in the Players field', await p.evaluate(() => document.querySelector('#sGo').parentElement === document.querySelector('#sN').closest('.field')));
  // copy, delete, text
  await p.click('#sN', { position: { x: 5, y: 5 } }); await p.click('#dPanel [data-a=copy]');
  T.ok('Copy makes a second one next to it, without the original\'s id', await p.evaluate(() => { const c = document.querySelector('#sN').nextElementSibling; return c && c.matches('.seg') && !c.id && c.dataset.dcopy; }));
  await p.click('section[data-screen=setup] p.sub'); await p.click('#dPanel [data-a=del]');
  T.ok('Delete hides it', await p.evaluate(() => getComputedStyle(document.querySelector('section[data-screen=setup] p.sub')).display === 'none'));
  await p.click('section[data-screen=setup] h2'); await p.fill('#dPanel [data-a=text]', 'The Expedition'); await p.click('#dPanel h3');
  await p.click('#dPanel [data-a=copyall]'); await p.waitForTimeout(300); const copied = await p.evaluate(() => navigator.clipboard.readText());
  T.ok('Copy for Claude: each change in words, where to find it, and the note', /moved: was in Row/.test(copied) && /#sGo/.test(copied) && /look: main, big → plain, big, full width/.test(copied) && /note: "Should this be at the top\?"/.test(copied) && /a copy of Switch "2 \/ 3 \/ 4"/.test(copied) && /deleted/.test(copied) && /text: "El Dorado Expedition" → "The Expedition"/.test(copied), '\n' + copied);
  T.ok('nothing else in it', copied.split('\n').length === 5, copied.split('\n').length + ' lines');
  // undo all: the menu exactly as it was; redo all; reset
  for (let i = 0; i < 8; i++) await p.keyboard.press('Control+z');
  T.ok('undo all gives the menu back exactly, and no changes are left', norm(await p.evaluate(() => document.querySelector('#mform').innerHTML)) === orig && (await p.evaluate(() => window.__design.changes())).length === 0);
  for (let i = 0; i < 8; i++) await p.keyboard.press('Control+Shift+z');
  T.ok('redo all brings every change back', (await p.evaluate(() => window.__design.changes())).length === 4);
  await p.click('#dPanel [data-a=reset]');
  T.ok('Reset: the menu as it was', norm(await p.evaluate(() => document.querySelector('#mform').innerHTML)) === orig);
  // Edit off, closing: nothing left
  await p.click('#dPanel [data-a=edit]'); await p.click('#sN label[data-v="3"]');
  T.ok('Edit off: the menu works again, nothing of edit mode left', await p.evaluate(() => document.querySelector('#sN input[value="3"]').checked && !document.querySelector('.d-sel, .d-hov, .d-drag') && !document.documentElement.classList.contains('d-editing')));
  await p.click('#dPanel [data-a=close]');
  T.ok('closed: the game and the menu have the whole window again', await p.evaluate(() => !document.documentElement.classList.contains('d-open') && Math.abs(document.querySelector('#gamecell').getBoundingClientRect().right - innerWidth) < 1));
  await p.click('#designBtn'); T.ok('Design opens it again', await p.evaluate(() => !document.querySelector('#dPanel').hidden));
  T.ok('no page errors (assertions included)', !p.errors.length, p.errors.slice(0, 5).join(' | '));
  await b.close(); srv.close(); T.done();
})().catch(e => { console.error(e); process.exit(1); });
