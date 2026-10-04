/* The design editor (owner, 2026-10-05): a mockup tool, loaded only from a link with ?edit (main.js); a page without it never
   fetches this file, so it costs nothing. It changes only this browser's view. Deliberately small (owner: more choice was
   decision paralysis); each part answers one question:
   - Layout: where does each thing go on this screen? Blocks moved on a fixed grid, a third, half or the whole width, hidden,
     tucked behind "More options", or put in the screen's top or bottom bar (each stays at its edge while the content
     scrolls under it), or deleted; any text changed (a double-click, then type); a list that scrolls shown whole or cut to
     its first few, so the screen scrolls instead; a button made one of the page's own kinds (Main, Plain, Link). How
     anything looks is not chosen here.
   - Flow: how does the player get from one menu to another? One flowchart: a box is a menu in one of the three states the
     player can be in (nowhere, in a game, in a room: always exactly one), laid out on its own; an arrow is a button on it or
     something that happens, to another box (another menu, another state, or both); ★ is where the menu opens in a state.
     It starts from a default flowchart, a proposal to change.
   - Options: how it looks, as a few sets to flip between (button colours, button shapes, headings); each set is
     designed, not adjusted here. Also game features to try out (how a reshuffle shows): the page's own, off unless set here.
   - Export: the design downloaded as a file (and loaded from one) for the owner to send; it is built into the page
     properly afterwards. Nothing here ships as the page's own. */
const ED = window.__ED, KEY = 'eldorado-design', $ = s => document.querySelector(s), form = $('#mform');
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }; // (expected: storage off, or an old text)
const fresh = () => ({ v: 5, options: {}, screens: {}, extra: [], nodes: null, arrows: null, first: {} });
const D = (d => d && d.v === 5 ? d : d && d.v === 4 ? from4(d) : fresh())(load()); // (a design from an older editor: started afresh)
/* a design from the editor before the flowchart (v4): each screen's layout becomes that menu's in the state it belonged to, and
   each button made to go to a screen an arrow; the default flowchart is added around them */
function from4(d) { const st = sc => d.states[sc] || (sc === 'room' ? 'room' : 'none'), screens = {}, arrows = [];
  for (const [sc, c] of Object.entries(d.screens)) { const blocks = {};
    for (const [k, b] of Object.entries(c.blocks)) { if (!b.go) { blocks[k] = b; continue; } const id = 'v' + arrows.length, { go, label, ...rest } = b;
      arrows.push({ id, from: sc + '@' + st(sc), to: go + '@' + st(go), label, kind: 'button' }); blocks['go:' + id] = rest; }
    screens[sc + '@' + st(sc)] = { ...c, blocks }; }
  return { v: 5, options: d.options, screens, extra: d.extra, nodes: null, arrows, first: d.first }; }
const COLS = 6, WIDTHS = [[2, 'Third'], [3, 'Half'], [6, 'Full']];
/* a button's kind: one of the page's own (its looks are designed, not chosen here): Main (gold), Plain, Link (underlined words) */
const KINDS = [['pri', 'Main'], ['plain', 'Plain'], ['link', 'Link']];
const kindOf = el => el.classList.contains('linkbtn') ? 'link' : el.classList.contains('pri') ? 'pri' : 'plain';
function setKind(el, k) { if (!el.matches('button')) return; if (el.__kind === undefined) el.__kind = [kindOf(el), el.classList.contains('big')]; // (the page's own: back when unset)
  const [k0, big] = el.__kind; k = k || k0; el.classList.toggle('btn', k !== 'link'); el.classList.toggle('pri', k === 'pri'); el.classList.toggle('linkbtn', k === 'link'); el.classList.toggle('big', big && k !== 'link'); }

/* every change is kept (in this browser) and can be undone: Ctrl+Z, Ctrl+Shift+Z, as in any editor */
const snap = () => JSON.stringify(D); let last = snap(), undos = [], redos = [];
const save = () => { const now = snap(); if (now !== last) { undos.push(last); if (undos.length > 200) undos.shift(); redos = []; last = now; }
  try { localStorage.setItem(KEY, now); } catch (e) { /* expected: storage off; the design lives in Export */ } };
function restore(txt) { for (const k of Object.keys(D)) delete D[k]; Object.assign(D, JSON.parse(txt)); last = txt; try { localStorage.setItem(KEY, txt); } catch (e) { /* expected: storage off */ } sel = null; applyOptions(); layout(); }
const undo = () => { if (!undos.length) return; redos.push(last); restore(undos.pop()); }, redo = () => { if (!redos.length) return; undos.push(last); restore(redos.pop()); };

/* ---------- options: sets to flip between ---------- */
const AREAS = [
  { id: 'colors', name: 'Look', options: [['a', 'Current'], ['b', 'Brass'], ['c', 'Jungle'], ['d', 'Water']] },
  { id: 'shape', name: 'Button shape', options: [['a', 'Current'], ['b', 'Rounded'], ['c', 'Square']] },
  { id: 'heads', name: 'Headings', options: [['a', 'Current'], ['b', 'Serif'], ['c', 'Large serif']] },
  // a game feature, not a look: the page's own setting (UI.reshuffle, hand.js), which only this sets until one is chosen
  { id: 'reshuffle', name: 'Reshuffle', options: [['a', 'Current'], ['b', 'Cards fly over'], ['c', 'Fly over, riffle']], set: v => { ED.UI.reshuffle = { a: 'instant', b: 'gather', c: 'riffle' }[v]; } },
];
const applyOptions = () => { for (const a of AREAS) { const v = D.options[a.id] || 'a'; if (a.set) a.set(v); else document.documentElement.dataset['ed' + a.id] = v; } ED.render(); };

/* ---------- the flowchart: menus in states, and the arrows between them (owner, 2026-10-05) ----------
   The player is always in one state (nowhere, in a game, in a room). A box is a menu as it is in one state: the start menu
   nowhere and the same menu in a game are one menu that looks different, so each box is laid out on its own. An arrow is what
   takes the player from one box to another, a button on that menu or something that happens (dashed), changing the menu, the
   state or both. The board and the replay viewer are boxes too, with no menu to lay out. The default flowchart is a proposal
   (owner: "design a flowchart that you think makes sense"), not the page as it is: a menu it names that the page hasn't got
   is a blank screen to lay out, a button the page hasn't got is made on its menu, one it has is the page's own (el) */
const STATES = [['none', 'Nowhere'], ['game', 'In a game'], ['room', 'In a room']];
const stLabel = st => st === '*' ? 'Any state' : (STATES.find(([v]) => v === st) || [st, st])[1]; // (*: a box for any state; an arrow to one keeps the state)
/* what an arrow changes, read from its two ends (never stored, so it can't disagree with them): the menu, the state, or both */
function changes(a) { const [m1, s1] = a.from.split('@'), [m2, s2] = a.to.split('@'), menu = m1 !== m2, state = s2 !== '*' && s1 !== s2;
  return menu && state ? 'menu + state' : state ? 'state' : menu ? 'menu' : 'nothing'; }
const NOLAY = ['board', 'viewer']; // (no menu: the game, a replay)
const NAMES = { setup: 'Start menu', online: 'Online', replays: 'Replays', room: 'Room lobby', board: 'Board', viewer: 'Replay viewer', title: 'Title', results: 'Results' };
const nameOf = m => NAMES[m] || m;
const SEED = { extra: ['title', 'results'], first: { none: 'title', game: 'setup', room: 'room' },
  nodes: [['title@none', 0, 100], ['setup@none', 300, 0], ['online@none', 300, 100], ['replays@none', 300, 200], ['viewer@none', 300, 300],
    ['board@game', 600, 0], ['setup@game', 900, 0], ['room@room', 600, 200], ['results@none', 900, 200]],
  arrows: [['title@none', 'setup@none', 'Play on this device'], ['title@none', 'online@none', 'Play online'], ['title@none', 'replays@none', 'Replays'],
    ['setup@none', 'title@none', 'Back'], ['online@none', 'title@none', 'Back'], ['replays@none', 'title@none', 'Back'],
    ['setup@none', 'board@game', 'Start expedition', '#sGo'], ['online@none', 'room@room', 'Create room · Join · Quick match', '#cGo'],
    ['room@room', 'online@none', 'Leave', '#rlLeave'], ['room@room', 'board@game', 'Start game (the host)', '#rlStart'],
    ['board@game', 'setup@game', 'Menu', '#menuBtn'], ['board@game', 'setup@game', 'left and came back', null, 'event'],
    ['setup@game', 'board@game', 'Back to game', '#sBack'], ['setup@game', 'results@none', 'End game · Resign', '#sEnd'], ['board@game', 'results@none', 'the race is won', null, 'event'],
    ['results@none', 'title@none', 'Done'], ['results@none', 'viewer@none', 'Watch the replay'], ['replays@none', 'viewer@none', 'Open a game'], ['viewer@none', 'replays@none', 'Close']] };
