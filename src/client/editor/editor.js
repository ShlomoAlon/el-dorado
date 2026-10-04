/* The design editor (owner, 2026-10-05): a mockup tool, loaded only from a link with ?edit (main.js); a page without it never
   fetches this file, so it costs nothing. It changes only this browser's view. Its tools are general, and exactly as many as
   the menu designs proposed so far need (D1-A's title screen, D1-B's short setup with More options, D2-A's framed panels,
   the menu mix): none of those designs is built in, each can be made with these, and nothing much beyond them can:
   - Options: areas with a few designs to flip between, live in the game (the cards, the buttons' shape); each option is CSS below.
   - Layout: a menu screen as a grid (columns, row height, gap); its blocks (a field, a row of buttons, a heading) moved to
     snap into cells, stretched over several, split into their parts, hidden, or folded behind "More options"; each block's
     surface, alignment, padding, text size and font, and its buttons' style and size, all from fixed lists (the palette's
     colours, the page's two fonts).
   - Screens: the screen's width and backdrop; new screens, blocks moved between screens, buttons that go to a screen (their
     label the only text typed here), and which screen the menu opens on.
   - Export: the design as a short text (kept in this browser meanwhile) for the owner to send; it is then built into the
     page properly. Nothing here ships as the page's own layout. */
const ED = window.__ED, KEY = 'eldorado-design', $ = s => document.querySelector(s), form = $('#mform');
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }; // (expected: storage off, or an old text)
const D = Object.assign({ v: 3, options: {}, screens: {}, extra: [], first: {}, states: {} }, load() || {});
if (typeof D.first !== 'object' || !D.first) D.first = {}; // (a design from before the states)
/* the player is always in exactly one state (owner, 2026-10-05): in a game, in a room, or nowhere; a screen belongs to one,
   the menu opens on a screen chosen per state, and a button goes only to a screen of its own state (a new game only from
   nowhere, a new room only from nowhere: no flow can skip leaving the game or the room) */
const STATES = [['none', 'Nowhere'], ['game', 'In a game'], ['room', 'In a room']];
const HOME = { setup: 'none', online: 'none', replays: 'none', room: 'room' }; // (the page's own screens)
const stateOf = sc => D.states[sc] || HOME[sc] || 'none';
const stateNow = () => ED.online() && ED.NET.room ? 'room' : ED.S && !ED.S.over && !ED.G.replay ? 'game' : 'none';
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* expected: storage off; the design lives in Export */ } };

/* ---------- the lists everything is chosen from ---------- */
const AREAS = [
  { id: 'cards', name: 'Cards', options: [['a', 'Current'], ['b', 'Full art'], ['c', 'Clean']] },
  { id: 'buttons', name: 'Button shape', options: [['a', 'Current'], ['b', 'Rounded'], ['c', 'Square']] },
];
const BLOCK = { // a block's style: property → [value, label] (the first: the page's own)
  surface: [['', 'None'], ['panel', 'Panel'], ['framed', 'Framed']],
  align: [['', 'Fill'], ['start', 'Left'], ['center', 'Centre'], ['end', 'Right']],
  pad: [['', '0'], ['s', 'S'], ['m', 'M'], ['l', 'L']],
  text: [['', 'As is'], ['s', 'S'], ['m', 'M'], ['l', 'L'], ['xl', 'XL']],
  font: [['', 'Sans'], ['serif', 'Serif']],
  tone: [['', 'As is'], ['pri', 'Gold'], ['plain', 'Plain'], ['quiet', 'Outline'], ['link', 'Link']],
  size: [['', 'As is'], ['s', 'S'], ['m', 'M'], ['l', 'L']],
};
const SCREEN = { width: [['', 'As is'], ['narrow', 'Narrow'], ['medium', 'Medium'], ['wide', 'Wide']], backdrop: [['', 'As is'], ['game', 'Game shows'], ['dark', 'Darker'], ['solid', 'Solid']] };
const applyOptions = () => { for (const a of AREAS) document.documentElement.dataset['ed' + a.id] = D.options[a.id] || 'a'; ED.render(); };

