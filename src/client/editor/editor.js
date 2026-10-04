/* The design editor (owner, 2026-10-05): a mockup tool, loaded only from a link with ?edit (main.js); a page without it never
   fetches this file, so it costs nothing. It changes only this browser's view. Deliberately small (owner: more choice was
   decision paralysis); each part answers one question:
   - Layout: where does each thing go on this screen? Blocks moved on a fixed grid, a third, half or the whole width, hidden,
     tucked behind "More options", or put in the screen's top or bottom bar (each stays at its edge while the content
     scrolls under it), or deleted; any text changed (a double-click, then type); a list that scrolls shown whole or cut to
     its first few, so the screen scrolls instead. How anything looks is not chosen here.
   - Flow: which screens are there, and how does one get from one to another? Screens in three columns, one per state the
     player can be in (nowhere, in a game, in a room: always exactly one), buttons as arrows between screens of the same
     state, and the screen the menu opens on in each.
   - Options: how it looks, as a few sets to flip between (button colours, button shapes, headings); each set is
     designed, not adjusted here. Also game features to try out (how a reshuffle shows): the page's own, off unless set here.
   - Export: the design downloaded as a file (and loaded from one) for the owner to send; it is built into the page
     properly afterwards. Nothing here ships as the page's own. */
const ED = window.__ED, KEY = 'eldorado-design', $ = s => document.querySelector(s), form = $('#mform');
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }; // (expected: storage off, or an old text)
const fresh = () => ({ v: 4, options: {}, screens: {}, extra: [], first: {}, states: {} });
const D = (d => d && d.v === 4 ? d : fresh())(load()); // (a design from an older editor: started afresh)
const COLS = 6, WIDTHS = [[2, 'Third'], [3, 'Half'], [6, 'Full']];

/* every change is kept (in this browser) and can be undone: Ctrl+Z, Ctrl+Shift+Z, as in any editor */
const snap = () => JSON.stringify(D); let last = snap(), undos = [], redos = [];
const save = () => { const now = snap(); if (now !== last) { undos.push(last); if (undos.length > 200) undos.shift(); redos = []; last = now; }
  try { localStorage.setItem(KEY, now); } catch (e) { /* expected: storage off; the design lives in Export */ } };
function restore(txt) { for (const k of Object.keys(D)) delete D[k]; Object.assign(D, JSON.parse(txt)); last = txt; try { localStorage.setItem(KEY, txt); } catch (e) { /* expected: storage off */ } sel = null; applyOptions(); layout(); }
const undo = () => { if (!undos.length) return; redos.push(last); restore(undos.pop()); }, redo = () => { if (!redos.length) return; undos.push(last); restore(redos.pop()); };

/* ---------- options: sets to flip between ---------- */
const AREAS = [
  { id: 'colors', name: 'Button colours', options: [['a', 'Current'], ['b', 'Brass'], ['c', 'Jungle']] },
  { id: 'shape', name: 'Button shape', options: [['a', 'Current'], ['b', 'Rounded'], ['c', 'Square']] },
  { id: 'heads', name: 'Headings', options: [['a', 'Current'], ['b', 'Serif'], ['c', 'Large serif']] },
  // a game feature, not a look: the page's own setting (UI.reshuffle, hand.js), which only this sets until one is chosen
  { id: 'reshuffle', name: 'Reshuffle', options: [['a', 'Current'], ['b', 'Cards fly over'], ['c', 'Fly over, riffle']], set: v => { ED.UI.reshuffle = { a: 'instant', b: 'gather', c: 'riffle' }[v]; } },
];
const applyOptions = () => { for (const a of AREAS) { const v = D.options[a.id] || 'a'; if (a.set) a.set(v); else document.documentElement.dataset['ed' + a.id] = v; } ED.render(); };

/* ---------- the player's state, and the screens of each ---------- */
const STATES = [['none', 'Nowhere'], ['game', 'In a game'], ['room', 'In a room']];
const HOME = { setup: 'none', online: 'none', replays: 'none', room: 'room' }; // (the page's own screens)
const stateOf = sc => D.states[sc] || HOME[sc] || 'none';
const stateNow = () => ED.online() && ED.NET.room ? 'room' : ED.S && !ED.S.over && !ED.G.replay ? 'game' : 'none';
const sections = () => [...form.querySelectorAll(':scope > section[data-screen]')];
const conf = sc => D.screens[sc] || (D.screens[sc] = { blocks: {} });

