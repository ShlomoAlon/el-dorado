// The design editor (src/client/editor, owner 2026-10-05): loaded only from a link with ?edit, and small: Layout, in Edit mode
// (blocks moved on a fixed grid, a third, half or the whole width, hidden, deleted, in More options, in a top or bottom bar,
// their text changed, a scrolling list shown whole or cut short; out of Edit mode the page works as ever), Flow (screens per state,
// buttons between them, the screen the menu opens on), Options (sets to flip between), Export (a file). A page without
// ?edit never fetches it.
//   NODE_PATH=$(npm root -g) node test/editor.cjs
const { chromium, serveStatic, openPage, settle, report } = require('./lib.cjs');
const T = report('editor');
(async () => {
  const srv = await serveStatic(), b = await chromium.launch();
  const p = await openPage(b, 'editor', { viewport: { width: 1536, height: 639 }, deviceScaleFactor: 1.25, acceptDownloads: true });
  const answers = []; p.on('dialog', d => d.accept(d.type() === 'prompt' ? answers.shift() || 'title' : undefined));
  // (eight finished games kept on this device, as a player has: Replays' "Your games" is a list long enough to scroll)
  const fx = require('fs').readFileSync(require('path').join(__dirname, 'fixtures/replay.json'), 'utf8');
  await p.goto(srv.url); await p.evaluate(fx => { const g = JSON.parse(fx); localStorage.setItem('eldorado-games-v2', JSON.stringify(Array.from({ length: 8 }, (_, i) => ({ ...g, created: Date.now() - i * 864e5 })))); }, fx);
  await p.goto(srv.url + '?edit'); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
  T.ok('?edit: the editor opens', await p.waitForSelector('#edPanel .ed-head', { timeout: 8000 }).then(() => true, () => false));
  const blocks = () => p.evaluate(() => [...document.querySelectorAll('#mform > section[data-screen]:not([hidden]) .ed-item')].map(e => { const r = e.getBoundingClientRect(); return { x: r.left + Math.min(30, r.width / 2), y: r.top + r.height / 2, r: r.right, k: e.dataset.edk, btn: e.matches('button') }; }));
  const col = k => p.evaluate(k => document.querySelector(`[data-edk="${CSS.escape(k)}"]`).style.gridColumn, k);
  // the menu opens where the flowchart's ★ says (nowhere: the Title, a menu the page hasn't got), its buttons the arrows'
  T.ok('the menu opens on the flowchart\'s ★: the Title, with its arrows\' buttons', await p.evaluate(() => { const s = document.querySelector('#mform > section[data-screen=title]'); return !!s && !s.hidden && /Play on this device/.test(s.textContent); }));
  await p.click('#mform > section[data-screen=title] [data-ed-go]:has-text("Play on this device")'); await p.waitForTimeout(200);
  T.ok('a button an arrow made goes where it leads (the start menu)', await p.evaluate(() => !document.querySelector('#mform > section[data-screen=setup]').hidden && document.querySelector('#mform > section[data-screen=title]').hidden));
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
  // flow: the default flowchart; a box laid out; a new menu with a button arrow back to the Title
  if (await p.$('#edPanel.editing')) await p.click('#edPanel [data-act=editmode]');
  await p.click('#edPanel [data-tab=flow]');
  T.ok('the default flowchart: boxes and arrows', await p.evaluate(() => document.querySelectorAll('#edPanel .ed-node').length >= 9 && document.querySelectorAll('#edPanel g.ed-ar').length >= 15));
  await p.click('#edPanel .ed-node[data-node="results@none"]'); await p.click('#edPanel [data-dir="results@none"] [data-act=fl-lay]');
  T.ok('"Lay out" shows that menu, with its arrows\' buttons', await p.evaluate(() => { const s = document.querySelector('#mform > section[data-screen=results]'); return !!s && !s.hidden && /Done/.test(s.textContent) && /Watch the replay/.test(s.textContent); }));
  await p.click('#edPanel [data-tab=flow]');
  answers.push('help'); await p.selectOption('#flMenu', ''); await p.click('#edPanel [data-act=fl-add]');
  answers.push('Back to the title'); await p.click('#edPanel [data-act=fl-link][data-v="help@none"][data-kind=button]'); await p.click('#edPanel .ed-node[data-node="title@none"]');
  T.ok('a new box, and an arrow drawn from it', await p.evaluate(() => !!document.querySelector('#edPanel .ed-node[data-node="help@none"]') && [...document.querySelectorAll('#edPanel text.ed-ar')].some(t => t.textContent === 'Back to the title')));
  // the directions: the arrow's tag says what it changes; made to go to Settings in any state, it changes the menu only
  T.ok('the directions list each transition, tagged with what it changes', await p.evaluate(() => { const r = [...document.querySelectorAll('#edPanel [data-dir="help@none"] .ed-dr')].find(x => x.querySelector('input').value === 'Back to the title'); return !!r && r.querySelector('.ed-tag').textContent === 'menu'; }));
  await p.click('#edPanel .ed-node[data-node="results@none"]');
  T.ok('a box clicked in the chart is shown in the directions', await p.evaluate(() => { const r = document.querySelector('#edPanel .ed-ds.on'), d = document.querySelector('#edPanel .ed-dirs'); if (!r) return false;
    const a = r.getBoundingClientRect(), b = d.getBoundingClientRect(); return r.dataset.dir === 'results@none' && a.top >= b.top - 1 && a.top < b.bottom - 20 && d.scrollTop > 0; }));
  T.ok('the chart stays whole while the directions scroll', await p.evaluate(() => { const c = document.querySelector('#edPanel .ed-fc').getBoundingClientRect(), w = document.querySelector('#edPanel .ed-flowwrap').getBoundingClientRect(); return c.top >= w.top - 1 && c.bottom <= w.bottom + 1 && document.querySelector('#edPanel').scrollTop === 0; }));
  // menus and states renamed, a state added
  await p.fill('#edPanel [data-menu="setup"] input.ed-mname', 'Main menu'); await p.press('#edPanel [data-menu="setup"] input.ed-mname', 'Enter');
  T.ok('a menu renamed: every box of it', await p.evaluate(() => [...document.querySelectorAll('#edPanel .ed-node[data-node^="setup@"] .m')].every(t => /Main menu/.test(t.textContent))));
  answers.push('Watching a replay'); await p.click('#edPanel [data-act=fl-addstate]');
  T.ok('the directions: one entry per menu, a part for each state it is in', await p.evaluate(() => document.querySelectorAll('#edPanel .ed-dir[data-menu="setup"]').length === 1 && document.querySelectorAll('#edPanel .ed-dir[data-menu="setup"] .ed-ds').length === 2));
  T.ok('a state added, and offered for boxes', await p.evaluate(() => [...document.querySelectorAll('#flState option')].some(o => o.textContent === 'Watching a replay')));
  await p.selectOption('#edPanel [data-dir="help@none"] [data-act=fl-nstate]', '*');
  T.ok('a box made any state', await p.evaluate(() => !!document.querySelector('#edPanel .ed-node[data-node="help@*"]') && !document.querySelector('#edPanel .ed-node[data-node="help@none"]')));
  { const id = await p.evaluate(() => document.querySelector('#edPanel [data-dir="setup@game"] .ed-dr[data-darrow]').dataset.darrow);
    await p.selectOption(`#edPanel [data-act=fl-ato-m][data-id="${id}"]`, 'help'); await p.selectOption(`#edPanel [data-act=fl-ato-s][data-id="${id}"]`, '*');
    T.ok('a transition to a box for any state keeps the state: it changes the menu only', await p.evaluate(id => document.querySelector(`#edPanel [data-darrow="${id}"] .ed-tag`).textContent === 'menu', id)); }
  await p.click('#edPanel .ed-node[data-node="help@*"]'); await p.click('#edPanel [data-dir="help@*"] [data-act=fl-lay]');
  await p.click('#mform > section[data-screen=help] [data-ed-go]');
  T.ok('its button goes to the Title', await p.evaluate(() => !document.querySelector('#mform > section[data-screen=title]').hidden && document.querySelector('#mform > section[data-screen=help]').hidden));
  await p.click('#mform > section[data-screen=title] [data-ed-go]:has-text("Play on this device")');
  // options in a game
  await p.click('#edPanel [data-tab=options]'); await p.click('#edPanel [data-act=opt][data-area=colors][data-v=b]'); await p.click('#edPanel [data-act=opt][data-area=reshuffle][data-v=c]');
  T.ok('a game feature is the page\'s own setting, set from Options', await p.evaluate(() => window.__ED.UI.reshuffle === 'riffle'));
  await p.evaluate(() => document.querySelector('#sGo').click()); await p.waitForFunction(() => window.__ED.S && !window.__ED.UI.preview && !document.querySelector('#menu').open, null, { timeout: 8000 }); await settle(p);
  T.ok('an option shows in a game (Brass: the whole look, the menu panel too)', await p.evaluate(() => document.documentElement.dataset.edcolors === 'b' && getComputedStyle(document.querySelector('#menu .modal')).borderTopColor === 'rgb(185, 141, 75)' && document.querySelectorAll('#cards .card').length > 0));
  await p.click('#edPanel [data-act=mini]'); T.ok('the panel shrinks to its title', !(await p.$('#edPanel .ed-body'))); await p.click('#edPanel [data-act=mini]');
  await p.click('#edPanel [data-tab=export]'); const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#edPanel [data-act=download]')]);
  const txt = require('fs').readFileSync(await dl.path(), 'utf8'); T.ok('the design downloads as a file', /"title"/.test(txt) && /"arrows"/.test(txt) && /"kind": "link"/.test(txt) && /"bar": "bottom"/.test(txt) && /"bar": "top"/.test(txt), dl.suggestedFilename());
  const p2 = await openPage(b, 'no edit'); const reqs = []; p2.on('request', q => reqs.push(q.url())); await p2.goto(srv.url); await p2.waitForFunction(() => window.__ED && document.querySelector('#menu').open); await p2.waitForTimeout(800);
  T.ok('without ?edit the editor is never fetched', !reqs.some(u => /\/ed\.[0-9a-f]+\.js/.test(u)) && !(await p2.$('#edPanel')));
  T.ok('no page errors (assertions included)', !p.errors.length && !p2.errors.length, [...p.errors, ...p2.errors].slice(0, 3).join(' | '));
  await b.close(); srv.close(); T.done();
})();