/* ---------- blocks: every element directly in a screen, named once by where it first stood ---------- */
const sections = () => [...form.querySelectorAll(':scope > section[data-screen]')];
const name = el => el.dataset.edk || (el.dataset.edk = el.id ? '#' + el.id : (el.parentElement.matches('section') ? el.parentElement.dataset.screen : name(el.parentElement)) + '>' + [...el.parentElement.children].indexOf(el));
for (const s of sections()) for (const el of s.querySelectorAll('*')) name(el); // (named before anything moves)
const byName = k => form.querySelector(`[data-edk="${CSS.escape(k)}"]`);
const conf = sc => D.screens[sc] || (D.screens[sc] = { cols: 4, rowH: 44, gap: 10, blocks: {} });
// the screens the editor added (D.extra: their names), and the buttons that go to a screen
function makeExtra() {
  for (const x of D.extra) if (!form.querySelector(`section[data-screen="${x}"]`)) { const s = document.createElement('section'); s.dataset.screen = x; s.hidden = true; s.dataset.ed = '1'; form.appendChild(s); }
  for (const s of sections()) { const c = D.screens[s.dataset.screen]; if (!c) continue;
    for (const [k, b] of Object.entries(c.blocks)) {
      if (b.go && !byName(k)) { const el = document.createElement('div'); el.className = 'mrow'; el.dataset.edk = k; el.innerHTML = '<button type="button" class="btn"></button>'; s.appendChild(el); }
      const el = byName(k); if (!el) continue;
      if (b.go) { el.firstChild.textContent = b.label || 'Go'; el.firstChild.dataset.edGo = b.go; }
      if (el.closest('section') !== s) s.appendChild(el); } } // (moved to this screen)
}
const items = s => { const c = D.screens[s.dataset.screen], out = []; const walk = p => { for (const el of p.children) { if (el.classList.contains('ed-grid')) continue; const k = name(el), b = c && c.blocks[k];
    if (b && b.split && el.children.length > 1) walk(el); else out.push([k, el]); } }; walk(s); return out; };

/* ---------- which screen is on show ---------- */
let edScreen = null, editing = false, sel = null, foldOpen = false; // (edScreen: a screen the editor shows, the menu's own choice aside)
const shown = () => { const m = $('#menu'); return m && m.open ? form.querySelector(':scope > section[data-screen]:not([hidden])') : null; };
let wasOpen = false;
function screens() { const m = $('#menu'), open = !!(m && m.open);
  if (open && !wasOpen) edScreen = D.first[stateNow()] || null; wasOpen = open; if (!open) return; // (opened: on the screen the design starts with)
  if (edScreen) for (const s of sections()) { const want = s.dataset.screen !== edScreen; if (s.hidden !== want) s.hidden = want; } }
addEventListener('click', e => { const g = e.target.closest('[data-ed-go]'); if (!g || editing) return; e.preventDefault(); e.stopPropagation();
  edScreen = g.dataset.edGo === '(menu)' ? null : g.dataset.edGo; foldOpen = false; if (!edScreen) for (const s of sections()) if (s.dataset.ed) s.hidden = true; ED.render(); layout(); }, true);