/* ---------- blocks: what is directly in a screen, named once by where it first stood; a row of buttons is its buttons ---------- */
const name = el => el.dataset.edk || (el.dataset.edk = el.id ? '#' + el.id : (el.parentElement.matches('section') ? el.parentElement.dataset.screen : name(el.parentElement)) + '>' + [...el.parentElement.children].indexOf(el));
for (const s of sections()) for (const el of s.querySelectorAll('*')) name(el); // (named before anything moves)
const byName = k => form.querySelector(`[data-edk="${CSS.escape(k)}"]`);
const buttonRow = el => el.children.length > 1 && [...el.children].every(c => c.matches('button, a.btn'));
const items = s => { const out = []; for (const el of s.children) { if (el.classList.contains('ed-grid')) continue;
    if (el.classList.contains('ed-bar')) { for (const c of el.children) out.push([name(c), c]); continue; } // (the top and bottom bars' blocks)
    if (buttonRow(el)) { el.classList.add('ed-row'); for (const c of el.children) out.push([name(c), c]); } else out.push([name(el), el]); } return out; };
// the screens added here, the buttons that go to a screen, and blocks moved to another screen
function build() {
  for (const x of D.extra) if (!form.querySelector(`section[data-screen="${CSS.escape(x)}"]`)) { const s = document.createElement('section'); s.dataset.screen = x; s.hidden = true; s.dataset.ed = '1'; form.appendChild(s); }
  for (const s of sections()) if (s.dataset.ed && !D.extra.includes(s.dataset.screen)) s.remove();
  for (const s of sections()) { const c = D.screens[s.dataset.screen]; if (!c) continue;
    for (const [k, b] of Object.entries(c.blocks)) { let el = byName(k);
      if (b.go && !el) { el = document.createElement('button'); el.type = 'button'; el.className = 'btn'; el.dataset.edk = k; s.appendChild(el); }
      if (!el) continue; if (b.go) { el.textContent = b.label; el.dataset.edGo = b.go; }
      if (el.closest('section') !== s) s.appendChild(el); } }
  for (const el of form.querySelectorAll('[data-ed-go]')) { const s = el.closest('section'), c = s && D.screens[s.dataset.screen]; if (!c || !c.blocks[el.dataset.edk]) el.remove(); }
}

/* ---------- which screen is on show ---------- */
let edScreen = null, sel = null, foldOpen = false, wasOpen = false, tab = 'layout'; // (edScreen: a screen the editor shows, the page's own choice aside)
const shown = () => { const m = $('#menu'); return m && m.open ? form.querySelector(':scope > section[data-screen]:not([hidden])') : null; };
function show() { const m = $('#menu'), open = !!(m && m.open);
  if (open && !wasOpen) edScreen = D.first[stateNow()] || null; wasOpen = open; if (!open) return; // (opened: on the screen the design starts with here)
  if (edScreen) for (const s of sections()) { const want = s.dataset.screen !== edScreen; if (s.hidden !== want) s.hidden = want; }
  else for (const s of sections()) if (s.dataset.ed && !s.hidden) s.hidden = true; }
const go = sc => { edScreen = sc; foldOpen = false; sel = null; ED.render(); layout(); };
addEventListener('click', e => { const g = e.target.closest('[data-ed-go]'); if (!g || editing()) return; e.preventDefault(); e.stopPropagation(); go(g.dataset.edGo); }, true);

