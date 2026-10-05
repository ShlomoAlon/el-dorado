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
  await p.waitForTimeout(300); const norm = h => h.replace(/ ?\bd-(sel|hov|mark|drag|in)\b/g, '').replace(/ class=""/g, '').replace(/ style=""/g, '').replace(/ hidden=""/g, ''); // (what the page shows or hides is its own: another screen chosen)
  const orig = norm(await p.evaluate(() => document.querySelector('#mform').innerHTML));
  await p.click('#dPanel [data-a=edit]');
  const chosen = () => p.evaluate(() => { const b = document.querySelector('#dPanel .dsel > b'); return b ? b.textContent : ''; });
  // choosing: the biggest part first, a click again one smaller, Escape one bigger, Alt + wheel either way
  await p.click('#sN label[data-v="2"]');
  const hl = await p.evaluate(() => { const f = document.querySelector('#sN').closest('.field'); return { ok: f.classList.contains('d-sel') && getComputedStyle(f).outlineStyle === 'solid' && !document.querySelector('#dSel, #dHov'), sel: [...document.querySelectorAll('.d-sel')].map(e => e.tagName + '.' + e.className).join(' ') }; });
  T.ok('the part chosen carries the highlight itself (an outline on its own corners), no box drawn over the page', hl.ok, hl.sel);
  await p.keyboard.press('Escape'); await p.click('#sN label[data-v="2"]');
  T.ok('in Edit, a click takes the biggest part under it (the field) and does nothing else', !(await p.evaluate(() => document.querySelector('#sN input[value="2"]').checked)) && /^Field "Players"/.test(await chosen()), await chosen());
  await p.click('#sN label[data-v="2"]'); T.ok('a click again: the switch inside it', /^Switch "2 \/ 3 \/ 4"/.test(await chosen()), await chosen());
  await p.click('#sN label[data-v="2"]'); T.ok('and again: one of its options', /^Option "2"/.test(await chosen()), await chosen());
  await p.click('#sN label[data-v="3"]'); T.ok('a neighbour is taken at the same level', /^Option "3"/.test(await chosen()), await chosen());
  await p.keyboard.press('Escape'); T.ok('Escape: one bigger', /^Switch/.test(await chosen()), await chosen());
  const sw = await p.locator('#sN label[data-v="4"]').boundingBox(); await p.mouse.move(sw.x + 5, sw.y + 5);
  await p.keyboard.down('Alt'); await p.mouse.wheel(0, -100); await p.keyboard.up('Alt'); T.ok('Alt + wheel up: one bigger', /^Field "Players"/.test(await chosen()), await chosen());
  await p.keyboard.down('Alt'); await p.mouse.wheel(0, 100); await p.mouse.wheel(0, 100); await p.keyboard.up('Alt'); T.ok('Alt + wheel down: smaller', /^Option "4"/.test(await chosen()), await chosen());
  T.ok('the panel shows where it is (Field › Switch › Option), each level a click away', (await p.evaluate(() => [...document.querySelectorAll('#dPanel .dpath button')].map(b => b.textContent).join(' › '))) === 'Field › Switch › Option');
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  // a button: its type, size, width, a note
  await p.click('#sGo'); await p.click('#sGo');
  T.ok('a button: its row first, then the button', /^Button "Start expedition"/.test(await chosen()), await chosen());
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
  await p.click('#sN', { position: { x: 5, y: 5 } }); if (!/^Switch/.test(await chosen())) await p.click('#sN', { position: { x: 5, y: 5 } });
  await p.click('#dPanel [data-a=copy]'); await p.click('#dPanel [data-a=paste]');
  T.ok('Copy, then Paste on the switch: a second one after it, without the original\'s id', await p.evaluate(() => { const c = document.querySelector('#sN').nextElementSibling; return c && c.matches('.seg') && !c.id && c.dataset.dcopy; }));
  // to another screen: Copy here, go to Online (the panel's screens), choose a part there, Paste
  await p.keyboard.press('Escape'); await p.click('#sGo'); if (!/^Button/.test(await chosen())) await p.click('#sGo');
  await p.keyboard.press('Control+c'); await p.click('#dPanel [data-a=screen][data-v=online]');
  T.ok('the panel goes to another screen while editing (by the menu\'s own tabs)', await p.evaluate(() => !document.querySelector('section[data-screen=online]').hidden));
  const oh = p.locator('section[data-screen=online] h2:visible').first(); await oh.click(); await p.keyboard.press('Control+v');
  T.ok('pasted there: a copy on the Online screen', await p.evaluate(() => !!document.querySelector('section[data-screen=online] [data-dcopy]')));
  await p.click('#dPanel [data-a=screen][data-v=local]');
  // adding: a part from the Add row into the chosen field; one dragged in from the panel; an option to a switch, and an option
  // taken to another switch
  await p.keyboard.press('Escape'); await p.click('#sN label[data-v="2"]'); // (the Players field)
  await p.click('#dPanel [data-a=add]:text-is("Button")');
  T.ok('Add: a new button into the chosen field', await p.evaluate(() => { const f = document.querySelector('#sN').closest('.field'), l = f.lastElementChild; return l.matches('button.btn') && l.textContent === 'New button' && l.classList.contains('d-sel'); }));
  const note = await p.locator('#dPanel [data-a=add]:text-is("Note")').boundingBox(), lead = await p.locator('section[data-screen=setup] p.sub').boundingBox();
  await p.mouse.move(note.x + 10, note.y + 10); await p.mouse.down(); await p.mouse.move(note.x - 40, note.y + 10, { steps: 3 }); await p.mouse.move(lead.x + 30, lead.y + lead.height - 3, { steps: 8 });
  T.ok('dragging one in from the panel shows where it lands', await p.evaluate(() => !!document.querySelector('.d-ghost') && getComputedStyle(document.querySelector('#dDrop')).display === 'block'));
  await p.mouse.up(); await p.waitForTimeout(250);
  T.ok('dropped: a new note in the screen, nothing left floating', await p.evaluate(() => [...document.querySelectorAll('section[data-screen=setup] p.note')].some(n => n.textContent === 'New note' && n.dataset.dcopy) && !document.querySelector('.d-ghost')));
  await p.keyboard.press('Escape'); await p.click('#sN label[data-v="2"]'); await p.click('#sN label[data-v="2"]'); // (the switch)
  await p.click('#dPanel [data-a=addopt]');
  T.ok('Add option: the switch has a fourth, its own choice', await p.evaluate(() => { const o = [...document.querySelectorAll('#sN > label')]; return o.length === 4 && o[3].textContent.trim() === 'New option' && o[3].querySelector('input').value !== o[2].querySelector('input').value; }));
  const o2 = await p.locator('#sN > label').nth(0).boundingBox(), cp = await p.locator('#sN + .seg').boundingBox();
  await p.click('#sN > label >> nth=0'); // (the switch's neighbour level: an option)
  await p.mouse.move(o2.x + o2.width / 2, o2.y + o2.height / 2); await p.mouse.down(); await p.mouse.move(o2.x + o2.width / 2 + 20, o2.y + 10, { steps: 3 }); await p.mouse.move(cp.x + cp.width - 6, cp.y + cp.height / 2, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(250);
  T.ok('an option dragged into another switch of its kind', await p.evaluate(() => document.querySelectorAll('#sN + .seg > label').length === 4 && document.querySelectorAll('#sN > label').length === 3));
  await p.click('section[data-screen=setup] p.sub'); await p.click('#dPanel [data-a=del]');
  T.ok('Delete hides it', await p.evaluate(() => getComputedStyle(document.querySelector('section[data-screen=setup] p.sub')).display === 'none'));
  await p.click('section[data-screen=setup] h2'); await p.fill('#dPanel [data-a=text]', 'The Expedition'); await p.click('#dPanel h3');
  await p.click('#dPanel [data-a=copyall]'); await p.waitForTimeout(300); const copied = await p.evaluate(() => navigator.clipboard.readText());
  T.ok('Copy for Claude: each change in words, where to find it, and the note', /moved: was in Row/.test(copied) && /#sGo/.test(copied) && /look: main, big → plain, big, full width/.test(copied) && /note: "Should this be at the top\?"/.test(copied) && /a copy of Switch "2 \/ 3 \/ 4"/.test(copied) && /Online › a copy of Button "Start expedition"/.test(copied) && /deleted/.test(copied) && /text: "El Dorado Expedition" → "The Expedition"/.test(copied), '\n' + copied);
  const nChanges = (await p.evaluate(() => window.__design.changes())).length;
  T.ok('one line a change, nothing else', copied.split('\n').length === nChanges + 1 && nChanges >= 8, nChanges + ' changes');
  // undo all: the menu exactly as it was; redo all; reset
  for (let i = 0; i < 30; i++) await p.keyboard.press('Control+z');
  T.ok('undo all gives the menu back exactly, and no changes are left', norm(await p.evaluate(() => document.querySelector('#mform').innerHTML)) === orig && (await p.evaluate(() => window.__design.changes())).length === 0);
  for (let i = 0; i < 30; i++) await p.keyboard.press('Control+Shift+z');
  T.ok('redo all brings every change back', (await p.evaluate(() => window.__design.changes())).length === nChanges);
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