/* ---------- laying a screen out ---------- */
const CLS = /^ed-(surface|align|pad|text|font|tone|size)-/;
function layout() {
  makeExtra(); screens();
  const s = shown(); for (const x of sections()) if (x !== s) unlay(x);
  const sc = s && s.dataset.screen, c = s && D.screens[sc];
  form.dataset.edWidth = (c && c.width) || ''; $('#dim').dataset.edBackdrop = (c && c.backdrop) || '';
  if (!s || !c) { if (s) unlay(s); panel(); return; }
  s.classList.add('ed-laid'); s.classList.toggle('ed-on', editing);
  Object.assign(s.style, { display: 'grid', gridTemplateColumns: `repeat(${c.cols},minmax(0,1fr))`, gridAutoRows: `minmax(${c.rowH}px,auto)`, gap: c.gap + 'px', position: 'relative' });
  let row = 1; const its = items(s);
  for (const [k, el] of its) { const b = c.blocks[k] || (c.blocks[k] = { c: 1, r: row, w: c.cols, h: 1 }); row = Math.max(row, b.r + b.h);
    const col = Math.min(b.c, c.cols); el.style.gridColumn = `${col} / span ${Math.min(b.w, c.cols - col + 1)}`; el.style.gridRow = `${b.r} / span ${b.h}`;
    const off = b.hide || (b.fold && !foldOpen); el.style.display = off && !editing ? 'none' : ''; el.classList.toggle('ed-hidden', !!b.hide); el.classList.toggle('ed-folded', !!b.fold);
    el.classList.toggle('ed-sel', editing && k === sel);
    for (const x of [...el.classList]) if (CLS.test(x)) el.classList.remove(x);
    for (const p of Object.keys(BLOCK)) if (b[p]) el.classList.add(`ed-${p}-${b[p]}`); }
  // a screen with folded blocks has a "More options" button, a block like the others
  const anyFold = its.some(([k]) => c.blocks[k].fold), mk = sc + '>more'; let more = byName(mk);
  if (anyFold && !more) { more = document.createElement('div'); more.className = 'mrow'; more.dataset.edk = mk; more.innerHTML = '<button type="button" class="btn ed-more">More options</button>'; s.appendChild(more); layout(); return; }
  if (!anyFold && more) { more.remove(); delete c.blocks[mk]; }
  if (more) more.firstChild.textContent = foldOpen ? 'Fewer options' : 'More options';
  s.querySelectorAll('*').forEach(el => { const b = el.dataset.edk && c.blocks[el.dataset.edk]; el.classList.toggle('ed-split', !!(b && b.split && el.children.length > 1)); });
  let g = s.querySelector(':scope > .ed-grid'); if (editing) { if (!g) { g = document.createElement('div'); g.className = 'ed-grid'; s.appendChild(g); }
    g.style.cssText = `grid-template-columns:repeat(${c.cols},minmax(0,1fr));grid-template-rows:${getComputedStyle(s).gridTemplateRows};gap:${c.gap}px`;
    const n = c.cols * Math.max(row, 2); if (g.children.length !== n) g.innerHTML = '<i></i>'.repeat(n); } else if (g) g.remove();
  panel();
}
function unlay(s) { if (!s.classList.contains('ed-laid')) return; s.classList.remove('ed-laid', 'ed-on'); for (const p of ['display', 'gridTemplateColumns', 'gridAutoRows', 'gap', 'position']) s.style[p] = '';
  s.querySelectorAll('*').forEach(el => { el.style.gridColumn = el.style.gridRow = ''; if (el.classList.contains('ed-hidden') || el.classList.contains('ed-folded')) el.style.display = '';
    for (const x of [...el.classList]) if (CLS.test(x) || /^ed-(hidden|folded|sel|split)$/.test(x)) el.classList.remove(x); });
  const g = s.querySelector(':scope > .ed-grid'); if (g) g.remove(); }
addEventListener('click', e => { if (!editing && e.target.closest('.ed-more')) { e.preventDefault(); e.stopPropagation(); foldOpen = !foldOpen; layout(); } }, true);

/* ---------- moving and stretching blocks (editing: nothing in the menu is used meanwhile) ---------- */
function cellAt(s, c, x, y) { const r = s.getBoundingClientRect(), cs = getComputedStyle(s), pl = parseFloat(cs.paddingLeft), pt = parseFloat(cs.paddingTop);
  const cw = (r.width - pl - parseFloat(cs.paddingRight) - (c.cols - 1) * c.gap) / c.cols, col = Math.floor((x - r.left - pl) / (cw + c.gap)) + 1;
  let yy = r.top + pt, row = 1; for (const h of cs.gridTemplateRows.split(' ').map(parseFloat)) { if (y < yy + h + c.gap / 2) break; yy += h + c.gap; row++; }
  return [Math.max(1, Math.min(c.cols, col)), Math.max(1, row)]; }
let drag = null;
addEventListener('pointerdown', e => { if (!editing) return; const s = shown(); if (!s || !s.contains(e.target)) return; const c = D.screens[s.dataset.screen]; if (!c) return;
  const hit = items(s).find(([, el]) => el.contains(e.target)); if (!hit) return; e.preventDefault(); e.stopPropagation(); const [k, el] = hit; sel = k;
  const r = el.getBoundingClientRect(), b = c.blocks[k], [cc, rr] = cellAt(s, c, e.clientX, e.clientY);
  drag = { k, mode: e.clientX > r.right - 12 ? 'w' : e.clientY > r.bottom - 10 ? 'h' : 'move', dc: cc - b.c, dr: rr - b.r }; layout(); }, true);