/* ---------- laying the screen on show out on the grid ---------- */
let editOn = false; const editing = () => editOn; // (Edit mode: off until the owner turns it on)
function layout() {
  build(); show();
  const s = shown(); for (const x of sections()) if (x !== s) unlay(x);
  if (!s) { panel(); placeGlass(); return; }
  const c = conf(s.dataset.screen); s.classList.add('ed-laid'); s.classList.toggle('ed-on', editing());
  Object.assign(s.style, { display: 'grid', gridTemplateColumns: `repeat(${COLS},minmax(0,1fr))`, gridAutoRows: 'minmax(40px,auto)', gap: '10px', position: 'relative' });
  let row = 1; const its = items(s);
  for (const [k, el] of its) { const b = c.blocks[k] || (c.blocks[k] = { c: 1, r: row, w: COLS }); if (!b.go) delete b.label; row = Math.max(row, b.r + 1);
    if (b.bar === true) b.bar = 'bottom'; // (an earlier design: one bar, at the bottom)
    el.style.gridColumn = `${b.c} / span ${b.w}`; el.style.gridRow = String(b.r + 1); el.classList.add('ed-item'); el.classList.toggle('ed-inbar', !!b.bar); // (row 1: the top bar's)
    const off = b.del || ((b.hide || (b.fold && !foldOpen)) && !editing()); el.style.display = off ? 'none' : '';
    if (b.listk) { const l = byName(b.listk); if (l) { if (b.list) l.dataset.edList = b.list; else delete l.dataset.edList; } }
    el.classList.toggle('ed-hidden', !!b.hide); el.classList.toggle('ed-folded', !!b.fold); el.classList.toggle('ed-sel', editing() && k === sel); }
  // text changed here (a leaf's words; a button made here keeps its words as its label)
  for (const [k, t] of Object.entries(c.text || {})) { const el = byName(k); if (el && !el.isContentEditable && !el.children.length && el.textContent !== t) el.textContent = t; }
  // the top and bottom bars: the blocks put in each, in their order, staying at the screen's edge while the rest scrolls under
  // (each block back where it was when taken out)
  for (const side of ['top', 'bottom']) { let bar = s.querySelector(`:scope > .ed-bar-${side}`); const inBar = its.filter(([k]) => c.blocks[k].bar === side);
    if (inBar.length && !bar) { bar = document.createElement('div'); bar.className = `ed-bar ed-bar-${side}`; if (side === 'top') s.prepend(bar); else s.appendChild(bar); }
    for (const [k, el] of its) { const b = c.blocks[k];
      if (b.bar === side && el.parentElement !== bar) { if (!el.parentElement.classList.contains('ed-bar')) el.__home = [el.parentElement, el.nextSibling]; bar.appendChild(el); }
      else if (b.bar !== side && bar && el.parentElement === bar && !b.bar) { const [p, n] = el.__home || [s, null]; p.insertBefore(el, n && n.parentElement === p ? n : null); } }
    if (bar) { for (const [k, el] of inBar) { el.style.order = c.blocks[k].c; el.style.gridColumn = el.style.gridRow = ''; } if (!inBar.length) bar.remove(); else if (side === 'bottom') bar.style.gridRow = String(row + 2); } } // (the row after the last block's)
  // a screen with blocks behind "More options" has its button, a block like the others
  const fk = s.dataset.screen + '>more'; let more = byName(fk); const anyFold = its.some(([k]) => c.blocks[k].fold);
  if (anyFold && !more) { more = document.createElement('button'); more.type = 'button'; more.className = 'btn ed-more'; more.dataset.edk = fk; s.appendChild(more); return layout(); }
  if (!anyFold && more) { more.remove(); delete c.blocks[fk]; }
  if (more) more.textContent = foldOpen ? 'Fewer options' : 'More options';
  let g = s.querySelector(':scope > .ed-grid'); if (editing()) { if (!g) { g = document.createElement('div'); g.className = 'ed-grid'; s.appendChild(g); }
    g.style.gridTemplateRows = getComputedStyle(s).gridTemplateRows; const n = COLS * Math.max(row, 2); if (g.children.length !== n) g.innerHTML = '<i></i>'.repeat(n); } else if (g) g.remove();
  panel(); placeGlass();
}
function unlay(s) { if (!s.classList.contains('ed-laid')) return; s.classList.remove('ed-laid', 'ed-on'); for (const p of ['display', 'gridTemplateColumns', 'gridAutoRows', 'gap', 'position']) s.style[p] = '';
  s.querySelectorAll('.ed-item').forEach(el => { el.style.gridColumn = el.style.gridRow = ''; if (el.classList.contains('ed-hidden') || el.classList.contains('ed-folded')) el.style.display = ''; el.classList.remove('ed-item', 'ed-hidden', 'ed-folded', 'ed-sel'); });
  for (const bar of s.querySelectorAll(':scope > .ed-bar')) { for (const el of [...bar.children]) { const [p, n] = el.__home || [s, null]; el.style.order = ''; p.insertBefore(el, n && n.parentElement === p ? n : null); } bar.remove(); }
  s.querySelectorAll('[data-ed-list]').forEach(el => { delete el.dataset.edList; });
  s.querySelectorAll('.ed-row').forEach(el => el.classList.remove('ed-row')); s.querySelectorAll('.ed-inbar').forEach(el => el.classList.remove('ed-inbar')); const g = s.querySelector(':scope > .ed-grid'); if (g) g.remove(); }
addEventListener('click', e => { if (!editing() && e.target.closest('.ed-more')) { e.preventDefault(); e.stopPropagation(); foldOpen = !foldOpen; layout(); } }, true);