function seed() { if (D.nodes) return;
  D.nodes = SEED.nodes.map(([k, x, y]) => ({ k, x, y }));
  D.arrows = [...SEED.arrows.map(([from, to, label, el, kind], i) => ({ id: 's' + i, from, to, label, kind: kind || 'button', ...(el ? { el } : {}) })), ...(D.arrows || [])];
  for (const x of SEED.extra) if (!D.extra.includes(x)) D.extra.push(x);
  for (const [st, m] of Object.entries(SEED.first)) if (!D.first[st]) D.first[st] = m;
  for (const a of D.arrows) for (const k of [a.from, a.to]) if (!D.nodes.some(n => n.k === k)) D.nodes.push({ k, x: 20, y: Math.max(...D.nodes.map(n => n.y)) + 70 }); } // (a box for each end of an older design's arrows)
seed();
const stateNow = () => ED.online() && ED.NET.room ? 'room' : ED.S && !ED.S.over && !ED.G.replay && !ED.UI.preview ? 'game' : 'none'; // (the start screen's board is a preview: nowhere)
// the state whose menus are on show: the player's, or the one a box laid out from the flowchart is in (until the menu closes)
let edState = null; const viewState = () => edState || stateNow();
const sections = () => [...form.querySelectorAll(':scope > section[data-screen]')];
// a menu's box in the state on show: its own box there, else its box for any state (a menu that is the same in every state)
const keyFor = sc => { const k = sc + '@' + viewState(); return D.nodes.some(n => n.k === k) || !D.nodes.some(n => n.k === sc + '@*') ? k : sc + '@*'; };
const conf = sc => { const k = sc.includes('@') ? sc : keyFor(sc); return D.screens[k] || (D.screens[k] = { blocks: {} }); };

/* ---------- blocks: what is directly in a screen, named once by where it first stood; a row of buttons is its buttons ---------- */
const name = el => el.dataset.edk || (el.dataset.edk = el.id ? '#' + el.id : (el.parentElement.matches('section') ? el.parentElement.dataset.screen : name(el.parentElement)) + '>' + [...el.parentElement.children].indexOf(el));
for (const s of sections()) for (const el of s.querySelectorAll('*')) name(el); // (named before anything moves)
const byName = k => form.querySelector(`[data-edk="${CSS.escape(k)}"]`);
const buttonRow = el => el.children.length > 1 && [...el.children].every(c => c.matches('button, a.btn'));
const items = s => { const out = []; for (const el of s.children) { if (el.classList.contains('ed-grid')) continue;
    if (el.classList.contains('ed-bar')) { for (const c of el.children) out.push([name(c), c]); continue; } // (the top and bottom bars' blocks)
    if (buttonRow(el)) { el.classList.add('ed-row'); for (const c of el.children) out.push([name(c), c]); } else out.push([name(el), el]); } return out; };
// the menus added here (a blank screen with its name as a heading), and on the menus of the state on show, the buttons their
// arrows make (each the arrow's words; the page's own buttons stay the page's)
function build() {
  for (const x of D.extra) if (!form.querySelector(`section[data-screen="${CSS.escape(x)}"]`)) { const s = document.createElement('section'); s.dataset.screen = x; s.hidden = true; s.dataset.ed = '1';
    const h = document.createElement('h2'); h.dataset.edk = x + '>title'; h.textContent = nameOf(x); s.appendChild(h); form.appendChild(s); }
  for (const s of sections()) if (s.dataset.ed && !D.extra.includes(s.dataset.screen)) s.remove();
  const goes = new Set();
  for (const s of sections()) { const k = keyFor(s.dataset.screen);
    for (const a of D.arrows) { if (a.from !== k || a.kind !== 'button' || a.el) continue; const ek = 'go:' + a.id; goes.add(ek); let el = byName(ek);
      if (!el) { el = document.createElement('button'); el.type = 'button'; el.className = 'btn'; el.dataset.edk = ek; s.appendChild(el); }
      if (el.textContent !== a.label && !el.isContentEditable) el.textContent = a.label; el.dataset.edGo = a.to; if (el.closest('section') !== s) s.appendChild(el); } }
  for (const el of form.querySelectorAll('[data-ed-go]')) if (!goes.has(el.dataset.edk)) el.remove();
}
const arrowOf = ek => ek && ek.startsWith('go:') ? D.arrows.find(a => 'go:' + a.id === ek) : null;

/* ---------- which screen is on show ---------- */
let edScreen = null, sel = null, foldOpen = false, wasOpen = false, tab = 'layout'; // (edScreen: a screen the editor shows, the page's own choice aside)
const shown = () => { const m = $('#menu'); return m && m.open ? form.querySelector(':scope > section[data-screen]:not([hidden])') : null; };
function show() { const m = $('#menu'), open = !!(m && m.open);
  if (open && !wasOpen) { edScreen = null; const f = D.first[stateNow()]; if (f) pick(f); } wasOpen = open; if (!open) { edState = null; return; } // (opened: on the screen the design starts with here)
  // (a menu made here held on show: the page's own screens hidden meanwhile, each as the page left it kept, and put back after:
  // the page writes its screens only when its own screen changes)
  if (edScreen) for (const s of sections()) { const want = s.dataset.screen !== edScreen; if (!s.dataset.ed && !('edWas' in s.dataset)) s.dataset.edWas = s.hidden ? '1' : ''; if (s.hidden !== want) s.hidden = want; }
  else for (const s of sections()) { if (s.dataset.ed) { if (!s.hidden) s.hidden = true; } else if ('edWas' in s.dataset) { s.hidden = !!s.dataset.edWas; delete s.dataset.edWas; } } }
/* a menu shown: one of the page's own screens by the page's own tab (so its tabs go on working), one made here held on show
   until the page's tabs are used */
const MODE = { setup: 'local', online: 'online', replays: 'replays' };
function pick(sc) { const l = MODE[sc] && $(`#sMode label[data-v="${MODE[sc]}"]`); if (l) { edScreen = null; l.click(); } else edScreen = sc; }
const go = sc => { pick(sc); foldOpen = false; sel = null; ED.render(); layout(); };
addEventListener('click', e => { if (!editing() && e.target.closest && e.target.closest('#sMode')) edScreen = null; }, true);
// a box: its menu shown as it is in its state (the board and the replay viewer aren't menus: said, not shown)
let note = '';
function goTo(k) { const [m, st] = k.split('@'); if (NOLAY.includes(m)) { note = `That goes to the ${nameOf(m).toLowerCase()} (${stLabel(st).toLowerCase()}): not a menu.`; return panel(); }
  note = ''; if (st !== '*') edState = st === stateNow() ? null : st; /* (to a box for any state: the state stays) */ const menu = $('#menu'); if (!menu.open) { const mb = $('#menuBtn'); if (mb) mb.click(); } go(m); }
addEventListener('click', e => { const g = e.target.closest('[data-ed-go]'); if (!g || editing()) return; e.preventDefault(); e.stopPropagation(); goTo(g.dataset.edGo); }, true);