addEventListener('pointermove', e => { if (!drag) return; const s = shown(); if (!s) { drag = null; return; } const c = D.screens[s.dataset.screen], b = c.blocks[drag.k], [cc, rr] = cellAt(s, c, e.clientX, e.clientY);
  if (drag.mode === 'move') { b.c = Math.max(1, Math.min(c.cols - b.w + 1, cc - drag.dc)); b.r = Math.max(1, rr - drag.dr); }
  else if (drag.mode === 'w') b.w = Math.max(1, Math.min(c.cols - b.c + 1, cc - b.c + 1)); else b.h = Math.max(1, rr - b.r + 1);
  layout(); }, true);
addEventListener('pointerup', () => { if (drag) { drag = null; save(); } }, true);
for (const t of ['click', 'change', 'input', 'keydown']) addEventListener(t, e => { const s = shown(); if (editing && s && s.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true);

/* ---------- the panel ---------- */
const box = document.createElement('div'); box.id = 'edPanel'; document.body.appendChild(box);
let tab = 'layout', at = { x: null, y: 12 }, mini = false; // (mini: only its title bar, out of the game's way)
const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const pick = (act, list, cur) => list.map(([v, n]) => `<button data-act="${act}" data-v="${v}" class="${(cur || '') === v ? 'on' : ''}">${n}</button>`).join('');
const row = (label, inner) => `<div class="ed-row"><b>${label}</b><span>${inner}</span></div>`;
const num = (act, v) => `<button data-act="${act}-">−</button> ${v} <button data-act="${act}+">+</button>`;
function panel() {
  const s = shown(), sc = s && s.dataset.screen, c = sc && D.screens[sc], b = c && sel && c.blocks[sel], el = b && byName(sel);
  const all = sections().map(x => x.dataset.screen);
  let body;
  if (tab === 'options') body = AREAS.map(a => row(a.name, a.options.map(([id, n]) => `<button data-opt="${a.id}" data-v="${id}" class="${(D.options[a.id] || 'a') === id ? 'on' : ''}">${n}</button>`).join(''))).join('');
  else if (tab === 'layout') {
    if (!s) body = '<p>Open the menu to lay out its screens.</p>';
    else if (!c) body = `<p>Screen: <b>${esc(sc)}</b></p><button data-act="grid">Lay this screen out on a grid</button>`;
    else body = `<p>Screen: <b>${esc(sc)}</b> <button data-act="edit" class="${editing ? 'on' : ''}">${editing ? 'Editing: blocks move' : 'Trying it: blocks work'}</button></p>`
      + row('State', `${esc(STATES.find(([v]) => v === stateOf(sc))[1])}${D.extra.includes(sc) ? ' ' + pick('state', STATES, stateOf(sc)) : ''}`)
      + row('Columns', num('cols', c.cols)) + row('Row height', num('rowH', c.rowH)) + row('Gap', pick('gap', [['6', 'S'], ['10', 'M'], ['16', 'L']], String(c.gap)))
      + row('Width', pick('width', SCREEN.width, c.width)) + row('Backdrop', pick('backdrop', SCREEN.backdrop, c.backdrop))
      + (b ? `<hr><p>Block <b>${esc(sel)}</b></p>` + row('Width', num('w', b.w)) + row('Height', num('h', b.h))
        + row('Block', `${el && (el.children.length > 1 || b.split) && !b.go ? `<button data-act="split">${b.split ? 'Join' : 'Split into parts'}</button>` : ''}<button data-act="hide" class="${b.hide ? 'on' : ''}">Hidden</button><button data-act="fold" class="${b.fold ? 'on' : ''}">In More options</button>`)
        + Object.entries(BLOCK).filter(([p]) => !['tone', 'size'].includes(p) || (el && (el.matches('button') || el.querySelector('button')))).map(([p, list]) => row(p[0].toUpperCase() + p.slice(1), pick('st-' + p, list, b[p]))).join('')
        + row('Move to', `<select data-act="to">${all.filter(x => stateOf(x) === stateOf(sc)).map(x => `<option ${x === sc ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`)
        + (b.go ? row('Goes to', `<select data-act="goto">${['(menu)', ...all.filter(x => stateOf(x) === stateOf(sc))].map(x => `<option ${x === b.go ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select><button data-act="label">Label…</button><button data-act="del">Remove</button>`) : '')
        : editing ? '<p>Press a block to choose it and move it; drag its right or bottom edge to stretch it.</p>' : '')
      + `<hr>${row('Screens', `<button data-act="newscreen">New screen…</button><button data-act="addgo">Add a button that goes to…</button>`)}`
      + STATES.map(([st, n]) => row(`Opens on (${n.toLowerCase()})`, `<select data-act="first" data-v="${st}">${['(as is)', ...all.filter(x => stateOf(x) === st)].map(x => `<option ${x === (D.first[st] || '(as is)') ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`)).join('')
      + `<button data-act="reset">This screen back to the page's own</button>`;
  } else body = `<p>Your design is kept in this browser as you go. To send it to me, download it and attach the file.</p>`
    + row('', '<button data-act="download">Download design</button><button data-act="import">Load a design file…</button>') + row('', '<button data-act="clear">Start over</button>');
  const html = `<div class="ed-head"><b>Design editor</b><span>${mini ? '' : ['layout', 'options', 'export'].map(t => `<button data-tab="${t}" class="${tab === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}<button data-act="mini" title="${mini ? 'Open the editor' : 'Shrink it out of the way'}">${mini ? '▾' : '▴'}</button></span></div>${mini ? '' : `<div class="ed-body">${body}</div>`}`;
  if (box.__h !== html) { box.__h = html; box.innerHTML = html; }
  box.style.left = at.x === null ? '' : at.x + 'px'; box.style.right = at.x === null ? '12px' : ''; box.style.top = at.y + 'px';
}
function act(t, a, v) {
  const s = shown(), sc = s && s.dataset.screen, c = sc && D.screens[sc], b = c && sel && c.blocks[sel], clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  if (a === 'grid') { conf(sc); editing = true; }
  else if (a === 'edit') { editing = !editing; if (!editing) sel = null; }
  else if (/^(cols|rowH)[-+]$/.test(a)) { const p = a.slice(0, -1), d = a.endsWith('+') ? 1 : -1; c[p] = p === 'cols' ? clamp(c.cols + d, 1, 12) : clamp(c.rowH + 4 * d, 24, 140); }
  else if (a === 'gap') c.gap = +v; else if (a === 'width' || a === 'backdrop') c[a] = v || undefined;
  else if (b && /^[wh][-+]$/.test(a)) { const d = a.endsWith('+') ? 1 : -1; if (a[0] === 'w') b.w = clamp(b.w + d, 1, c.cols - b.c + 1); else b.h = Math.max(1, b.h + d); }
  else if (b && a === 'split') { b.split = !b.split; sel = null; }
  else if (b && (a === 'hide' || a === 'fold')) b[a] = !b[a] || undefined;
  else if (b && a.startsWith('st-')) b[a.slice(3)] = v || undefined;
  else if (b && a === 'to' && v !== sc) { const to = conf(v); to.blocks[sel] = Object.assign({}, b, { c: 1, r: 99, w: to.cols }); delete c.blocks[sel]; sel = null; makeExtra(); }
  else if (b && a === 'goto') b.go = v;
  else if (b && a === 'label') { const l = prompt('The button\'s label', b.label || ''); if (l != null) b.label = l.slice(0, 40); }
  else if (b && a === 'del') { const e = byName(sel); if (e) e.remove(); delete c.blocks[sel]; sel = null; }
  else if (a === 'newscreen') { const n = (prompt('A name for the new screen (for example: title)') || '').trim().replace(/[^\w -]/g, '').slice(0, 24); if (!n || sections().some(x => x.dataset.screen === n)) return;
    D.extra.push(n); D.states[n] = stateNow(); conf(n); makeExtra(); }
  else if (a === 'addgo') { if (!c) return; const k = sc + '>go' + Date.now().toString(36); c.blocks[k] = { c: 1, r: 99, w: c.cols, h: 1, go: '(menu)', label: 'Go', tone: 'pri' }; sel = k; editing = true; }
  else if (a === 'first') D.first[t.dataset.v] = v === '(as is)' ? undefined : v;
  else if (a === 'state' && D.extra.includes(sc)) D.states[sc] = v;
  else if (a === 'reset') { delete D.screens[sc]; editing = false; sel = null; unlay(s); }
  else if (a === 'download') { const u = URL.createObjectURL(new Blob([JSON.stringify(D, null, 1)], { type: 'application/json' })), l = document.createElement('a');
    l.href = u; l.download = `eldorado-design-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); return; }
  else if (a === 'import') { const f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json';
    f.onchange = () => f.files[0] && f.files[0].text().then(txt => { const n = JSON.parse(txt); if (!n || typeof n.screens !== 'object') throw new Error('no screens in it');
      localStorage.setItem(KEY, JSON.stringify(n)); location.reload(); }).catch(err => alert('That file isn\'t a design: ' + err.message)); f.click(); return; }
  else if (a === 'clear') { if (!confirm('Start over: forget this design?')) return; localStorage.removeItem(KEY); location.reload(); return; }
  save(); applyOptions(); layout();
}
box.addEventListener('click', e => { const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; mini = false; panel(); return; }
  if (t.dataset.act === 'mini') { mini = !mini; panel(); return; }
  if (t.dataset.opt) { D.options[t.dataset.opt] = t.dataset.v; save(); applyOptions(); panel(); return; }
  act(t, t.dataset.act, t.dataset.v); });
box.addEventListener('change', e => { const t = e.target; if (t.matches('select[data-act]')) act(t, t.dataset.act, t.value); });
box.addEventListener('pointerdown', e => { if (!e.target.closest('.ed-head') || e.target.closest('button')) return; const r = box.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
  const mv = ev => { at = { x: Math.max(0, ev.clientX - ox), y: Math.max(0, ev.clientY - oy) }; panel(); }, up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); });
// the menu's own screens change by its own clicks: the layout follows whichever is on show
new MutationObserver(() => { if (!drag) layout(); }).observe($('#menu'), { attributes: true, subtree: true, attributeFilter: ['hidden', 'open'] });

/* ---------- styles: the editor's own, the block styles' (palette colours and the page's fonts only), the options' ---------- */
const css = document.createElement('style'); css.textContent = `
#edPanel{position:fixed;z-index:2000;width:310px;max-height:86vh;overflow:auto;background:#101915f2;color:#eae3cf;border:1px solid #5b4a26;border-radius:12px;font:13px/1.35 Figtree,system-ui,sans-serif;box-shadow:0 10px 30px #0009}
#edPanel .ed-head{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:8px 10px;cursor:move;border-bottom:1px solid #3a3020;position:sticky;top:0;background:#101915;z-index:1}
#edPanel .ed-body{padding:8px 10px}#edPanel p{margin:6px 0}#edPanel hr{border:0;border-top:1px solid #3a3020;margin:8px 0}
#edPanel button,#edPanel select{font:inherit;color:inherit;background:#22302a;border:1px solid #4a5a50;border-radius:7px;padding:2px 7px;margin:2px;cursor:pointer}
#edPanel button.on{background:#e9b24a;color:#2a1c05;border-color:#e9b24a}
#edPanel .ed-row{display:flex;justify-content:space-between;align-items:center;gap:6px;margin:3px 0}#edPanel .ed-row span{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center}
#edPanel textarea{width:100%;height:90px;font:11px monospace;background:#0b120f;color:#cfe;border:1px solid #3a3020;border-radius:6px}
section.ed-on > *:not(.ed-grid),section.ed-on .ed-split > *{outline:1px dashed #e9b24a99;outline-offset:2px;cursor:move}
section.ed-on .ed-split{outline:none!important}section.ed-on .ed-sel{outline:2px solid #e9b24a!important}
section.ed-on .ed-hidden{opacity:.25}section.ed-on .ed-folded{opacity:.6;outline-style:dotted!important}
.ed-grid{position:absolute;inset:0;display:grid;pointer-events:none;z-index:-1}.ed-grid i{border:1px dashed #ffffff22;border-radius:4px}
.ed-split{display:contents!important}
.ed-surface-panel{background:rgba(255,255,255,.045);border-radius:12px}
.ed-surface-framed{background:linear-gradient(#2b2217,#1a140c);border:2px solid var(--gold2,#c9a35a);border-radius:12px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.5),0 6px 16px rgba(0,0,0,.4)}
.ed-align-start{justify-self:start;text-align:left}.ed-align-center{justify-self:center;text-align:center}.ed-align-end{justify-self:end;text-align:right}
.ed-align-center.mrow,.ed-align-center .mrow{justify-content:center}.ed-align-end.mrow,.ed-align-end .mrow{justify-content:flex-end}.ed-align-start.mrow,.ed-align-start .mrow{justify-content:flex-start}
.ed-pad-s{padding:8px}.ed-pad-m{padding:14px}.ed-pad-l{padding:22px}
.ed-text-s{font-size:.85em}.ed-text-m{font-size:1em}.ed-text-l{font-size:1.3em}.ed-text-xl{font-size:1.9em}
.ed-text-l h2,.ed-text-xl h2{font-size:1.3em}
.ed-font-serif,.ed-font-serif h2,.ed-font-serif label,.ed-font-serif p{font-family:var(--display,'Young Serif',serif)}
.ed-tone-pri button,button.ed-tone-pri{background:var(--gold,#e9b24a)!important;color:#2a1c05!important;border-color:transparent!important}
.ed-tone-plain button,button.ed-tone-plain{background:#22302a!important;color:#eae3cf!important;border:1px solid #4a5a50!important}
.ed-tone-quiet button,button.ed-tone-quiet{background:transparent!important;color:#eae3cf!important;border:1px solid #eae3cf66!important}
.ed-tone-link button,button.ed-tone-link{background:none!important;border:0!important;color:var(--gold2,#e9b24a)!important;text-decoration:underline;box-shadow:none!important}
.ed-size-s button,button.ed-size-s{font-size:.85em;padding:4px 10px}.ed-size-m button,button.ed-size-m{font-size:1em;padding:8px 16px}.ed-size-l button,button.ed-size-l{font-size:1.2em;padding:12px 26px}
#mform[data-ed-width=narrow]{width:min(420px,96vw)!important;max-width:none}#mform[data-ed-width=medium]{width:min(560px,96vw)!important;max-width:none}#mform[data-ed-width=wide]{width:min(780px,96vw)!important;max-width:none}
#dim[data-ed-backdrop=game].on{opacity:.4}#dim[data-ed-backdrop=dark].on{opacity:1;background:rgba(2,5,4,.9)}#dim[data-ed-backdrop=solid].on{opacity:1;background:#0b120f}
/* cards b: full art (the picture fills the card; title and text over its foot) */
html[data-edcards=b] .c-art{inset:0;height:auto;border-radius:.7em}
html[data-edcards=b] .c-title{top:auto;bottom:38%;transform:translateX(-50%)}
html[data-edcards=b] .c-body{top:auto;height:34%;background:linear-gradient(180deg,transparent,rgba(0,0,0,.82) 30%);border-radius:0 0 .6em .6em}
html[data-edcards=b] .cface::after{border-color:rgba(255,226,160,.35)}
/* cards c: clean (flat colour, title on top, smaller picture, larger symbols) */
html[data-edcards=c] .cface{background:var(--body);box-shadow:0 0 0 .14em var(--acc),0 .25em .6em rgba(0,0,0,.45)}
html[data-edcards=c] .cface::after{display:none}
html[data-edcards=c] .c-title{top:.5em;transform:translateX(-50%);background:none;border:0;box-shadow:none;color:var(--acc)}
html[data-edcards=c] .c-art{top:2.1em;height:44%;border-radius:.4em}
html[data-edcards=c] .c-body{top:calc(44% + 2.5em);background:none}
html[data-edcards=c] .c-icons svg{width:1.8em;height:1.8em}
html[data-edcards=c] .c-pow{top:auto;bottom:.2em;left:auto;right:.2em;transform:scale(.8)}
/* button shape b: rounded; c: square */
html[data-edbuttons=b] .btn,html[data-edbuttons=b] #menu button{border-radius:999px}
html[data-edbuttons=c] .btn,html[data-edbuttons=c] #menu button{border-radius:3px}
`;
document.head.appendChild(css);
applyOptions(); layout();