/* ---------- moving blocks and setting their width (the menu isn't used meanwhile) ---------- */
function cellAt(s, x, y) { const r = s.getBoundingClientRect(), cs = getComputedStyle(s), pl = parseFloat(cs.paddingLeft), pt = parseFloat(cs.paddingTop);
  const cw = (r.width - pl - parseFloat(cs.paddingRight) - (COLS - 1) * 10) / COLS, col = Math.floor((x - r.left - pl) / (cw + 10)) + 1;
  let yy = r.top + pt, row = 1; for (const h of cs.gridTemplateRows.split(' ').map(parseFloat)) { if (y < yy + h + 5) break; yy += h + 10; row++; }
  return [Math.max(1, Math.min(COLS, col)), Math.max(1, row - 1)]; } // (grid row 1: the top bar's)
// the list a block holds that scrolls on its own, if any (Replays' recent games): measured only for the block chosen
const listIn = el => [el, ...el.querySelectorAll('*')].find(x => /(auto|scroll)/.test(getComputedStyle(x).overflowY)); // (empty or not: a list box)
const nearestW = w => WIDTHS.map(([v]) => v).reduce((a, v) => Math.abs(v - w) < Math.abs(a - w) ? v : a);
const fit = b => { b.c = Math.max(1, Math.min(COLS - b.w + 1, b.c)); b.r = Math.max(1, b.r); };
let drag = null; // (a block being moved or stretched)
/* in Edit mode a sheet lies over the menu and takes every press: the editor finds the block under it (a press chooses and
   drags it; near its right edge, its width) and nothing of the menu's own can react (2026-10-05: a press meant to choose Start
   started the game, the page's own listeners running before the editor's). Out of it the sheet is gone and the page works as
   ever (owner: one switch, Edit / Stop editing, always in sight). The sheet passes the wheel on: the screen still scrolls */
const glass = document.createElement('div'); glass.id = 'edGlass'; glass.hidden = true; document.body.appendChild(glass);
const under = (x, y) => document.elementsFromPoint(x, y).find(el => el !== glass && !glass.contains(el));
// (over the screen being edited only, as much of it as the menu shows: its tabs stay usable, to go to another screen)
function placeGlass() { const s = shown(); glass.hidden = !(editing() && s && !typing); if (glass.hidden) return; const r = s.getBoundingClientRect(), f = form.getBoundingClientRect();
  const top = Math.max(r.top, f.top), bottom = Math.min(r.bottom, f.bottom); Object.assign(glass.style, { left: f.left + 'px', top: top + 'px', width: f.width + 'px', height: Math.max(0, bottom - top) + 'px' }); }
addEventListener('resize', placeGlass); form.addEventListener('scroll', placeGlass, { passive: true });
glass.addEventListener('wheel', e => { form.scrollTop += e.deltaY; e.preventDefault(); }, { passive: false });
const edge = (el, x) => x > el.getBoundingClientRect().right - 12;
glass.addEventListener('pointermove', e => { if (drag) return; const s = shown(), t = under(e.clientX, e.clientY), el = t && t.closest('.ed-item');
  glass.style.cursor = el && s && s.contains(el) ? (edge(el, e.clientX) ? 'ew-resize' : 'move') : ''; });
glass.addEventListener('pointerdown', e => { const s = shown(), t = under(e.clientX, e.clientY); if (!s || !t || !s.contains(t)) { sel = null; return layout(); }
  const hit = items(s).find(([, el]) => el.contains(t)); if (!hit) { sel = null; return layout(); } e.preventDefault(); const [k, el] = hit; sel = k;
  const b = conf(s.dataset.screen).blocks[k], [cc, rr] = cellAt(s, e.clientX, e.clientY); drag = { k, width: edge(el, e.clientX), dc: cc - b.c, dr: rr - b.r }; glass.setPointerCapture(e.pointerId); layout(); });
addEventListener('pointermove', e => { if (!drag) return; const s = shown(); if (!s) { drag = null; return; } const b = conf(s.dataset.screen).blocks[drag.k], [cc, rr] = cellAt(s, e.clientX, e.clientY);
  if (drag.width) b.w = nearestW(cc - b.c + 1); else { b.c = cc - drag.dc; b.r = rr - drag.dr; } fit(b); layout(); }, true);
addEventListener('pointerup', () => { if (drag) { drag = null; save(); layout(); } }, true);
// words: a double-click on any text (a heading, a label, a line, a button) makes it typeable, the sheet set aside meanwhile;
// Enter, Escape or a click elsewhere keeps it
let typing = false;
glass.addEventListener('dblclick', e => { const s = shown(), t = under(e.clientX, e.clientY); if (!s || !t || !s.contains(t) || t.children.length || !t.textContent.trim()) return;
  e.preventDefault(); typing = true; placeGlass(); t.contentEditable = 'plaintext-only'; t.focus(); getSelection().selectAllChildren(t);
  const done = () => { t.removeEventListener('blur', done); t.removeAttribute('contenteditable'); typing = false; const c = conf(s.dataset.screen), w = t.textContent.trim().slice(0, 120), b = c.blocks[t.dataset.edk];
    if (b && b.go) b.label = w || b.label; else (c.text || (c.text = {}))[name(t)] = w; save(); layout(); };
  t.addEventListener('blur', done); t.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); t.blur(); } ev.stopPropagation(); }); });