/* ---------- laying the screen on show out on the grid ---------- */
let editOn = false; const editing = () => editOn; // (Edit mode: off until the owner turns it on)
function layout() {
  build(); show();
  const s = shown(); for (const x of sections()) if (x !== s) unlay(x);
  if (!s) { panel(); placeGlass(); return; }
  const c = conf(s.dataset.screen); s.classList.add('ed-laid'); s.classList.toggle('ed-on', editing());
  Object.assign(s.style, { display: 'grid', gridTemplateColumns: `repeat(${COLS},minmax(0,1fr))`, gridAutoRows: 'minmax(40px,auto)', gap: '10px', position: 'relative' });
  let row = 1; const its = items(s);
  for (const [k, el] of its) { const b = c.blocks[k] || (c.blocks[k] = { c: 1, r: row, w: COLS }); row = Math.max(row, b.r + 1);
    if (b.bar === true) b.bar = 'bottom'; // (an earlier design: one bar, at the bottom)
    el.style.gridColumn = `${b.c} / span ${b.w}`; el.style.gridRow = String(b.r + 1); el.classList.add('ed-item'); el.classList.toggle('ed-inbar', !!b.bar); // (row 1: the top bar's)
    const off = b.del || ((b.hide || (b.fold && !foldOpen)) && !editing()); el.style.display = off ? 'none' : '';
    if (b.listk) { const l = byName(b.listk); if (l) { if (b.list) l.dataset.edList = b.list; else delete l.dataset.edList; } }
    setKind(el, b.kind);
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
  s.querySelectorAll('.ed-item').forEach(el => { setKind(el, null); el.style.gridColumn = el.style.gridRow = ''; if (el.classList.contains('ed-hidden') || el.classList.contains('ed-folded')) el.style.display = ''; el.classList.remove('ed-item', 'ed-hidden', 'ed-folded', 'ed-sel'); });
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
  const done = () => { t.removeEventListener('blur', done); t.removeAttribute('contenteditable'); typing = false; const c = conf(s.dataset.screen), w = t.textContent.trim().slice(0, 120);
    const ar = arrowOf(t.dataset.edk); if (ar) ar.label = w || ar.label; else (c.text || (c.text = {}))[name(t)] = w; save(); layout(); }; // (a button an arrow made: the arrow's words)
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
  const ar = b && arrowOf(sel);
  return `<p><b>${esc(nameOf(sc))}</b> · ${stLabel(viewState()).toLowerCase()}${edState ? ` <span class="ed-hint">(as designed in that state; you're ${stLabel(stateNow()).toLowerCase()}, so what the page fills in is as it is now)</span>` : ''}</p>`
    + (ar ? `<p class="ed-hint">This button is an arrow in Flow: it goes to ${esc(nameOf(ar.to.split('@')[0]))} · ${esc(stLabel(ar.to.split('@')[1]).toLowerCase())}.</p>` : '')
    + (b ? (b.bar ? `<p class="ed-hint">In the ${b.bar} bar: drag it left or right (or use the arrows) to order the bar.</p>` : row('Width', WIDTHS.map(([v, n]) => btn('w', n, b.w === v, v)).join('')))
      + row('Place', btn('bar', 'On the screen', !b.bar, '') + btn('bar', 'Top bar', b.bar === 'top', 'top') + btn('bar', 'Bottom bar', b.bar === 'bottom', 'bottom'))
      + ((el => el && el.matches('button') ? row('Button', KINDS.map(([v, n]) => btn('kind', n, (b.kind || el.__kind[0]) === v, v)).join('')) : '')(byName(sel)))
      + row('', btn('hide', 'Hidden', b.hide) + btn('fold', 'In More options', b.fold) + btn('del', 'Delete'))
      + ((l => l ? row('List', [['', 'Scrolls'], ['all', 'Shows all'], ['3', 'First 3'], ['5', 'First 5'], ['10', 'First 10']].map(([v, n]) => btn('list', n, (b.list || '') === v, v)).join('')) : '')(byName(sel) && listIn(byName(sel))))
      : (editing() ? '<p class="ed-hint">Drag a block to move it; drag its right edge to make it a third, half or the whole width. Click a block to choose it. Double-click any text to change it. A chosen button can be made Main, Plain or Link. Arrows move the chosen block, Delete deletes it, Ctrl+Z undoes. Stop editing to use the menu.</p>' : '<p class="ed-hint">Press Edit (top of this panel) to lay this screen out; until then the menu works as usual.</p>'))
    + ((n => n ? `<p>${btn('undel', `Bring back deleted blocks (${n})`)}</p>` : '')(Object.values(conf(sc).blocks).filter(x => x.del).length))
    + `<hr>${btn('reset', 'This screen back to the page\'s own')}`;
}
/* the flowchart: boxes dragged to arrange, chosen by a click; arrows drawn between box edges (two between the same boxes side by
   side), each with its words; a chosen box gets its tools below (lay it out, an arrow from it, where its state's menu opens) */
const NW = 156, NH = 42;
let fsel = null, linking = null; // (fsel: { node } or { arrow }; linking: an arrow being drawn from a box: { from, kind })
function flowSvg() {
  const pos = Object.fromEntries(D.nodes.map(n => [n.k, n])), W = Math.max(...D.nodes.map(n => n.x)) + NW + 130, // (room for words beside the last box)
    H = Math.max(...D.nodes.map(n => n.y)) + NH + 30;
  const pairs = {}; for (const a of D.arrows) { const p = [a.from, a.to].sort().join('|'); (pairs[p] = pairs[p] || []).push(a); }
  const edgeAt = (n, dx, dy) => { const t = Math.min((NW / 2 + 3) / Math.abs(dx || 1e-9), (NH / 2 + 3) / Math.abs(dy || 1e-9)); return [n.x + NW / 2 + dx * t, n.y + NH / 2 + dy * t]; };
  let lines = '', labels = ''; const taken = []; // (the words placed so far: x, y, w, h)
  for (const a of D.arrows) { const A = pos[a.from], B = pos[a.to]; if (!A || !B || A === B) continue;
    const [p, q] = [a.from, a.to].sort().map(k => pos[k]), grp = pairs[[a.from, a.to].sort().join('|')], i = grp.indexOf(a);
    const ux = q.x - p.x, uy = q.y - p.y, ul = Math.hypot(ux, uy) || 1, nx = -uy / ul, ny = ux / ul, o = (i - (grp.length - 1) / 2) * 16;
    const dx = B.x - A.x, dy = B.y - A.y, [x1, y1] = edgeAt(A, dx, dy), [x2, y2] = edgeAt(B, -dx, -dy);
    const X1 = x1 + nx * o, Y1 = y1 + ny * o, X2 = x2 + nx * o, Y2 = y2 + ny * o, on = fsel && fsel.arrow === a.id, ch = changes(a), out = fsel && fsel.node === a.from, cls = `ed-ar ${a.kind}${a.el ? ' own' : ''}${ch.includes('state') ? ' st' : ''}${out ? ' out' : ''}${on ? ' on' : ''}`;
    lines += `<g class="${cls}" data-arrow="${a.id}"><line x1="${X1}" y1="${Y1}" x2="${X2}" y2="${Y2}" class="hit"/><line x1="${X1}" y1="${Y1}" x2="${X2}" y2="${Y2}" marker-end="url(#edHead${on ? 'On' : ''})"/></g>`;
    // its words: beside an upright arrow, on a level one; slid along it to the first place clear of every box and word already placed
    const up = Math.abs(Y2 - Y1) > Math.abs(X2 - X1), w = a.label.length * 6.2 + 6, side = o >= 0 ? 1 : -1;
    for (const f of [.5, .38, .62, .28, .72, .2, .8]) { const mx = X1 + (X2 - X1) * f, my = Y1 + (Y2 - Y1) * f;
      const r = up ? { x: side > 0 ? mx + 5 : mx - 5 - w, y: my - 8, w, h: 14 } : { x: mx - w / 2, y: my - 8, w, h: 14 };
      const hits = q => r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h;
      if (f !== .8 && (taken.some(hits) || D.nodes.some(n => hits({ x: n.x, y: n.y, w: NW, h: NH })))) continue;
      taken.push(r); labels += `<text class="${cls}" data-arrow="${a.id}" x="${r.x + w / 2}" y="${my + 3}">${esc(a.label)}</text>`; break; } }
  const boxes = D.nodes.map(n => { const [m, st] = n.k.split('@'), first = D.first[st] === m, on = fsel && fsel.node === n.k;
    return `<g class="ed-node ${st}${on ? ' on' : ''}${NOLAY.includes(m) ? ' nolay' : ''}" data-node="${esc(n.k)}" transform="translate(${n.x},${n.y})"><rect width="${NW}" height="${NH}" rx="8"/>`
      + `<text x="10" y="18" class="m">${first ? '★ ' : ''}${esc(nameOf(m))}</text><text x="10" y="33" class="s">${esc(stLabel(st).toLowerCase())}</text></g>`; }).join('');
  return `<svg class="ed-fc" viewBox="-10 -10 ${W} ${H}" width="${W}" height="${H}"><defs>`
    + ['', 'On'].map(k => `<marker id="edHead${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="hd${k}"/></marker>`).join('')
    + `</defs>${lines}${boxes}${labels}</svg>`;
}
/* the directions: every box with the transitions out of it, each editable (a button or an event, its words, the menu it goes to
   and the state: the same, or another); a box's state can be made any state. A click in the chart scrolls here to what it chose */
let scrollDir = false;
const stOpts = (cur, withAny, anyName) => [...(withAny ? [['*', anyName]] : []), ...STATES].map(([v, n]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(n)}</option>`).join('');
function flowBody() {
  const menus = [...new Set([...sections().map(s => s.dataset.screen), ...NOLAY, ...D.extra])], mOpts = cur => menus.map(m => `<option value="${esc(m)}"${m === cur ? ' selected' : ''}>${esc(nameOf(m))}</option>`).join('');
  const dirs = [...D.nodes].sort((p, q) => p.y - q.y || p.x - q.x).map(n => { const [m, st] = n.k.split('@'), lay = !NOLAY.includes(m), on = fsel && fsel.node === n.k;
    const rows = D.arrows.filter(a => a.from === n.k).map(a => { const [tm, ts] = a.to.split('@'), ar = fsel && fsel.arrow === a.id;
      return `<div class="ed-dr${ar ? ' on' : ''}" data-darrow="${a.id}"><select data-act="fl-akind" data-id="${a.id}"><option value="button"${a.kind === 'button' ? ' selected' : ''}>Button</option><option value="event"${a.kind === 'event' ? ' selected' : ''}>Event</option></select>`
        + `<input data-act="fl-aword" data-id="${a.id}" value="${esc(a.label)}" maxlength="48"> → <select data-act="fl-ato-m" data-id="${a.id}">${mOpts(tm)}</select> · <select data-act="fl-ato-s" data-id="${a.id}">${stOpts(ts, true, 'state stays the same')}</select>`
        + `<span class="ed-tag ${changes(a).includes('state') ? 'st' : ''}">${changes(a)}</span>${btn('fl-rmarrow', '×', false, a.id, 'title="Remove this transition"')}</div>`; }).join('');
    return `<div class="ed-dir${on ? ' on' : ''}" data-dir="${esc(n.k)}"><div class="ed-dh"><b>${D.first[st] === m ? '★ ' : ''}${esc(nameOf(m))}</b><select data-act="fl-nstate" data-k="${esc(n.k)}">${stOpts(st, true, 'Any state')}</select>`
      + `${lay ? btn('fl-lay', 'Lay out', false, n.k) : ''}${btn('fl-link', '+ Button', false, n.k, 'data-kind="button" title="Then click the box it goes to"')}${btn('fl-link', '+ Event', false, n.k, 'data-kind="event" title="Then click the box it leads to"')}`
      + `${lay && st !== '*' ? btn('fl-first', D.first[st] === m ? '★ Opens here' : '☆ Open here', D.first[st] === m, n.k, `title="The menu opens on this one ${stLabel(st).toLowerCase()}"`) : ''}${btn('fl-rmnode', 'Remove', false, n.k)}</div>${rows || '<div class="ed-dr none">No way out yet</div>'}</div>`; }).join('');
  const add = `<div class="ed-dh">+ Box: <select id="flMenu">${mOpts('')}<option value="">New menu…</option></select><select id="flState">${stOpts('none', true, 'Any state')}</select>${btn('fl-add', 'Add')}</div>`;
  return `<div class="ed-flowwrap">${flowSvg()}</div>`
    + (linking ? `<p class="ed-link">Click the box this ${linking.kind === 'button' ? 'button' : 'event'} goes to. ${btn('fl-cancel', 'Cancel')}</p>` : `<p class="ed-hint">A box is a menu in a state (or in any state); an arrow is a button on it (solid) or something that happens (dashed); blue changes the state. Drag boxes to arrange them; click one to find it below.</p>`)
    + (note ? `<p class="ed-hint">${esc(note)}</p>` : '') + `<div class="ed-dirs">${dirs}${add}</div><hr>${btn('fl-reset', 'Back to the default flowchart')}`;
}
function panel() {
  const body = mini ? '' : tab === 'layout' ? layoutBody() : tab === 'flow' ? flowBody()
    : tab === 'options' ? AREAS.map(a => row(a.name, a.options.map(([id, n]) => btn('opt', n, (D.options[a.id] || 'a') === id, id, `data-area="${a.id}"`)).join(''))).join('')
    : `<p>Your design is kept in this browser as you go. To send it to me, download it and attach the file.</p>${row('', btn('download', 'Download design') + btn('import', 'Load a design file…'))}${row('', btn('clear', 'Start over'))}`;
  const html = `<div class="ed-head"><b>Design</b><button data-act="editmode" class="ed-edit${editOn ? ' on' : ''}" title="${editOn ? 'Stop editing: the menu works again' : 'Edit the menu on show: clicks move and choose its blocks'}">${editOn ? '■ Stop editing' : '✎ Edit'}</button><span>${mini ? '' : ['layout', 'flow', 'options', 'export'].map(t => `<button data-tab="${t}" class="${tab === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}`
    + `${btn('undo', '↶', false, '', `title="Undo (Ctrl+Z)" ${undos.length ? '' : 'disabled'}`)}${btn('redo', '↷', false, '', `title="Redo (Ctrl+Shift+Z)" ${redos.length ? '' : 'disabled'}`)}${btn('mini', mini ? '▾' : '▴', false, '', `title="${mini ? 'Open' : 'Shrink it out of the way'}"`)}</span></div>${mini ? '' : `<div class="ed-body">${body}</div>`}`;
  if (box.__h !== html) { box.__h = html; box.innerHTML = html; }
  if (scrollDir && fsel) { scrollDir = false; const d = box.querySelector('.ed-dirs'), r = box.querySelector(fsel.arrow ? `[data-darrow="${fsel.arrow}"]` : `[data-dir="${CSS.escape(fsel.node)}"]`);
    if (d && r) { const h = box.querySelector('.ed-head'); box.scrollTop += r.getBoundingClientRect().top - box.getBoundingClientRect().top - (h ? h.offsetHeight : 0) - 8; } } // (the panel scrolls, its title bar staying) // (the list's own scroll only: the page stays where it is)
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
  else if (b && a === 'kind') { const el = byName(sel); b.kind = el && el.__kind[0] === v ? undefined : v; }
  else if (b && a === 'del') { const ar = arrowOf(sel); if (ar) { D.arrows = D.arrows.filter(x => x !== ar); delete conf(sc).blocks[sel]; } else b.del = true; sel = null; } // (a button an arrow made: the arrow goes too)
  else if (a === 'undel') { for (const x of Object.values(conf(sc).blocks)) delete x.del; }
  else if (b && a === 'list') { const l = listIn(byName(sel)); if (l) { b.listk = name(l); b.list = v || undefined; } } else if (b && (a === 'hide' || a === 'fold')) b[a] = !b[a] || undefined; else if (b && a === 'bar') b.bar = v || undefined;
  else if (a === 'reset') { delete D.screens[sc]; sel = null; unlay(s); }
  else if (a === 'fl-lay') { tab = 'layout'; fsel = null; goTo(v); return; }
  else if (a === 'fl-link') { linking = { from: v, kind: t.dataset.kind }; fsel = { node: v }; }
  else if (a === 'fl-cancel') { linking = null; }
  else if (a === 'fl-first') { const [m, st] = v.split('@'); D.first[st] = D.first[st] === m ? undefined : m; }
  else if (a === 'fl-rmnode') { const [m] = v.split('@'); D.nodes = D.nodes.filter(n => n.k !== v); D.arrows = D.arrows.filter(x => x.from !== v && x.to !== v); delete D.screens[v]; fsel = null;
    if (D.extra.includes(m) && !D.nodes.some(n => n.k.split('@')[0] === m)) D.extra = D.extra.filter(x => x !== m); // (a menu made here, in no box any more: gone)
    for (const [st, f] of Object.entries(D.first)) if (f === m && !D.nodes.some(n => n.k === m + '@' + st)) delete D.first[st]; }
  else if (a === 'fl-rmarrow') { D.arrows = D.arrows.filter(x => x.id !== v); if (fsel && fsel.arrow === v) fsel = null; }
  else if (a === 'fl-akind' || a === 'fl-aword' || a === 'fl-ato-m' || a === 'fl-ato-s') { const ar = D.arrows.find(x => x.id === t.dataset.id); if (!ar) return; fsel = { arrow: ar.id };
    if (a === 'fl-akind') ar.kind = v; else if (a === 'fl-aword') ar.label = v.trim().slice(0, 48) || ar.label;
    else { const [tm, ts] = ar.to.split('@'), nk = a === 'fl-ato-m' ? v + '@' + ts : tm + '@' + v, from = D.nodes.find(x => x.k === ar.from);
      if (!D.nodes.some(x => x.k === nk)) D.nodes.push({ k: nk, x: from.x + 300, y: Math.max(...D.nodes.map(x => x.y)) + 100 }); ar.to = nk; } } // (a box it now goes to that wasn't there: made)
  else if (a === 'fl-nstate') { const k = t.dataset.k, [m, st] = k.split('@'), nk = m + '@' + v; if (nk === k) return;
    if (D.nodes.some(x => x.k === nk)) { note = `There is already a box for ${nameOf(m)} · ${stLabel(v).toLowerCase()}.`; return panel(); }
    D.nodes.find(x => x.k === k).k = nk; for (const ar of D.arrows) { if (ar.from === k) ar.from = nk; if (ar.to === k) ar.to = nk; }
    if (D.screens[k]) { D.screens[nk] = D.screens[k]; delete D.screens[k]; } if (D.first[st] === m) delete D.first[st]; fsel = { node: nk }; note = ''; }
  else if (a === 'fl-add') { let m = $('#flMenu').value; const st = $('#flState').value;
    if (!m) { m = (prompt('A name for the new menu (for example: settings)') || '').trim().toLowerCase().replace(/[^\w-]/g, '').slice(0, 24); if (!m) return; if (!D.extra.includes(m) && !sections().some(x => x.dataset.screen === m) && !NOLAY.includes(m)) D.extra.push(m); }
    const k = m + '@' + st; if (!D.nodes.some(n => n.k === k)) D.nodes.push({ k, x: 20, y: Math.max(...D.nodes.map(n => n.y)) + 70 }); fsel = { node: k }; }
  else if (a === 'fl-reset') { if (!confirm('Back to the default flowchart? Your boxes and arrows go; layouts stay.')) return; D.nodes = null; D.arrows = null; D.first = {}; fsel = null; seed(); }
  else if (a === 'download') { const u = URL.createObjectURL(new Blob([JSON.stringify(D, null, 1)], { type: 'application/json' })), l = document.createElement('a');
    l.href = u; l.download = `eldorado-design-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); return; }
  else if (a === 'import') { const f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json';
    f.onchange = () => f.files[0] && f.files[0].text().then(txt => { const n = JSON.parse(txt); if (!n || n.v !== 4) throw new Error('not a design from this editor');
      localStorage.setItem(KEY, JSON.stringify(n)); location.reload(); }).catch(err => alert('That file isn\'t a design: ' + err.message)); f.click(); return; }
  else if (a === 'clear') { if (!confirm('Start over: forget this design?')) return; localStorage.removeItem(KEY); location.reload(); return; }
  save(); applyOptions(); layout();
}
box.addEventListener('click', e => { const t = e.target.closest('button'); if (!t || t.disabled) return; if (t.dataset.tab) { tab = t.dataset.tab; mini = false; sel = null; layout(); return; } act(t, t.dataset.act, t.dataset.v); });
box.addEventListener('change', e => { const t = e.target; if (t.matches('select[data-act], input[data-act]')) act(t, t.dataset.act, t.value); });
// a row of the directions chosen by a click on it (not on its fields): the chart shows it
box.addEventListener('click', e => { if (e.target.closest('button, select, input')) return; const r = e.target.closest('[data-darrow], [data-dir]'); if (!r) return;
  fsel = r.dataset.darrow ? { arrow: r.dataset.darrow } : { node: r.dataset.dir }; panel(); });
box.addEventListener('pointerdown', e => { if (!e.target.closest('.ed-head') || e.target.closest('button')) return; const r = box.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
  const mv = ev => { at = { x: Math.max(0, ev.clientX - ox), y: Math.max(0, ev.clientY - oy) }; panel(); }, up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); });
// the flowchart: a press on a box chooses it (or ends an arrow being drawn) and drags it, on an arrow or its words chooses it
box.addEventListener('pointerdown', e => { if (tab !== 'flow' || !e.target.closest('.ed-fc')) return; e.preventDefault();
  const g = e.target.closest('.ed-node'), ar = e.target.closest('[data-arrow]');
  if (g && linking) { const kind = linking.kind, from = linking.from, to = g.dataset.node; linking = null;
    const w = (prompt(kind === 'button' ? "The button's words" : 'What happens (for example: the game ends)') || '').trim().slice(0, 48);
    if (w && to !== from) { const id = 'a' + Date.now().toString(36); D.arrows.push({ id, from, to, label: w, kind }); fsel = { arrow: id }; save(); } return panel(); }
  if (g) { const n = D.nodes.find(x => x.k === g.dataset.node), x0 = n.x, y0 = n.y, sx = e.clientX, sy = e.clientY; fsel = { node: n.k }; scrollDir = true; panel();
    const mv = ev => { n.x = Math.max(0, Math.round((x0 + ev.clientX - sx) / 10) * 10); n.y = Math.max(0, Math.round((y0 + ev.clientY - sy) / 10) * 10); panel(); },
      up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); save(); panel(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); return; }
  fsel = ar ? { arrow: ar.dataset.arrow } : null; linking = null; scrollDir = !!ar; panel(); });
// the menu's own screens change by its own clicks: the layout follows whichever is on show
new MutationObserver(() => { if (!drag) layout(); }).observe($('#menu'), { attributes: true, subtree: true, attributeFilter: ['hidden', 'open'] });

/* ---------- styles: the editor's own, and the option sets' ---------- */
const css = document.createElement('style'); css.textContent = `
#edGlass{position:fixed;z-index:1990;background:transparent;touch-action:none}#edGlass[hidden]{display:none}
#edPanel{position:fixed;z-index:2000;width:300px;max-height:86vh;overflow:auto;contain:paint;background:#101915f2;color:#eae3cf;border:1px solid #5b4a26;border-radius:12px;font:13px/1.35 Figtree,system-ui,sans-serif;box-shadow:0 10px 30px #0009}
#edPanel.wide{width:min(1180px,96vw)}
#edPanel .ed-head{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:7px 9px;cursor:move;border-bottom:1px solid #3a3020;position:sticky;top:0;background:#101915;z-index:1}
#edPanel .ed-body{padding:8px 10px}#edPanel p{margin:6px 0}#edPanel hr{border:0;border-top:1px solid #3a3020;margin:8px 0}#edPanel .ed-hint{color:#b8b09a}
#edPanel button,#edPanel select{font:inherit;color:inherit;background:#22302a;border:1px solid #4a5a50;border-radius:7px;padding:2px 7px;margin:2px;cursor:pointer}
#edPanel button.on{background:#e9b24a;color:#2a1c05;border-color:#e9b24a}#edPanel button:disabled{opacity:.35;cursor:default}
#edPanel .ed-r{display:flex;justify-content:space-between;align-items:center;gap:6px;margin:4px 0}#edPanel .ed-r span{display:flex;flex-wrap:wrap;justify-content:flex-end}
#edPanel .ed-flowwrap{overflow:auto;max-height:min(470px,60vh);background:#0b120f;border-radius:10px;padding:6px}
#edPanel .ed-fc{display:block;font:12px system-ui,sans-serif;user-select:none;touch-action:none}
#edPanel .ed-node{cursor:grab}#edPanel .ed-node rect{fill:#16211c;stroke:#4a5a50;stroke-width:1.5}#edPanel .ed-node.game rect{fill:#13261b;stroke:#3f7a55}#edPanel .ed-node.room rect{fill:#141f2c;stroke:#46688c}
#edPanel .ed-node.nolay rect{stroke-dasharray:4 3}#edPanel .ed-node.on rect{stroke:#e9b24a;stroke-width:2.5}
#edPanel .ed-node .m{fill:#ecf1ec;font-weight:700;font-size:13px}#edPanel .ed-node .s{fill:#98aa9f;font-size:11px}
#edPanel .ed-ar line{stroke:#8aa196;stroke-width:1.6;fill:none}#edPanel .ed-ar.event line:not(.hit){stroke-dasharray:5 4}#edPanel .ed-ar line.hit{stroke:transparent;stroke-width:12;cursor:pointer}
#edPanel .ed-ar.on line:not(.hit){stroke:#e9b24a;stroke-width:2.2}#edPanel .hd{fill:#8aa196}#edPanel .hdOn{fill:#e9b24a}
#edPanel .ed-ar.st line:not(.hit){stroke:#6fb3dd}#edPanel text.ed-ar.st{fill:#bfe0f5}
#edPanel .ed-ar.out line:not(.hit){stroke-dasharray:7 5;animation:edFlow .7s linear infinite}@keyframes edFlow{to{stroke-dashoffset:-12}}
@media (prefers-reduced-motion:reduce){#edPanel .ed-ar.out line:not(.hit){animation:none}}
#edPanel .ed-dirs{margin-top:8px;border-top:1px solid #2a3a32}#edPanel.wide .ed-head{position:sticky;top:0;z-index:2;background:#101915}
#edPanel .ed-dir{padding:6px 4px;border-bottom:1px solid #1e2a24;border-radius:6px}#edPanel .ed-dir.on{background:rgba(233,178,74,.08);outline:1px solid rgba(233,178,74,.5)}
#edPanel .ed-dh{display:flex;align-items:center;gap:6px;flex-wrap:wrap}#edPanel .ed-dh b{min-width:120px}
#edPanel .ed-dr{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:4px 0 0 18px;font-size:12px;padding:2px 4px;border-radius:5px}#edPanel .ed-dr.on{background:rgba(233,178,74,.14)}#edPanel .ed-dr.none{color:#7d8c84;font-style:italic}
#edPanel .ed-dirs select,#edPanel .ed-dirs input,#edPanel .ed-dh select{background:#0b120f;color:#ecf1ec;border:1px solid #3a4a42;border-radius:5px;font:inherit;font-size:12px;padding:2px 4px}#edPanel .ed-dirs input{width:180px}
#edPanel .ed-tag{font-size:11px;padding:1px 6px;border-radius:8px;background:#22302a;color:#b8c4bd}#edPanel .ed-tag.st{background:#173247;color:#bfe0f5}
#edPanel .ed-link{color:#f3d48a}
#edPanel text.ed-ar{fill:#dfe8e2;font-size:11px;text-anchor:middle;paint-order:stroke;stroke:#0b120f;stroke-width:4px;stroke-linejoin:round;cursor:pointer}#edPanel text.ed-ar.event{font-style:italic;fill:#b8c4bd}#edPanel text.ed-ar.on{fill:#f3d48a}
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
/* the look: b brass (gold), c jungle, d water: the board's three terrains, each a whole look of its own (below) */
/* b: the whole "expedition kit" (owner, 2026-10-05: the full look of the D2-A mock-up, 681ed0a: leather panels framed in brass, serif
   section titles, brass buttons, the game's chrome to match), not only its buttons */
html[data-edcolors=b]{--leather:#1c1610;--leather2:#251c13;--brass:#b98d4b;--brassHi:#efcd8a;--brassDk:#5a4020;
  --glass:linear-gradient(180deg,rgba(40,30,20,.95),rgba(26,20,13,.95));--glass2:linear-gradient(180deg,rgba(54,41,26,.96),rgba(34,26,17,.96));
  --line:rgba(214,170,100,.14);--line2:rgba(214,170,100,.34);--muted:#b3a58c;--faint:#7c6f58}
html[data-edcolors=b] .glass{border-color:rgba(199,154,82,.5);box-shadow:inset 0 1px 0 rgba(255,228,170,.1),0 8px 22px rgba(0,0,0,.4)}
html[data-edcolors=b] #menu{background:rgba(8,6,4,.76)}
html[data-edcolors=b] .modal{background:radial-gradient(120% 80% at 50% 0%,#2a2016 0%,#1b150e 60%,#15100b 100%);border:1px solid var(--brass);border-radius:14px;
  box-shadow:inset 0 0 0 5px #17120c,inset 0 0 0 6px rgba(199,154,82,.35),0 30px 80px rgba(0,0,0,.65)}
html[data-edcolors=b] .modal h2{color:var(--brassHi)}
html[data-edcolors=b] .field>label{font-family:var(--display);font-size:17px;letter-spacing:0;text-transform:none;color:var(--brassHi);font-weight:400;margin-bottom:10px;display:flex;align-items:center;gap:10px}
html[data-edcolors=b] .field>label::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(199,154,82,.45),transparent)}
html[data-edcolors=b] .field>label.chk::after{display:none}
html[data-edcolors=b] .btn{background:linear-gradient(180deg,#34281a,#221a11);border:1px solid var(--brass);border-radius:9px;color:#f1e6cf;box-shadow:inset 0 1px 0 rgba(255,230,180,.16),inset 0 -1px 0 rgba(0,0,0,.35),0 2px 0 #0b0805,0 6px 14px rgba(0,0,0,.35)}
html[data-edcolors=b] .btn:hover{background:linear-gradient(180deg,#403120,#2a2015);border-color:var(--brassHi)}
html[data-edcolors=b] .btn.pri{background:linear-gradient(180deg,#f6d88f 0%,#dcac55 45%,#b98434 100%);border-color:#7a5620;color:#2a1b06;box-shadow:inset 0 1px 0 rgba(255,250,225,.75),inset 0 -2px 0 rgba(110,70,20,.45),0 2px 0 #3a2807,0 6px 14px rgba(0,0,0,.4)}
html[data-edcolors=b] .btn.pri:hover{background:linear-gradient(180deg,#fbe3a6 0%,#e4b867 45%,#c38e3c 100%)}
html[data-edcolors=b] .btn.big{border-radius:10px}
html[data-edcolors=b] .seg{background:#120e09;border-color:rgba(199,154,82,.28);border-radius:9px;box-shadow:inset 0 2px 4px rgba(0,0,0,.5)}
html[data-edcolors=b] .seg label{border-radius:6px}
html[data-edcolors=b] .seg button.on,html[data-edcolors=b] .seg label:has(input:checked){background:linear-gradient(180deg,#3d2f1e,#2b2115);color:var(--brassHi);box-shadow:inset 0 0 0 1px var(--brass),inset 0 1px 0 rgba(255,230,180,.15)}
html[data-edcolors=b] #sMode{background:none;border:0;box-shadow:none;border-bottom:1px solid rgba(199,154,82,.35);border-radius:0;padding:0;gap:0}
html[data-edcolors=b] #sMode label{font-family:var(--display);font-weight:400;font-size:17px;border-radius:0;padding:9px 4px 10px;color:var(--muted)}
html[data-edcolors=b] #sMode label:has(input:checked){background:none;box-shadow:inset 0 -2px 0 var(--brassHi);color:var(--brassHi)}
html[data-edcolors=b] .clist button,html[data-edcolors=b] .clist label,html[data-edcolors=b] .rlist button,html[data-edcolors=b] .boxrow,html[data-edcolors=b] .rrow,html[data-edcolors=b] .seatrow,html[data-edcolors=b] .pst{background:#16110b;border-color:rgba(199,154,82,.2)}
html[data-edcolors=b] .clist button.on,html[data-edcolors=b] .clist label:has(input:checked){border-color:var(--brass);background:linear-gradient(180deg,rgba(199,154,82,.16),rgba(199,154,82,.06));box-shadow:inset 0 0 0 1px rgba(239,205,138,.25)}
html[data-edcolors=b] .clist .dtag{text-transform:none;letter-spacing:0;font-size:11.5px;font-style:italic;font-family:var(--display);border:0;padding:0}
html[data-edcolors=b] .prow input,html[data-edcolors=b] select.who{background-color:#120e09;border-color:rgba(199,154,82,.3)}
html[data-edcolors=b] select.who option,html[data-edcolors=b] select.who optgroup{background:#1c1610}
html[data-edcolors=b] .ingame{border-color:var(--brass);background:linear-gradient(180deg,rgba(199,154,82,.14),rgba(199,154,82,.05))}
html[data-edcolors=b] .ingame #igTxt{font-family:var(--display)}
html[data-edcolors=b] .aitag{font-family:var(--display);font-weight:400;letter-spacing:0;font-size:11px;border-color:rgba(199,154,82,.6);color:var(--brassHi)}
html[data-edcolors=b] .sws label:has(input:checked){border-color:var(--brassHi)}
html[data-edcolors=b] .modal.menu{scrollbar-color:rgba(199,154,82,.35) transparent}
html[data-edcolors=b] #vp{background:radial-gradient(ellipse 80% 70% at 45% 42%,#1b2a1e 0%,#101a14 55%,#0a0f0b 100%)}
html[data-edcolors=b] .brand{color:var(--brassHi)}
html[data-edcolors=b] #roundLbl{font-family:var(--display);letter-spacing:0;text-transform:none;font-size:14px;color:var(--muted)}
html[data-edcolors=b] .tbtn{border-radius:9px;color:#f1e6cf}
html[data-edcolors=b] .tbtn.on{border-color:var(--brassHi);color:var(--brassHi);box-shadow:inset 0 0 0 1px rgba(239,205,138,.35),inset 0 1px 0 rgba(255,228,170,.15),0 8px 22px rgba(0,0,0,.4)}
html[data-edcolors=b] .pchip{border-radius:9px}
html[data-edcolors=b] .pchip .dot{box-shadow:0 0 0 1.5px #0b0805,0 0 0 2.5px rgba(199,154,82,.6)}
html[data-edcolors=b] .zoomctl button{border-radius:9px;color:var(--brassHi)}
html[data-edcolors=b] #prompt{border-radius:10px;color:#eadfc8}
html[data-edcolors=b] #prompt b{color:var(--brassHi)}
html[data-edcolors=b] #hist{background:linear-gradient(180deg,rgba(38,29,19,.97),rgba(25,19,13,.97));border-radius:10px}
html[data-edcolors=b] .ht+.ht{border-top:1px dashed rgba(199,154,82,.22)}
html[data-edcolors=b] .hwho{font-family:var(--display);font-weight:400;font-size:13px}
html[data-edcolors=b] .hwho span{font-family:var(--ui)}
html[data-edcolors=b] .fend .fpill{border-color:rgba(199,154,82,.45);background:rgba(199,154,82,.08);color:#f1e6cf;border-radius:6px}
html[data-edcolors=b] .pile .lbl{border-radius:7px}
html[data-edcolors=b] #playLbl{font-family:var(--display);letter-spacing:0;text-transform:none;font-size:14px}
html[data-edcolors=b] #banner .s{font-family:var(--display);letter-spacing:0;text-transform:none;font-size:16px}
html[data-edcolors=b] #banner{border-radius:12px}
html[data-edcolors=b] .allc-sect h3 span,html[data-edcolors=b] .allc-head span{font-family:var(--display);letter-spacing:0;text-transform:none;font-size:14px}
html[data-edcolors=b] #rdock,html[data-edcolors=b] #rside,html[data-edcolors=b] #lside{background:#17120c;border-color:rgba(199,154,82,.3)}
html[data-edcolors=b] #rdock button{background:linear-gradient(180deg,#34281a,#221a11);border-color:rgba(199,154,82,.55);border-radius:8px}
html[data-edcolors=b] #rdock .rgrp button.pri{background:linear-gradient(180deg,#f6d88f,#dcac55 45%,#b98434);border-color:#7a5620}
html[data-edcolors=b] #rdock .rspd{border-color:rgba(199,154,82,.45)}
html[data-edcolors=b] #rdock .rspd button+button{border-left-color:rgba(199,154,82,.3)}
html[data-edcolors=b] .sclose,html[data-edcolors=b] .bs-x{border-color:var(--brass);background:#1c1610}
/* c: jungle, a field notebook (owner, 2026-10-05: each look designed, not a recolouring): moss-dark panels with a faint leaf-vein
   grain, leaf-shaped corners, cream italic serif headings over a dashed vine rule, a fresh lime main button */
html[data-edcolors=c]{--glass:rgba(18,34,24,.94);--glass2:rgba(26,46,33,.95);--line:rgba(196,226,170,.12);--line2:rgba(196,226,170,.28);--muted:#a9bba0;--faint:#6f8468;--text:#eef0df}
html[data-edcolors=c] .glass{border-color:rgba(160,200,130,.28);border-radius:16px 5px 16px 5px;box-shadow:0 10px 26px rgba(0,0,0,.4)}
html[data-edcolors=c] #menu{background:rgba(4,10,6,.72)}
html[data-edcolors=c] .modal{background:radial-gradient(140% 90% at 0% 0%,rgba(150,190,90,.11),transparent 55%),repeating-linear-gradient(115deg,rgba(220,255,200,.016) 0 2px,transparent 2px 11px),linear-gradient(180deg,#16291d,#0f1d15);border:1px solid rgba(170,205,140,.35);border-radius:28px 28px 28px 8px;box-shadow:0 30px 80px rgba(0,0,0,.6),inset 0 1px 0 rgba(230,255,210,.06)}
html[data-edcolors=c] .modal h2{font-family:var(--display);font-style:italic;font-weight:400;color:#f1ead0;letter-spacing:0}
html[data-edcolors=c] .field>label{font-family:var(--display);font-style:italic;font-weight:400;font-size:17px;text-transform:none;letter-spacing:0;color:#e9e2c4;display:flex;align-items:center;gap:10px;margin-bottom:10px}
html[data-edcolors=c] .field>label::after{content:"";flex:1;border-bottom:1px dashed rgba(170,205,140,.35)}
html[data-edcolors=c] .field>label.chk::after{display:none}
html[data-edcolors=c] .btn{background:#1d3626;border:1px solid rgba(170,205,140,.35);border-radius:16px 4px 16px 4px;color:#eef0df;box-shadow:0 2px 0 #08120c}
html[data-edcolors=c] .btn:hover{background:#244430;border-color:rgba(190,225,160,.6)}
html[data-edcolors=c] .btn.pri{background:linear-gradient(180deg,#c9e37f,#8cbf4a);border-color:#5f8f2c;color:#13240b;border-radius:18px 5px 18px 5px;box-shadow:0 2px 0 #2f4d14,0 8px 18px rgba(120,180,60,.22)}
html[data-edcolors=c] .btn.pri:hover{background:linear-gradient(180deg,#d5eb90,#98c956)}
html[data-edcolors=c] .seg{background:#0d1a12;border-color:rgba(170,205,140,.25);border-radius:14px 4px 14px 4px}
html[data-edcolors=c] .seg label{border-radius:11px 3px 11px 3px}
html[data-edcolors=c] .seg button.on,html[data-edcolors=c] .seg label:has(input:checked){background:#2a4a33;color:#f1ead0;box-shadow:inset 0 0 0 1px rgba(198,225,122,.6)}
html[data-edcolors=c] #sMode{background:none;border:0;box-shadow:none;gap:6px;padding:0}
html[data-edcolors=c] #sMode label{font-family:var(--display);font-style:italic;font-weight:400;font-size:17px;color:#a9bba0;border-radius:14px 4px 14px 4px}
html[data-edcolors=c] #sMode label:has(input:checked){background:rgba(198,225,122,.12);color:#e6f0b8;box-shadow:inset 0 0 0 1px rgba(198,225,122,.45)}
html[data-edcolors=c] .clist button,html[data-edcolors=c] .clist label,html[data-edcolors=c] .rlist button,html[data-edcolors=c] .boxrow,html[data-edcolors=c] .rrow,html[data-edcolors=c] .seatrow,html[data-edcolors=c] .pst{background:rgba(10,22,14,.7);border-color:rgba(170,205,140,.18);border-radius:14px 4px 14px 4px}
html[data-edcolors=c] .clist button.on,html[data-edcolors=c] .clist label:has(input:checked){border-color:#a9cf62;background:rgba(169,207,98,.1)}
html[data-edcolors=c] .clist .dtag{font-family:var(--display);font-style:italic;text-transform:none;letter-spacing:0;border:0;padding:0}
html[data-edcolors=c] .prow input,html[data-edcolors=c] select.who{background-color:#0d1a12;border-color:rgba(170,205,140,.25);border-radius:12px 4px 12px 4px}
html[data-edcolors=c] select.who option,html[data-edcolors=c] select.who optgroup{background:#0f1d15}
html[data-edcolors=c] .ingame{border-color:#a9cf62;background:rgba(169,207,98,.08)}
html[data-edcolors=c] .aitag{font-family:var(--display);font-style:italic;font-weight:400;text-transform:none;letter-spacing:0;color:#d6e8a0;border-color:rgba(169,207,98,.5)}
html[data-edcolors=c] .modal.menu{scrollbar-color:rgba(170,205,140,.35) transparent}
html[data-edcolors=c] #vp{background:radial-gradient(ellipse 85% 75% at 45% 40%,#173322 0%,#0e1f15 55%,#08120c 100%)}
html[data-edcolors=c] .brand{color:#f1ead0;font-style:italic}
html[data-edcolors=c] #roundLbl{font-family:var(--display);font-style:italic;text-transform:none;letter-spacing:0;font-size:14px;color:#a9bba0}
html[data-edcolors=c] .tbtn,html[data-edcolors=c] .pchip,html[data-edcolors=c] .zoomctl button,html[data-edcolors=c] .pile .lbl,html[data-edcolors=c] #rdock button{border-radius:14px 4px 14px 4px}
html[data-edcolors=c] .tbtn.on{border-color:#a9cf62;color:#e6f0b8}
html[data-edcolors=c] #prompt{border-radius:20px 6px 20px 6px;color:#eef0df}
html[data-edcolors=c] #prompt b{color:#d6e8a0}
html[data-edcolors=c] #hist{border-radius:18px 6px 18px 6px}
html[data-edcolors=c] .ht+.ht{border-top:1px dashed rgba(170,205,140,.22)}
html[data-edcolors=c] .hwho{font-family:var(--display);font-style:italic;font-weight:400}
html[data-edcolors=c] #playLbl{font-family:var(--display);font-style:italic;text-transform:none;letter-spacing:0;font-size:14px}
html[data-edcolors=c] #banner{border-radius:22px 6px 22px 6px}
html[data-edcolors=c] #banner .s{font-family:var(--display);font-style:italic;text-transform:none;letter-spacing:0}
html[data-edcolors=c] #rdock .rgrp button.pri{background:linear-gradient(180deg,#c9e37f,#8cbf4a);color:#13240b;border-color:#5f8f2c}
/* d: water, a river chart: ink-blue panels with faint depth-contour rings, thin double rules like a navigation chart, small
   capitals for labels, crisp square buttons, a signal-cyan main button */
html[data-edcolors=d]{--glass:rgba(10,20,34,.95);--glass2:rgba(16,30,50,.96);--line:rgba(150,200,240,.12);--line2:rgba(150,200,240,.28);--muted:#93aac0;--faint:#5e7690;--text:#e6eef6}
html[data-edcolors=d] .glass{border-color:rgba(150,200,240,.3);border-radius:4px;box-shadow:0 0 0 3px rgba(10,20,34,.92),0 0 0 4px rgba(150,200,240,.14),0 10px 24px rgba(0,0,0,.45)}
html[data-edcolors=d] #menu{background:rgba(3,8,14,.74)}
html[data-edcolors=d] .modal{background:repeating-radial-gradient(circle at 88% 12%,transparent 0 26px,rgba(140,190,235,.05) 26px 27px),linear-gradient(180deg,#0f1f33,#0a1626);border:1px solid rgba(150,200,240,.4);border-radius:4px;box-shadow:inset 0 0 0 4px #0a1626,inset 0 0 0 5px rgba(150,200,240,.2),0 30px 80px rgba(0,0,0,.6)}
html[data-edcolors=d] .modal h2{font-family:var(--ui);font-weight:800;text-transform:uppercase;letter-spacing:.18em;font-size:20px;color:#dbe9f6}
html[data-edcolors=d] .field>label{font-family:var(--ui);font-weight:700;font-size:11.5px;text-transform:uppercase;letter-spacing:.2em;color:#7fc4e8;display:flex;align-items:center;gap:10px;margin-bottom:10px}
html[data-edcolors=d] .field>label::after{content:"";flex:1;height:3px;border-top:1px solid rgba(127,196,232,.32);border-bottom:1px solid rgba(127,196,232,.14)}
html[data-edcolors=d] .field>label.chk::after{display:none}
html[data-edcolors=d] .btn{background:transparent;border:1px solid rgba(150,200,240,.45);border-radius:3px;color:#dbe9f6;box-shadow:none;letter-spacing:.03em}
html[data-edcolors=d] .btn:hover{background:rgba(127,196,232,.1);border-color:#7fc4e8}
html[data-edcolors=d] .btn.pri{background:#3fd0e0;border-color:#3fd0e0;color:#04202a;border-radius:3px;box-shadow:0 0 0 3px #0a1626,0 0 0 4px rgba(63,208,224,.5)}
html[data-edcolors=d] .btn.pri:hover{background:#62dcea}
html[data-edcolors=d] .seg{background:#081321;border-color:rgba(150,200,240,.25);border-radius:3px}
html[data-edcolors=d] .seg label{border-radius:2px}
html[data-edcolors=d] .seg button.on,html[data-edcolors=d] .seg label:has(input:checked){background:rgba(63,208,224,.14);color:#bff3f9;box-shadow:inset 0 -2px 0 #3fd0e0}
html[data-edcolors=d] #sMode{background:none;border:0;box-shadow:none;border-bottom:1px solid rgba(150,200,240,.25);border-radius:0;padding:0;gap:0}
html[data-edcolors=d] #sMode label{font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.18em;border-radius:0;color:#93aac0;padding:10px 4px}
html[data-edcolors=d] #sMode label:has(input:checked){background:none;color:#bff3f9;box-shadow:inset 0 -2px 0 #3fd0e0}
html[data-edcolors=d] .clist button,html[data-edcolors=d] .clist label,html[data-edcolors=d] .rlist button,html[data-edcolors=d] .boxrow,html[data-edcolors=d] .rrow,html[data-edcolors=d] .seatrow,html[data-edcolors=d] .pst{background:rgba(8,18,32,.8);border-color:rgba(150,200,240,.18);border-radius:3px}
html[data-edcolors=d] .clist button.on,html[data-edcolors=d] .clist label:has(input:checked){border-color:#3fd0e0;background:rgba(63,208,224,.07);box-shadow:inset 3px 0 0 #3fd0e0}
html[data-edcolors=d] .clist .dtag{text-transform:uppercase;letter-spacing:.14em;font-size:10px;border-radius:2px}
html[data-edcolors=d] .prow input,html[data-edcolors=d] select.who{background-color:#081321;border-color:rgba(150,200,240,.3);border-radius:3px}
html[data-edcolors=d] select.who option,html[data-edcolors=d] select.who optgroup{background:#0a1626}
html[data-edcolors=d] .ingame{border-color:#3fd0e0;background:rgba(63,208,224,.06)}
html[data-edcolors=d] .aitag{text-transform:uppercase;letter-spacing:.14em;font-size:9.5px;color:#7fc4e8;border-color:rgba(127,196,232,.5);border-radius:2px}
html[data-edcolors=d] .modal.menu{scrollbar-color:rgba(150,200,240,.35) transparent}
html[data-edcolors=d] #vp{background:radial-gradient(ellipse 85% 75% at 45% 40%,#13263b 0%,#0b1828 55%,#060d17 100%)}
html[data-edcolors=d] .brand{color:#dbe9f6;font-family:var(--ui);font-weight:800;text-transform:uppercase;letter-spacing:.16em;font-size:15px}
html[data-edcolors=d] #roundLbl{letter-spacing:.2em;color:#7fc4e8}
html[data-edcolors=d] .tbtn,html[data-edcolors=d] .pchip,html[data-edcolors=d] .zoomctl button,html[data-edcolors=d] .pile .lbl,html[data-edcolors=d] #rdock button{border-radius:3px}
html[data-edcolors=d] .tbtn.on{border-color:#3fd0e0;color:#bff3f9}
html[data-edcolors=d] #prompt{border-radius:3px;color:#e6eef6}
html[data-edcolors=d] #prompt b{color:#7fe3ee}
html[data-edcolors=d] #hist{border-radius:3px}
html[data-edcolors=d] .ht+.ht{border-top:1px solid rgba(150,200,240,.14)}
html[data-edcolors=d] .hwho{text-transform:uppercase;letter-spacing:.1em;font-size:12px}
html[data-edcolors=d] #playLbl{letter-spacing:.2em;color:#7fc4e8}
html[data-edcolors=d] #banner{border-radius:3px}
html[data-edcolors=d] #banner .s{letter-spacing:.2em;color:#7fc4e8}
html[data-edcolors=d] #rdock .rgrp button.pri{background:#3fd0e0;color:#04202a;border-color:#3fd0e0}
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
