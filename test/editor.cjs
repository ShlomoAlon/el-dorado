// The design editor (src/client/editor, owner 2026-10-05): loaded only from a link with ?edit, and small: Layout, in Edit mode
// (blocks moved on a fixed grid, a third, half or the whole width, hidden, deleted, in More options, in a top or bottom bar,
// their text changed, a scrolling list shown whole or cut short; out of Edit mode the page works as ever), Flow (screens per state,
// buttons between them, the screen the menu opens on), Options (sets to flip between), Export (a file). A page without
// ?edit never fetches it.
//   NODE_PATH=$(npm root -g) node test/editor.cjs
const { browser, serveStatic, openPage, settle, report } = require('./lib.cjs');
const T = report('editor');
(async () => {
  const srv = await serveStatic(), b = await browser.launch();
  const p = await openPage(b, 'editor', { viewport: { width: 1536, height: 639 }, deviceScaleFactor: 1.25, acceptDownloads: true });
  // (Copy flow writes the clipboard: what the page writes is kept as it goes through, the real write still made. Reading the
  // clipboard back needs a permission each engine names its own way, and Firefox grants none)
  await p.addInitScript(() => { const c = navigator.clipboard, w = c && c.writeText.bind(c); if (w) c.writeText = t => { window.__copied = t; return w(t); }; });
  const answers = []; p.on('dialog', d => d.accept(d.type() === 'prompt' ? answers.shift() || 'title' : undefined));
  // (eight finished games kept on this device, as a player has: Replays' "Your games" is a list long enough to scroll)
  const fx = require('fs').readFileSync(require('path').join(__dirname, 'fixtures/replay.json'), 'utf8');
  await p.goto(srv.url); await p.evaluate(fx => { const g = JSON.parse(fx); localStorage.setItem('eldorado-games-v2', JSON.stringify(Array.from({ length: 8 }, (_, i) => ({ ...g, created: Date.now() - i * 864e5 })))); }, fx);
  await p.goto(srv.url + '?edit'); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
  T.ok('?edit: the editor opens', await p.waitForSelector('#edPanel .ed-head', { timeout: 8000 }).then(() => true, () => false));
  const blocks = () => p.evaluate(() => [...document.querySelectorAll('#mform > section[data-screen]:not([hidden]) .ed-item')].map(e => { const r = e.getBoundingClientRect(); return { x: r.left + Math.min(30, r.width / 2), y: r.top + r.height / 2, r: r.right, k: e.dataset.edk, btn: e.matches('button') }; }));
  const col = k => p.evaluate(k => document.querySelector(`[data-edk="${CSS.escape(k)}"]`).style.gridColumn, k);
  // the flowchart is a drawing: the menu is the page's own, on the page's own first screen, with no screen of the flowchart's (owner, 2026-10-05)
  const onShow = () => p.evaluate(() => [...document.querySelectorAll('#mform > section[data-screen]:not([hidden])')].map(s => s.dataset.screen).join(','));
  const pageOnly = () => p.evaluate(() => !document.querySelector('#mform > section[data-ed], #mform [data-ed-go]'));
  T.ok('the menu opens on the page\'s own first screen, and has no screen of the flowchart\'s', await onShow() === 'setup' && await pageOnly(), await onShow());
  T.ok('the screen on show is a grid', await p.evaluate(() => getComputedStyle(document.querySelector('#mform > section[data-screen=setup]')).display === 'grid'));
  T.ok('out of Edit mode, the menu works (a click is a click)', await p.evaluate(() => { document.querySelector('#sN label[data-v="4"]').click(); return document.querySelector('#sN input[value="4"]').checked; }));
  await p.click('#edPanel [data-act=editmode]');
  let bl = await blocks(); T.ok('a row of buttons is its buttons, each a block', bl.filter(x => x.btn).length >= 2, bl.filter(x => x.btn).map(x => x.k).join(', '));
  // a block made half width, then moved: a click, a drag
  await p.mouse.click(bl[0].x, bl[0].y); await p.click('#edPanel [data-act=w][data-v="3"]');
  T.ok('a block is made half the width', /span 3/.test(await col(bl[0].k)), await col(bl[0].k));
  bl = await blocks(); await p.mouse.move(bl[0].x, bl[0].y); await p.mouse.down(); await p.mouse.move(bl[0].x + 300, bl[0].y, { steps: 6 }); await p.mouse.up();
  const moved = await col(bl[0].k); T.ok('a block dragged snaps to another column', /^4 /.test(moved), moved);
  await p.keyboard.press('ArrowLeft'); const c1 = await col(bl[0].k); await p.keyboard.press('Control+z'); const c2 = await col(bl[0].k); await p.keyboard.press('Control+Shift+z');
  T.ok('arrows move it a cell; Ctrl+Z undoes, Ctrl+Shift+Z redoes', c1 !== moved && c2 === moved && await col(bl[0].k) === c1, [moved, c1, c2].join(' → '));
  // the Start button into the bottom bar; a setting into More options
  await p.evaluate(() => document.querySelector('#sGo').scrollIntoView({ block: 'center' })); bl = await blocks(); const go = bl.find(x => x.k === '#sGo'); await p.mouse.click(go.x, go.y); await p.click('#edPanel [data-act=bar][data-v=bottom]');
  T.ok('a button goes into the bottom bar, pinned to the screen\'s foot', await p.evaluate(() => { const g = document.querySelector('#sGo'), bar = g.parentElement, m = document.querySelector('#mform').getBoundingClientRect();
    return bar.classList.contains('ed-bar-bottom') && getComputedStyle(bar).position === 'sticky' && Math.abs(bar.getBoundingClientRect().bottom - m.bottom) < 2; }));
  // the heading into the top bar: it stays at the top while the screen scrolls
  await p.evaluate(() => document.querySelector('#mform').scrollTop = 0); bl = await blocks(); await p.mouse.click(bl[0].x, bl[0].y); await p.click('#edPanel [data-act=bar][data-v=top]');
  await p.evaluate(() => { const m = document.querySelector('#mform'); m.scrollTop = 300; });
  T.ok('a block goes into the top bar, which stays at the screen\'s top as it scrolls', await p.evaluate(k => { const e = document.querySelector(`[data-edk="${CSS.escape(k)}"]`), bar = e.parentElement, m = document.querySelector('#mform').getBoundingClientRect();
    return bar.classList.contains('ed-bar-top') && Math.abs(bar.getBoundingClientRect().top - m.top) < 2; }, bl[0].k));
  await p.evaluate(() => document.querySelector('#mform').scrollTop = 0); bl = await blocks(); await p.mouse.click(bl[3].x, bl[3].y); await p.click('#edPanel [data-act=fold]');
  await p.click('#edPanel [data-act=editmode]'); // (Stop editing: the menu works)
  T.ok('a folded block is behind More options', await p.evaluate(k => getComputedStyle(document.querySelector(`[data-edk="${CSS.escape(k)}"]`)).display === 'none' && !!document.querySelector('.ed-more'), bl[3].k));
  await p.evaluate(() => { const m = document.querySelector('#mform'); m.scrollTop = m.scrollHeight; }); // (scrolled to its foot: nothing under the bottom bar)
  await p.click('.ed-more'); T.ok('More options shows it', await p.evaluate(k => getComputedStyle(document.querySelector(`[data-edk="${CSS.escape(k)}"]`)).display !== 'none', bl[3].k));
  // words: a double-click, typing, Enter
  await p.click('#edPanel [data-act=editmode]'); await p.evaluate(() => document.querySelector('#mform').scrollTop = 0);
  const h = await p.evaluate(() => { const e = document.querySelector('#mform > section[data-screen=setup] .sub'), r = e.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; });
  await p.mouse.dblclick(h.x, h.y); await p.keyboard.type('A new line of words'); await p.keyboard.press('Enter');
  T.ok('text is changed by a double-click and typing', await p.evaluate(() => document.querySelector('#mform > section[data-screen=setup] .sub').textContent === 'A new line of words'));
  // a button's kind: the Start button chosen, made a link, then Plain, then back to Main (its own: nothing kept)
  { await p.evaluate(() => document.querySelector('#sGo').scrollIntoView({ block: 'center' }));
    const r = await p.evaluate(() => { const q = document.querySelector('#sGo').getBoundingClientRect(); return { x: q.left + 20, y: q.top + q.height / 2 }; });
    await p.mouse.click(r.x, r.y); const cls = () => p.evaluate(() => document.querySelector('#sGo').className);
    await p.click('#edPanel [data-act=kind][data-v=link]'); const asLink = await cls();
    await p.click('#edPanel [data-act=kind][data-v=plain]'); const asPlain = await cls();
    await p.click('#edPanel [data-act=kind][data-v=pri]'); const back = await cls();
    T.ok("a button's kind is changed (Link, Plain, Main)", /linkbtn/.test(asLink) && !/\bbtn\b/.test(asLink) && /\bbtn\b/.test(asPlain) && !/pri|linkbtn/.test(asPlain) && /\bbtn pri big\b|pri/.test(back) && /big/.test(back), [asLink, asPlain, back].join(' → '));
    await p.click('#edPanel [data-act=kind][data-v=link]'); await p.keyboard.press('Escape');
    await p.evaluate(() => document.querySelector('#mform').scrollTop = 0); }
  // a control's type: the Players choice as a dropdown, the hand-hiding setting as two buttons; each still sets the page's own control
  { const at = sel => p.evaluate(sel => { const e = document.querySelector(sel); e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: q.left + 12, y: q.top + q.height / 2 }; }, sel);
    if (!(await p.$('#edPanel.editing'))) await p.click('#edPanel [data-act=editmode]');
    let r = await at('#sN'); await p.mouse.click(r.x, r.y); await p.click('#edPanel [data-act=ctype][data-v=select]');
    r = await at('#sPriv'); await p.mouse.click(r.x + 30, r.y); await p.click('#edPanel [data-act=ctype][data-v=two]');
    await p.click('#edPanel [data-act=editmode]');
    T.ok('a choice shown as a dropdown, its own row of buttons hidden', await p.evaluate(() => !!document.querySelector('select.ed-alt') && getComputedStyle(document.querySelector('#sN')).display === 'none'));
    await p.selectOption('select.ed-alt', '4');
    T.ok('the dropdown sets the page\'s own choice', await p.evaluate(() => document.querySelector('#sN input[value="4"]').checked));
    await p.evaluate(() => [...document.querySelectorAll('.ed-alt button')].find(b => b.textContent === 'Yes').click());
    T.ok('a yes/no setting as two buttons sets the page\'s own checkbox', await p.evaluate(() => document.querySelector('#sPriv').checked));
    await p.evaluate(() => [...document.querySelectorAll('.ed-alt button')].find(b => b.textContent === 'No').click());
    await p.click('#edPanel [data-act=editmode]');
    r = await at('select.ed-alt'); await p.mouse.click(r.x, r.y); await p.click('#edPanel [data-act=ctype][data-v=seg]');
    r = await at('.ed-alt.seg'); await p.mouse.click(r.x, r.y); await p.click('#edPanel [data-act=ctype][data-v=check]');
    T.ok('back to their own kinds', await p.evaluate(() => !document.querySelector('.ed-alt') && getComputedStyle(document.querySelector('#sN')).display !== 'none'));
    await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelector('#mform').scrollTop = 0); } // (Edit mode on, as the steps after expect)
  // Delete: the chosen block is gone (also while editing); undo brings it back
  bl = await blocks(); const dk = bl[1].k; await p.mouse.click(bl[1].x, bl[1].y); await p.keyboard.press('Delete');
  const gone = await p.evaluate(k => getComputedStyle(document.querySelector(`[data-edk="${CSS.escape(k)}"]`)).display === 'none', dk); await p.keyboard.press('Control+z');
  T.ok('Delete deletes the chosen block; Ctrl+Z brings it back', gone && await p.evaluate(k => getComputedStyle(document.querySelector(`[data-edk="${CSS.escape(k)}"]`)).display !== 'none', dk));
  await p.click('#edPanel [data-act=editmode]');
  // a list that scrolls, cut to its first 5 (Replays: the games kept here)
  await p.evaluate(() => document.querySelector('#sMode label[data-v="replays"]').click()); await p.waitForTimeout(300);
  const lst = await p.evaluate(() => { const l = document.querySelector('#rMine'), b = l && l.closest('.ed-item'); if (!b) return null; const r = b.getBoundingClientRect();
    return { x: r.left + 20, y: r.top + 8, n: l.children.length, scrolls: l.scrollHeight > l.clientHeight }; });
  T.ok('Replays: "Your games" is a list that scrolls', !!lst && lst.n === 8 && lst.scrolls, lst && `${lst.n} games, scrolls ${lst.scrolls}`);
  if (lst) { await p.click('#edPanel [data-act=editmode]'); await p.mouse.click(lst.x, lst.y); await p.click('#edPanel [data-act=list][data-v="5"]');
    T.ok('the list cut to its first 5 shows 5 and scrolls no more (the screen does)', await p.evaluate(() => { const l = document.querySelector('#rMine'); return l.dataset.edList === '5' && getComputedStyle(l).overflowY === 'visible' && [...l.children].filter(c => getComputedStyle(c).display !== 'none').length === 5; }));
    await p.click('#edPanel [data-act=editmode]'); }
  await p.evaluate(() => document.querySelector('#sMode label[data-v="local"]').click());
  // flow: full screen; the default flowchart; a box laid out; a reload keeps the editor where it was
  if (await p.$('#edPanel.editing')) await p.click('#edPanel [data-act=editmode]');
  const before = await onShow();
  await p.click('#edPanel [data-tab=flow]');
  T.ok('the directions start folded', await p.evaluate(() => document.querySelectorAll('#edPanel .ed-dir').length > 5 && !document.querySelector('#edPanel .ed-mb')));
  T.ok('Flow takes the whole window', await p.evaluate(() => { const r = document.querySelector('#edPanel').getBoundingClientRect(); return r.left <= 13 && r.right >= innerWidth - 13 && r.bottom >= innerHeight - 13; }));
  T.ok('the chart starts on the Main menu, any state, with what leads to it and from it; every menu once below', await p.evaluate(() => !!document.querySelector('#edPanel .ed-node.focus[data-node="main@*"]')
    && document.querySelectorAll('#edPanel .ed-node.tray, #edPanel .ed-node.tnear, #edPanel .ed-node.tfocus').length === document.querySelectorAll('#edPanel .ed-dir').length - 1 && document.querySelectorAll('#edPanel .ed-ln').length >= 10)); // (- 1: Any menu, listed only)
  await p.click('#edPanel [data-centre="main@game"]');
  T.ok('a menu in one state shows what applies there for any state too, its other end in that state (Settings in a game)', await p.evaluate(() => !!document.querySelector('#edPanel .ed-node[data-node="settings@game"]') && [...document.querySelectorAll('#edPanel text.ed-ar')].some(t => /^Settings/.test(t.textContent)) && [...document.querySelectorAll('#edPanel text.ed-ar')].some(t => /^Back$/.test(t.textContent))));
  await p.click('#edPanel [data-centre="main@none"]');
  T.ok('a menu in one state shows what arrives there from other states (the lobby\'s Leave, from in a room)', await p.evaluate(() => !!document.querySelector('#edPanel .ed-node[data-node="room@room"]') && [...document.querySelectorAll('#edPanel text.ed-ar')].some(t => /^Leave/.test(t.textContent))));
  await p.click('#edPanel [data-centre="main@game"]');
  T.ok('a state tab centres the menu in that state: the Main menu opens here in a game', await p.evaluate(() => /★/.test(document.querySelector('#edPanel .ed-node.focus[data-node="main@game"] .m').textContent)));
  await p.click('#edPanel .ed-node[data-node="results@*"]');
  T.ok('a menu clicked below is centred, and shown in the directions', await p.evaluate(() => { const r = document.querySelector('#edPanel .ed-dir[data-menu="results"]'), d = document.querySelector('#edPanel .ed-dirs'), a = r.getBoundingClientRect(), b = d.getBoundingClientRect();
    return !!document.querySelector('#edPanel .ed-node.focus[data-node="results@*"]') && a.top >= b.top - 1 && a.top < b.bottom - 20 && d.scrollTop > 0; }));
  await p.click('#edPanel .ed-node[data-node="settings@*"]');
  T.ok('a click in the chart folds the directions to what it chose', await p.evaluate(() => document.querySelectorAll('#edPanel .ed-mb').length === 1 && !!document.querySelector('#edPanel .ed-dir[data-menu="settings"] .ed-mb')));
  await p.click('#edPanel .ed-node[data-node="results@*"]');
  T.ok('nothing done in the chart changes the page\'s menu (the screen on show, no screen of the flowchart\'s)', await onShow() === before && await pageOnly(), `${before} → ${await onShow()}`);
  T.ok('a box has no "Lay out": the flowchart never shows a menu', await p.evaluate(() => !document.querySelector('#edPanel [data-act=fl-lay]')));
  await p.reload(); await p.waitForSelector('#edPanel .ed-head'); await p.waitForTimeout(400);
  T.ok('a reload keeps the editor where it was (the menu on show, the tab)', await onShow() === before && await p.evaluate(() => document.querySelector('#edPanel [data-tab=flow]').classList.contains('on')), await onShow());
  await p.click('#edPanel [data-tab=flow]');
  // a transition drawn: the centred box clicked, then another; its words typed; for two states of its menu; a note
  await p.click('#edPanel .ed-node[data-node="replays@*"]'); await p.click('#edPanel .ed-node.focus[data-node="replays@*"]'); await p.click('#edPanel .ed-node[data-node="results@*"]');
  const tid = await p.evaluate(() => document.activeElement && document.activeElement.dataset.id);
  T.ok('the centred box clicked, then another: a transition, its words ready to type', !!tid);
  await p.keyboard.type('See results'); await p.keyboard.press('Tab');
  T.ok('its words in the chart', await p.evaluate(() => [...document.querySelectorAll('#edPanel text.ed-ar')].some(t => /See results/.test(t.textContent))));
  await p.click(`#edPanel [data-act=fl-tst][data-id="${tid}"][data-v=none]`); await p.click(`#edPanel [data-act=fl-tst][data-id="${tid}"][data-v=game]`);
  T.ok('a transition for two states of its menu: a box for each', await p.evaluate(id => !!document.querySelector('#edPanel [data-dir="replays@game"]') && !!document.querySelector('#edPanel [data-dir="replays@none"]') && [...document.querySelectorAll(`#edPanel [data-act=fl-tst][data-id="${id}"].on`)].length === 2, tid));
  await p.click('#edPanel .ed-node.focus'); await p.click('#edPanel .ed-ftools');
  T.ok('a transition being drawn is dropped by a click anywhere but a box', await p.evaluate(() => !document.querySelector('#edPanel .ed-fc.connect')));
  await p.fill(`#edPanel [data-act=fl-tnote][data-id="${tid}"]`, 'Try this'); await p.click('#edPanel .ed-ftools');
  await p.click(`#edPanel [data-act=fl-tflag][data-id="${tid}"][data-v=signed]`); await p.click(`#edPanel [data-act=fl-tflag][data-id="${tid}"][data-v=host]`); await p.click(`#edPanel [data-act=fl-tflag][data-id="${tid}"][data-v=host]`);
  T.ok('a transition requiring a condition and not another: shown with its words', await p.evaluate(() => [...document.querySelectorAll('#edPanel text.ed-ar')].some(t => /See results · signed in, not hosting the room/.test(t.textContent))));
  // a menu's own buttons: Settings has some in the default flowchart; one added to Results
  await p.click('#edPanel .ed-node[data-node="settings@*"]');
  T.ok('the default has a Settings menu, its own buttons listed under it when centred', await p.evaluate(() => [...document.querySelectorAll('#edPanel .ed-own')].some(t => /Sound/.test(t.textContent))));
  await p.click('#edPanel [data-act=fl-fold][data-v="m:results"]'); await p.click('#edPanel [data-act=fl-addb][data-v="results"]'); await p.keyboard.type('Share the result'); await p.keyboard.press('Tab');
  await p.click('#edPanel .ed-node[data-node="results@*"]');
  T.ok('a button that stays on its menu, added and shown under it', await p.evaluate(() => [...document.querySelectorAll('#edPanel .ed-own')].some(t => /Share the result/.test(t.textContent))));
  await p.click('#edPanel [data-act=fl-copy]'); await p.waitForTimeout(200);
  const copied = await p.evaluate(() => window.__copied || 'nothing written to the clipboard');
  T.ok('Copy flow: the flow as text, with its notes', /See results/.test(copied) && /note: Try this/.test(copied) && /Main menu/.test(copied) && /button \(stays on this menu\).*Share the result/.test(copied) && /signed in, not hosting the room: "See results"/.test(copied) && /an online room: "Copy the room link"/.test(copied), copied.split('\n').filter(l => /See results|Try this/.test(l)).join(' | ') || copied.slice(0, 300));
  const mb = () => p.evaluate(() => !!document.querySelector('#edPanel .ed-dir[data-menu="results"] .ed-mb'));
  const was = await mb(); await p.click('#edPanel [data-act=fl-fold][data-v="m:results"]'); const now = await mb(); await p.click('#edPanel [data-act=fl-fold][data-v="m:results"]');
  T.ok('a menu opens and folds in the directions', now !== was && (await mb()) === was);
  // merge, split, copy
  await p.click('#edPanel [data-act=fl-fold][data-v="m:viewer"]'); await p.selectOption('#edPanel [data-act=fl-merge][data-m="viewer"]', 'replays');
  T.ok('a menu merged into another: its boxes and transitions are the other\'s', await p.evaluate(() => !document.querySelector('#edPanel .ed-dir[data-menu="viewer"]') && !document.querySelector('#edPanel .ed-node[data-node^="viewer@"]')));
  answers.push('Room menu'); await p.click('#edPanel [data-act=fl-fold][data-v="m:main"]'); await p.click('#edPanel [data-act=fl-split][data-v="main@room"]');
  T.ok('a state split off as a menu of its own', await p.evaluate(() => !document.querySelector('#edPanel .ed-node[data-node="main@room"]') && [...document.querySelectorAll('#edPanel .ed-node .m')].some(t => /Room menu/.test(t.textContent))));
  await p.click('#edPanel [data-act=fl-fold][data-v="m:room"]'); await p.selectOption('#edPanel [data-act=fl-copyall][data-m="room"]', 'online');
  T.ok('transitions copied to another menu', await p.evaluate(() => [...document.querySelectorAll('#edPanel .ed-dir[data-menu="online"] input[data-act=fl-tword]')].some(i => i.value === 'Start game')));
  // menus and states renamed, a state added
  await p.fill('#edPanel [data-menu="room"] input.ed-mname', 'Lobby!'); await p.press('#edPanel [data-menu="room"] input.ed-mname', 'Enter');
  T.ok('a menu renamed: every box of it', await p.evaluate(() => [...document.querySelectorAll('#edPanel .ed-node[data-node^="room@"] .m')].every(t => /Lobby!/.test(t.textContent))));
  answers.push('Watching a replay'); await p.click('#edPanel [data-act=fl-addstate]');
  T.ok('a state added, and offered for boxes', await p.evaluate(() => [...document.querySelectorAll('#flState option')].some(o => o.textContent === 'Watching a replay')));
  await p.click('#edPanel [data-tab=layout]'); await p.evaluate(() => { const l = document.querySelector('#sMode label[data-v="local"]'); l.click(); });
  // options in a game
  await p.click('#edPanel [data-tab=options]'); await p.click('#edPanel [data-act=opt][data-area=colors][data-v=b]'); await p.click('#edPanel [data-act=opt][data-area=reshuffle][data-v=c]');
  await p.click('#edPanel [data-act=opt][data-area="b.acc"][data-v="3"]'); await p.click('#edPanel [data-act=opt-reset][data-v=look]');
  T.ok('a look\'s rows reset to its own', await p.evaluate(() => document.documentElement.dataset.edacc === '1' && document.documentElement.dataset.edcolors === 'b'));
  T.ok('a game feature is the page\'s own setting, set from Options', await p.evaluate(() => window.__ED.UI.reshuffle === 'riffle'));
  await p.evaluate(() => document.querySelector('#sGo').click()); await p.waitForFunction(() => window.__ED.S && !window.__ED.UI.preview && !document.querySelector('#menu').open, null, { timeout: 8000 }); await settle(p);
  T.ok('an option shows in a game (Brass: the whole look, the menu panel too)', await p.evaluate(() => document.documentElement.dataset.edcolors === 'b' && getComputedStyle(document.querySelector('#menu .mframe')).borderTopColor === 'rgb(185, 141, 75)' && document.querySelectorAll('#cards .card').length > 0));
  await p.click('#edPanel [data-act=mini]'); T.ok('the panel shrinks to its title', !(await p.$('#edPanel .ed-body'))); await p.click('#edPanel [data-act=mini]');
  await p.click('#edPanel [data-tab=export]'); const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#edPanel [data-act=download]')]);
  const txt = require('fs').readFileSync(await dl.path(), 'utf8'); T.ok('the design downloads as a file', /"main"/.test(txt) && /"arrows"/.test(txt) && /"kind": "link"/.test(txt) && /"bar": "bottom"/.test(txt) && /"bar": "top"/.test(txt), dl.suggestedFilename());
  const p2 = await openPage(b, 'no edit'); const reqs = []; p2.on('request', q => reqs.push(q.url())); await p2.goto(srv.url); await p2.waitForFunction(() => window.__ED && document.querySelector('#menu').open); await p2.waitForTimeout(800);
  T.ok('without ?edit the editor is never fetched', !reqs.some(u => /\/ed\.[0-9a-f]+\.js/.test(u)) && !(await p2.$('#edPanel')));
  T.ok('no page errors (assertions included)', !p.errors.length && !p2.errors.length, [...p.errors, ...p2.errors].slice(0, 3).join(' | '));
  await b.close(); srv.close(); T.done();
})();