// the keys every editor has: arrows move the chosen block a cell, Delete hides it, Escape lets go, Ctrl+Z / Ctrl+Shift+Z
// (only while laying out: the game's own Ctrl+Z stays the game's)
addEventListener('keydown', e => { if (!editing() || e.target.isContentEditable || (e.target.closest && e.target.closest('input, textarea, select'))) return; const s = shown(); if (!s) return;
  const k = e.key.toLowerCase(); if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) { e.preventDefault(); e.stopPropagation(); if (e.shiftKey || k === 'y') redo(); else undo(); return; }
  if (e.key === 'Escape' && sel) { sel = null; layout(); e.preventDefault(); e.stopPropagation(); return; }
  const b = sel && conf(s.dataset.screen).blocks[sel]; if (!b) return;
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (d) { b.c += d[0]; b.r += d[1]; fit(b); } else if (e.key === 'Delete' || e.key === 'Backspace') { b.del = true; sel = null; } else return;
  e.preventDefault(); e.stopPropagation(); save(); layout(); }, true);

/* ---------- the panel ---------- */
const box = document.createElement('div'); box.id = 'edPanel'; document.body.appendChild(box);
let at = { x: null, y: 12 }, mini = false; // (mini: only its title bar, out of the game's way)
const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const row = (label, inner) => `<div class="ed-r"><b>${label}</b><span>${inner}</span></div>`;
const btn = (act, label, on, v = '', extra = '') => `<button data-act="${act}" data-v="${esc(v)}" class="${on ? 'on' : ''}" ${extra}>${label}</button>`;
function layoutBody() {
  const s = shown(); if (!s) return `<p>Open the menu to lay out its screens.</p>${btn('openmenu', 'Open the menu')}`;
  const sc = s.dataset.screen, b = sel && conf(sc).blocks[sel];
  return `<p>Screen <b>${esc(sc)}</b> (${STATES.find(([v]) => v === stateOf(sc))[1].toLowerCase()})</p>`
    + (b ? (b.bar ? `<p class="ed-hint">In the ${b.bar} bar: drag it left or right (or use the arrows) to order the bar.</p>` : row('Width', WIDTHS.map(([v, n]) => btn('w', n, b.w === v, v)).join('')))
      + row('Place', btn('bar', 'On the screen', !b.bar, '') + btn('bar', 'Top bar', b.bar === 'top', 'top') + btn('bar', 'Bottom bar', b.bar === 'bottom', 'bottom'))
      + row('', btn('hide', 'Hidden', b.hide) + btn('fold', 'In More options', b.fold) + btn('del', 'Delete'))
      + ((l => l ? row('List', [['', 'Scrolls'], ['all', 'Shows all'], ['3', 'First 3'], ['5', 'First 5'], ['10', 'First 10']].map(([v, n]) => btn('list', n, (b.list || '') === v, v)).join('')) : '')(byName(sel) && listIn(byName(sel))))
      : (editing() ? '<p class="ed-hint">Drag a block to move it; drag its right edge to make it a third, half or the whole width. Click a block to choose it. Double-click any text to change it. Arrows move the chosen block, Delete deletes it, Ctrl+Z undoes. Stop editing to use the menu.</p>' : '<p class="ed-hint">Press Edit (top of this panel) to lay this screen out; until then the menu works as usual.</p>'))
    + ((n => n ? `<p>${btn('undel', `Bring back deleted blocks (${n})`)}</p>` : '')(Object.values(conf(sc).blocks).filter(x => x.del).length))
    + `<hr>${btn('reset', 'This screen back to the page\'s own')}`;
}
function flowBody() {
  const all = sections().map(s => s.dataset.screen), goes = {}; // (screen → the screens its buttons go to)
  for (const sc of all) goes[sc] = Object.entries((D.screens[sc] || { blocks: {} }).blocks).filter(([, b]) => b.go).map(([k, b]) => [k, b.go, b.label]);
  return `<div class="ed-flow">${STATES.map(([st, n]) => `<div class="ed-col"><h4>${n}</h4>${all.filter(x => stateOf(x) === st).map(x => `<div class="ed-box${D.first[st] === x ? ' first' : ''}" data-sc="${esc(x)}">
      <div class="ed-bt"><b>${esc(x)}</b>${btn('first', D.first[st] === x ? '★ opens here' : '☆', D.first[st] === x, x, `data-st="${st}" title="The menu opens on this screen in this state"`)}</div>
      ${goes[x].map(([k, to, label]) => `<div class="ed-arrow">→ <b>${esc(to)}</b> <i>“${esc(label)}”</i> ${btn('rmgo', '×', false, k, `data-sc="${esc(x)}" title="Remove this button"`)}</div>`).join('')}
      <div class="ed-bt">${all.filter(y => y !== x && stateOf(y) === st).length ? `<select data-act="addgo" data-sc="${esc(x)}"><option value="">+ button to…</option>${all.filter(y => y !== x && stateOf(y) === st).map(y => `<option>${esc(y)}</option>`).join('')}</select>` : ''}
      ${btn('open', 'Lay out', false, x)}${D.extra.includes(x) ? btn('rmscreen', 'Remove', false, x) : ''}</div></div>`).join('')}
      ${btn('newscreen', '+ Screen', false, st)}</div>`).join('')}</div>`;
}
function panel() {
  const body = mini ? '' : tab === 'layout' ? layoutBody() : tab === 'flow' ? flowBody()
    : tab === 'options' ? AREAS.map(a => row(a.name, a.options.map(([id, n]) => btn('opt', n, (D.options[a.id] || 'a') === id, id, `data-area="${a.id}"`)).join(''))).join('')
    : `<p>Your design is kept in this browser as you go. To send it to me, download it and attach the file.</p>${row('', btn('download', 'Download design') + btn('import', 'Load a design file…'))}${row('', btn('clear', 'Start over'))}`;
  const html = `<div class="ed-head"><b>Design</b><button data-act="editmode" class="ed-edit${editOn ? ' on' : ''}" title="${editOn ? 'Stop editing: the menu works again' : 'Edit the menu on show: clicks move and choose its blocks'}">${editOn ? '■ Stop editing' : '✎ Edit'}</button><span>${mini ? '' : ['layout', 'flow', 'options', 'export'].map(t => `<button data-tab="${t}" class="${tab === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}`
    + `${btn('undo', '↶', false, '', `title="Undo (Ctrl+Z)" ${undos.length ? '' : 'disabled'}`)}${btn('redo', '↷', false, '', `title="Redo (Ctrl+Shift+Z)" ${redos.length ? '' : 'disabled'}`)}${btn('mini', mini ? '▾' : '▴', false, '', `title="${mini ? 'Open' : 'Shrink it out of the way'}"`)}</span></div>${mini ? '' : `<div class="ed-body">${body}</div>`}`;
  if (box.__h !== html) { box.__h = html; box.innerHTML = html; }
  box.classList.toggle('wide', tab === 'flow' && !mini); box.classList.toggle('editing', editOn);
  box.style.left = at.x === null ? '' : at.x + 'px'; box.style.right = at.x === null ? '12px' : ''; box.style.top = at.y + 'px';
}
function act(t, a, v) {
  const s = shown(), sc = s && s.dataset.screen, b = sc && sel && conf(sc).blocks[sel];
  if (a === 'editmode') { editOn = !editOn; sel = null; if (editOn) { tab = 'layout'; mini = false; } }
  else if (a === 'mini') mini = !mini; else if (a === 'undo') return undo(); else if (a === 'redo') return redo();
  else if (a === 'opt') D.options[t.dataset.area] = v;
  else if (a === 'openmenu') { const m = $('#menuBtn'); if (m) m.click(); }
  else if (b && a === 'w') { b.w = +v; fit(b); }
  else if (b && a === 'del') { if (b.go) { const el = byName(sel); if (el) el.remove(); delete conf(sc).blocks[sel]; } else b.del = true; sel = null; }
  else if (a === 'undel') { for (const x of Object.values(conf(sc).blocks)) delete x.del; }
  else if (b && a === 'list') { const l = listIn(byName(sel)); if (l) { b.listk = name(l); b.list = v || undefined; } } else if (b && (a === 'hide' || a === 'fold')) b[a] = !b[a] || undefined; else if (b && a === 'bar') b.bar = v || undefined;
  else if (a === 'reset') { delete D.screens[sc]; sel = null; unlay(s); }
  else if (a === 'first') D.first[t.dataset.st] = D.first[t.dataset.st] === v ? undefined : v;
  else if (a === 'addgo' && v) { const from = conf(t.dataset.sc), label = (prompt(`The button's words (it goes to "${v}")`, v[0].toUpperCase() + v.slice(1)) || '').trim().slice(0, 40); if (!label) return panel();
    from.blocks[t.dataset.sc + '>go' + Date.now().toString(36)] = { c: 1, r: 99, w: COLS, go: v, label }; }
  else if (a === 'rmgo') { const c = conf(t.dataset.sc), el = byName(v); if (el) el.remove(); delete c.blocks[v]; }
  else if (a === 'newscreen') { const n = (prompt('A name for the new screen (for example: title)') || '').trim().replace(/[^\w -]/g, '').slice(0, 24); if (!n || sections().some(x => x.dataset.screen === n)) return;
    D.extra.push(n); D.states[n] = v; conf(n); }
  else if (a === 'rmscreen') { if (!confirm(`Remove the screen "${v}"? Its blocks go back where they came from.`)) return; D.extra = D.extra.filter(x => x !== v); delete D.screens[v]; delete D.states[v];
    for (const st of Object.keys(D.first)) if (D.first[st] === v) delete D.first[st]; for (const c of Object.values(D.screens)) for (const [k, bb] of Object.entries(c.blocks)) if (bb.go === v) delete c.blocks[k];
    if (edScreen === v) edScreen = null; save(); location.reload(); return; }
  else if (a === 'open') { tab = 'layout'; const m = $('#menu'); if (!m.open) { const mb = $('#menuBtn'); if (mb) mb.click(); } go(v); return; }
  else if (a === 'download') { const u = URL.createObjectURL(new Blob([JSON.stringify(D, null, 1)], { type: 'application/json' })), l = document.createElement('a');
    l.href = u; l.download = `eldorado-design-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); return; }
  else if (a === 'import') { const f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json';
    f.onchange = () => f.files[0] && f.files[0].text().then(txt => { const n = JSON.parse(txt); if (!n || n.v !== 4) throw new Error('not a design from this editor');
      localStorage.setItem(KEY, JSON.stringify(n)); location.reload(); }).catch(err => alert('That file isn\'t a design: ' + err.message)); f.click(); return; }
  else if (a === 'clear') { if (!confirm('Start over: forget this design?')) return; localStorage.removeItem(KEY); location.reload(); return; }
  save(); applyOptions(); layout();
}
box.addEventListener('click', e => { const t = e.target.closest('button'); if (!t || t.disabled) return; if (t.dataset.tab) { tab = t.dataset.tab; mini = false; sel = null; layout(); return; } act(t, t.dataset.act, t.dataset.v); });
box.addEventListener('change', e => { const t = e.target; if (t.matches('select[data-act]')) act(t, t.dataset.act, t.value); });
box.addEventListener('pointerdown', e => { if (!e.target.closest('.ed-head') || e.target.closest('button')) return; const r = box.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
  const mv = ev => { at = { x: Math.max(0, ev.clientX - ox), y: Math.max(0, ev.clientY - oy) }; panel(); }, up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); });
// the menu's own screens change by its own clicks: the layout follows whichever is on show
new MutationObserver(() => { if (!drag) layout(); }).observe($('#menu'), { attributes: true, subtree: true, attributeFilter: ['hidden', 'open'] });

/* ---------- styles: the editor's own, and the option sets' ---------- */
const css = document.createElement('style'); css.textContent = `
#edGlass{position:fixed;z-index:1990;background:transparent;touch-action:none}#edGlass[hidden]{display:none}
#edPanel{position:fixed;z-index:2000;width:300px;max-height:86vh;overflow:auto;background:#101915f2;color:#eae3cf;border:1px solid #5b4a26;border-radius:12px;font:13px/1.35 Figtree,system-ui,sans-serif;box-shadow:0 10px 30px #0009}
#edPanel.wide{width:min(760px,96vw)}
#edPanel .ed-head{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:7px 9px;cursor:move;border-bottom:1px solid #3a3020;position:sticky;top:0;background:#101915;z-index:1}
#edPanel .ed-body{padding:8px 10px}#edPanel p{margin:6px 0}#edPanel hr{border:0;border-top:1px solid #3a3020;margin:8px 0}#edPanel .ed-hint{color:#b8b09a}
#edPanel button,#edPanel select{font:inherit;color:inherit;background:#22302a;border:1px solid #4a5a50;border-radius:7px;padding:2px 7px;margin:2px;cursor:pointer}
#edPanel button.on{background:#e9b24a;color:#2a1c05;border-color:#e9b24a}#edPanel button:disabled{opacity:.35;cursor:default}
#edPanel .ed-r{display:flex;justify-content:space-between;align-items:center;gap:6px;margin:4px 0}#edPanel .ed-r span{display:flex;flex-wrap:wrap;justify-content:flex-end}
#edPanel .ed-flow{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}#edPanel .ed-col{background:#0b120f;border-radius:10px;padding:8px}#edPanel h4{margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#b8b09a}
#edPanel .ed-box{border:1px solid #4a5a50;border-radius:9px;padding:6px;margin-bottom:8px;background:#16211c}#edPanel .ed-box.first{border-color:#e9b24a}
#edPanel .ed-bt{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:2px}#edPanel .ed-arrow{font-size:12px;margin:3px 0 3px 6px}#edPanel .ed-arrow i{color:#b8b09a}
section.ed-on .ed-item{outline:1px dashed #e9b24a88;outline-offset:2px;cursor:move;position:relative}section.ed-on .ed-item:hover{outline:1px solid #e9b24a}
#edPanel .ed-edit{font-weight:700;padding:3px 10px}#edPanel .ed-edit.on{background:#d9534f;border-color:#d9534f;color:#fff}#edPanel.editing .ed-head{background:#3a2a0c}
section.ed-on .ed-sel{outline:2px solid #e9b24a!important}section.ed-on .ed-hidden{opacity:.25}section.ed-on .ed-folded{opacity:.6;outline-style:dotted!important}
.ed-grid{position:absolute;inset:0;display:grid;grid-template-columns:repeat(${COLS},minmax(0,1fr));gap:10px;pointer-events:none;z-index:-1}.ed-grid i{border:1px dashed #ffffff1c;border-radius:4px}
.ed-laid .ed-row{display:contents!important}
[data-ed-list]{max-height:none!important;overflow:visible!important}
[data-ed-list="3"]>:nth-child(n+4),[data-ed-list="5"]>:nth-child(n+6),[data-ed-list="10"]>:nth-child(n+11){display:none!important}
section.ed-on [contenteditable]{outline:2px solid #7ec4f5!important;cursor:text;background:rgba(126,196,245,.08)}
.ed-bar{position:sticky;grid-column:1 / -1;z-index:30;isolation:isolate;display:flex;gap:10px;justify-content:flex-end;align-items:center;flex-wrap:wrap;padding:12px 26px;background:#0e1612}
.ed-bar-bottom{bottom:-26px;margin:0 -26px -26px;border-top:1px solid rgba(233,178,74,.35);box-shadow:0 -8px 18px rgba(0,0,0,.35)}
.ed-bar-top{top:-26px;grid-row:1;margin:-26px -26px 0;border-bottom:1px solid rgba(233,178,74,.35);box-shadow:0 8px 18px rgba(0,0,0,.35);justify-content:flex-start}
section.ed-on .ed-bar{outline:1px dashed #e9b24a;outline-offset:-3px}
/* button colours, by a button's role (the main action, the others): b brass on leather, c jungle green */
html[data-edcolors=b] #menu .btn,html[data-edcolors=b] #actBtns .btn{background:linear-gradient(#3a2c1b,#241a0f);color:#f1dcae;border:1px solid #b08a4a}
html[data-edcolors=b] #menu .btn.pri,html[data-edcolors=b] #actBtns .btn.pri{background:linear-gradient(#e7c27a,#b98a3c);color:#2a1c05;border-color:#f3d79c}
html[data-edcolors=c] #menu .btn,html[data-edcolors=c] #actBtns .btn{background:#17332a;color:#d8efe3;border:1px solid #2f6b55}
html[data-edcolors=c] #menu .btn.pri,html[data-edcolors=c] #actBtns .btn.pri{background:linear-gradient(#5fbf8a,#2f8a5c);color:#062014;border-color:#8fe3b8}
/* button shape: b rounded, c square */
html[data-edshape=b] .btn,html[data-edshape=b] #menu button{border-radius:999px}
html[data-edshape=c] .btn,html[data-edshape=c] #menu button{border-radius:3px}
/* headings: b serif, c large serif */
html[data-edheads=b] #menu h2,html[data-edheads=b] #menu .field>label{font-family:var(--display,'Young Serif',serif);letter-spacing:0;text-transform:none}
html[data-edheads=c] #menu h2{font-family:var(--display,'Young Serif',serif);font-size:2.1em;text-align:center}
html[data-edheads=c] #menu .field>label{font-family:var(--display,'Young Serif',serif);font-size:1.1em;letter-spacing:0;text-transform:none}
`;
document.head.appendChild(css);
applyOptions(); layout();
