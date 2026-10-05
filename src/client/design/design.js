/* The design editor (owner, 2026-10-05; docs/HANDOFF.md "The theme and the design editor"): a way for the owner to show
   Claude what the menus should be. Opened by the menu's Design button (this file is fetched only then); its panel stays
   while the game works as usual, and nothing is editable until Edit is on. Every edit is an operation on one of the
   theme's parts, undone exactly; Copy gives the net changes, each with where it is, what changed and the owner's note.
   The site itself is never changed: what the editor shows lives in this page only. */
const $ = s => document.querySelector(s);
const FORM = $('#mform');
const fail = m => { throw new Error('assertion failed: design: ' + m); }; // (an uncaught error: the page's boundary reports it)
const check = (ok, m) => { if (!ok) fail(m); };

import { PART, UNIT, OPTION, partSpec, TYPES, WIDTHS, ALLOWED, STACK, LIST, CHOICE, CONTAINER, accepts, BLOCKS } from './parts.js';

const SCREENS = { setup: 'This device', online: 'Online', room: 'Room lobby', replays: 'Replays' };

/* ---------- where things are, in words (the copied notes) and as a path (to find it in the code) ---------- */
const shorten = t => { t = t.replace(/\s+/g, ' ').trim(); return t.length > 40 ? t.slice(0, 39) + '…' : t; };
function textOf(el) {
  if (el.matches('select')) return [...el.options].slice(0, 3).map(o => o.text).join(' / ');
  if (el.matches(UNIT)) return shorten([...el.children].map(c => c.textContent.trim()).filter(Boolean).join(' / '));
  if (el.matches('.field')) { const l = el.querySelector(':scope>label'); return l ? shorten(l.textContent) : ''; }
  if (el.matches('input')) return el.placeholder || el.name || '';
  if (el.matches(CONTAINER)) { const f = [...el.children].find(c => c.textContent.trim()); return f ? shorten('with ' + f.textContent) : ''; }
  return shorten(el.textContent);
}
const nameOf = el => { const s = partSpec(el), t = textOf(el); return (s ? s[1] : el.tagName.toLowerCase()) + (t ? ` "${t}"` : ''); };
// a part's look in words (its type, size and width), for the changes
const LOOKWORDS = { pri: 'main', linkbtn: 'link', big: 'big', gold: 'gold', dashed: 'dashed', 'd-w4': 'a quarter wide', 'd-w2': 'half wide', 'd-w1': 'full width' };
const lookOf = cls => { const c = cls.split(/\s+/), w = c.filter(x => LOOKWORDS[x]).map(x => LOOKWORDS[x]); if (c.includes('btn') && !c.includes('pri')) w.unshift('plain'); return w.join(', ') || 'plain'; };
function pathOf(el) { const out = []; for (let e = el; e && e !== FORM; e = e.parentElement) {
  if (e.id && !e.dataset.dcopy) { out.unshift('#' + e.id); break; }
  if (e.dataset.screen) { out.unshift(`section[data-screen=${e.dataset.screen}]`); break; }
  const cls = [...e.classList].filter(c => !c.startsWith('d-'))[0];
  out.unshift(e.tagName.toLowerCase() + (cls ? '.' + cls : '') + (e.dataset.v ? `[data-v="${e.dataset.v}"]` : `:nth-child(${[...e.parentElement.children].indexOf(e) + 1})`)); }
  return out.join(' > '); }
function placeOf(el) {
  const sec = el.closest('section[data-screen]'), field = el.parentElement.closest('.field'), lbl = field && field.querySelector(':scope>label');
  return [sec ? SCREENS[sec.dataset.screen] || sec.dataset.screen : el.closest('#ingame') ? 'The game-in-progress bar' : 'Every menu screen', lbl && lbl !== el ? lbl.textContent.trim() : null].filter(Boolean).join(' › ');
}
// a part's place among its siblings, in words
function spotOf(parent, next, self) {
  const vis = n => n && n.nodeType === 1 && n !== self && !n.classList.contains('d-gone');
  while (next && next === self) next = next.nextElementSibling;
  let prev = next ? next.previousElementSibling : parent.lastElementChild; while (prev && !vis(prev)) prev = prev.previousElementSibling;
  const into = parent.matches('section[data-screen]') ? 'the screen' : nameOf(parent);
  return prev ? `in ${into}, after ${nameOf(prev)}` : `first in ${into}`;
}

/* ---------- edits: each one done and undone exactly; the page is always the original plus the edits done ---------- */
const ops = []; let at = 0; // (ops[0..at) are done)
const notes = new Map(); // element → the owner's note
const firsts = new Map(); // element → how it was before its first edit (for the changes list)
const copies = new Set(); // elements made by Copy
const nextReal = el => { let n = el.nextElementSibling; while (n && copies.has(n)) n = n.nextElementSibling; return n; };
function remember(el) { if (!firsts.has(el) && !copies.has(el)) firsts.set(el, { parent: el.parentElement, next: nextReal(el), spot: spotOf(el.parentElement, el.nextElementSibling, el), cls: el.className, text: textOf(el), tag: el.tagName }); }
function run(op) {
  for (const el of op.touches) remember(el);
  const before = snapshot(op.scope); ops.length = at; ops.push({ ...op, before }); op.do(); at++; changed();
}
function undo() { if (!at) return; const op = ops[--at]; op.undo(); check(snapshot(op.scope) === op.before, `undo leaves the menu as it was before "${op.what}"`); changed(); }
function redo() { if (at >= ops.length) return; ops[at++].do(); changed(); }
function reset() { while (at) undo(); ops.length = 0; firsts.clear(); for (const c of copies) c.remove(); copies.clear(); changed(); }
// what an edit changed, as edits see it: the markup of the parts it touched (each edit names them: its scope), without the
// editor's own marks and without what the page itself shows or hides meanwhile (another screen chosen): what an undo gives back
const snapshot = scope => scope.map(e => e.innerHTML.replace(/ ?\bd-(sel|hov|mark|drag|in)\b/g, '').replace(/ class=""/g, '').replace(/ style=""/g, '').replace(/ hidden=""/g, '')).join('\n');
const place = (el, parent, next) => parent.insertBefore(el, next);
function moveOp(el, parent, next) { const from = [el.parentElement, el.nextElementSibling];
  return { what: 'move ' + nameOf(el), touches: [el], scope: [...new Set([from[0], parent])], do: () => place(el, parent, next), undo: () => place(el, ...from) }; }
function copyOp(el, parent, next) { const c = el.cloneNode(true), n = copies.size + 1;
  for (const x of [c, ...c.querySelectorAll('*')]) { x.removeAttribute('id'); if (x.name) x.name += '-copy' + n; x.classList.remove('d-sel', 'd-hov', 'd-mark'); }
  c.dataset.dcopy = String(n); copies.add(c);
  return { what: 'copy ' + nameOf(el), touches: [], scope: [parent], el: c, src: el, srcName: nameOf(el), do: () => place(c, parent, next), undo: () => c.remove() }; }
// a new part (the Add row, Add option): placed like a copy, with nothing it was copied from
function addOp(el, parent, next) { copies.add(el); el.dataset.dcopy = 'new' + copies.size;
  return { what: 'add ' + nameOf(el), touches: [], scope: [parent], el, src: null, do: () => place(el, parent, next), undo: () => el.remove() }; }
function newOption(unit) { // another option like the unit's last, with its own words (and value, so it is a choice of its own)
  const last = [...unit.children].filter(c => c.matches(OPTION)).pop(), o = last.cloneNode(true), n = copies.size + 1;
  for (const x of [o, ...o.querySelectorAll('*')]) { x.removeAttribute('id'); x.classList.remove('d-sel', 'd-hov', 'd-mark'); }
  const inp = o.querySelector('input'); if (inp) { inp.value = 'new' + n; inp.checked = false; } if (o.dataset.v) o.dataset.v = 'new' + n;
  const t = o.querySelector('span, b'); if (t) t.textContent = 'New option'; else if (!o.querySelector('input')) o.textContent = 'New option';
  return o; }
const delOp = el => ({ what: 'delete ' + nameOf(el), touches: [el], scope: [el.parentElement], do: () => el.classList.add('d-gone'), undo: () => el.classList.remove('d-gone') });
function clsOp(el, add, remove, what) {
  for (const c of add) check(ALLOWED.has(c), `an edit sets only the theme's classes (not "${c}")`);
  const had = el.className; return { what, touches: [el], scope: [el.parentElement], do: () => { el.classList.remove(...remove); el.classList.add(...add); }, undo: () => { el.className = had; } }; }
function noteOp(el, to) { const from = notes.get(el); const set = v => { if (v) notes.set(el, v); else notes.delete(el); };
  return { what: 'note on ' + nameOf(el), touches: [el], scope: [], do: () => set(to), undo: () => set(from) }; }
function textOp(el, to) { const from = el.textContent; return { what: 'text of ' + nameOf(el), touches: [el], scope: [el.parentElement], do: () => { el.textContent = to; }, undo: () => { el.textContent = from; } }; }
function tagOp(el, sel) { // a text part as another (title, lead, note): another element in its place, the same words
  const [tag, cls] = sel.split('.'), n = document.createElement(tag); if (cls) n.className = cls; n.textContent = el.textContent; if (el.id) n.id = el.id;
  return { what: 'type of ' + nameOf(el), touches: [el], scope: [el.parentElement], swap: [el, n], do: () => { el.replaceWith(n); moveMarks(el, n); }, undo: () => { n.replaceWith(el); moveMarks(n, el); } }; }
function moveMarks(a, b) { if (notes.has(a)) { notes.set(b, notes.get(a)); notes.delete(a); } if (sel === a) sel = b; }
const current = el => { for (const op of ops.slice(0, at)) if (op.swap && op.swap[0] === el) el = op.swap[1]; return el; };

/* ---------- the changes: what differs from the original now (an edit put back by hand is no change) ---------- */
function changes() {
  const out = [];
  for (const [orig, was] of firsts) { const el = current(orig); if (copies.has(el)) continue;
    const bits = [];
    if (el.classList.contains('d-gone')) bits.push('deleted');
    else {
      if (el.parentElement !== was.parent || nextReal(el) !== was.next) bits.push(`moved: was ${was.spot}; now ${spotOf(el.parentElement, el.nextElementSibling, el)}`);
      if (el.tagName !== was.tag) bits.push(`type ${was.tag.toLowerCase()} → ${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ').filter(c => !c.startsWith('d-s') && !c.startsWith('d-h') && c !== 'd-mark').join('.') : ''}`);
      const a = was.cls.split(/\s+/).filter(c => c && !/^d-(sel|hov|mark|drag)$/.test(c)), b = el.className.split(/\s+/).filter(c => c && !/^d-(sel|hov|mark|drag)$/.test(c));
      if (el.tagName === was.tag && a.join(' ') !== b.join(' ')) bits.push(`look: ${lookOf(a.join(' '))} → ${lookOf(b.join(' '))}`);
      if (textOf(el) !== was.text) bits.push(`text: "${was.text}" → "${textOf(el)}"`);
    }
    if (bits.length || notes.has(el)) out.push({ el, head: `${placeOf(el)} › ${nameOf(el)}`, path: `${pathOf(was.parent)} > …${el.id ? ' #' + el.id : ''}`, what: bits.join('; ') || 'unchanged' });
  }
  for (const c of copies) if (c.isConnected && !c.classList.contains('d-gone')) { const op = ops.slice(0, at).find(o => o.el === c);
    out.push(op.src ? { el: c, head: `${placeOf(c)} › a copy of ${op.srcName}`, path: pathOf(op.src), what: `placed ${spotOf(c.parentElement, c.nextElementSibling, c)}` }
      : { el: c, head: `${placeOf(c)} › a new ${nameOf(c)}`, path: pathOf(c.parentElement), what: `added ${spotOf(c.parentElement, c.nextElementSibling, c)}` }); }
  for (const x of out) if (notes.has(x.el)) x.what += ` — note: "${notes.get(x.el)}"`;
  for (const x of out) { x.line = `${x.head} (${x.path}): ${x.what}`; x.short = `${x.head}: ${x.what}`; }
  return out;
}
function copyText() { const c = changes(); return [`Design notes — El Dorado, ${innerWidth}×${innerHeight} at ${Math.round(devicePixelRatio * 100)}%`, ...c.map((x, i) => `${i + 1}. ${x.line}`)].join('\n'); }

/* ---------- the panel ---------- */
/* built on the first open, not when this file loads: the page fetches it while idle, and nothing of it exists (no style, no
   element, no listener) until Design is clicked (owner, 2026-10-05: the editor opens at once, and costs the game nothing) */
let panel, drop, hovEl = null;
function build() {
const css = document.createElement('style'); css.textContent = `
#dPanel{position:fixed;right:0;top:0;bottom:0;z-index:80;width:312px;overflow:auto;box-sizing:border-box;background:var(--panel);border-left:1px solid var(--line2);color:var(--text);font:var(--fs-m) var(--ui);padding:12px;display:flex;flex-direction:column;gap:10px}
#dPanel h3{margin:0;font:400 var(--fs-xl) var(--display);color:var(--gold2);display:flex;align-items:center;gap:8px}#dPanel h3 .sp{flex:1}
#dPanel .dr{display:flex;flex-wrap:wrap;gap:6px;align-items:center}#dPanel .dr>b{font-size:var(--fs-xs);color:var(--muted);text-transform:uppercase;letter-spacing:.1em;min-width:44px}
#dPanel button{height:var(--h-s);padding:0 10px;border-radius:var(--r-s);border:1px solid var(--line2);background:var(--well);color:var(--text);font:inherit;font-size:var(--fs-s);cursor:pointer}
#dPanel button.on{border-color:var(--gold);color:var(--gold2);background:var(--goldTint)}#dPanel button:disabled{opacity:.4;cursor:default}
#dPanel input,#dPanel textarea{width:100%;box-sizing:border-box;background:var(--well);border:1px solid var(--line2);border-radius:var(--r-s);color:var(--text);font:inherit;font-size:var(--fs-s);padding:6px 8px;resize:vertical}
#dPanel .dsel{border-top:1px solid var(--line);padding-top:8px;display:flex;flex-direction:column;gap:8px}#dPanel .dhint{color:var(--muted);font-size:var(--fs-s);margin:0}
#dPanel ol{margin:0;padding-left:18px;font-size:var(--fs-s);color:var(--soft);display:flex;flex-direction:column;gap:4px}#dPanel li{cursor:pointer}#dPanel li:hover{color:var(--text)}
#dPanel .dpath{gap:4px}#dPanel .dpath button{height:auto;padding:2px 8px}
#dPanel .dmain{height:var(--h-m);background:linear-gradient(var(--priA),var(--priB));border-color:var(--priEdge);color:var(--goldInk);font-weight:800}
.d-gone{display:none!important}
/* the panel has the right of the window to itself: the game and the menu make room (never under it) */
html.d-open #shell{width:calc(100% - 312px)}html.d-open #menu,html.d-open #dim,html.d-open .scrim{right:312px;width:auto}
@media (max-width:760px){#dPanel{top:auto;left:0;width:auto;height:45%;border-left:0;border-top:1px solid var(--line2)}
  html.d-open #shell{width:100%;height:55%}html.d-open #menu,html.d-open #dim,html.d-open .scrim{right:0;width:100%;bottom:45%;height:auto}}
.d-w4{width:calc(25% - 8px)!important;flex:0 0 auto!important}.d-w2{width:calc(50% - 5px)!important;flex:0 0 auto!important}.d-w1{width:100%!important;flex:0 0 auto!important}
.d-mark{outline:1px dashed var(--goldLine);outline-offset:2px}
/* what is chosen and what is under the pointer: the part itself outlined, on its own corners, settling in */
.d-hov{outline:1px solid var(--goldLine)!important;outline-offset:3px!important}
.d-sel{outline:2px solid var(--gold)!important;outline-offset:3px!important;animation:dIn var(--t-fast) var(--ease)}
@keyframes dIn{from{outline-offset:8px;outline-color:transparent}}
.d-ghost{position:fixed!important;left:0;top:0;z-index:95;pointer-events:none;opacity:.92;box-shadow:var(--sh2);margin:0!important;max-width:280px}
#dPanel .dadd button{cursor:grab}
.d-drag{position:relative;z-index:90;pointer-events:none;opacity:.92;box-shadow:var(--sh2)}
#dDrop{position:fixed;left:0;top:0;pointer-events:none;z-index:96;display:none;background:var(--gold);border-radius:2px}
html.d-editing #mform *{cursor:default}html.d-editing #mform{user-select:none}`;
document.head.appendChild(css);
panel = document.createElement('div'); panel.id = 'dPanel'; document.body.appendChild(panel);
drop = document.createElement('div'); drop.id = 'dDrop'; document.body.append(drop);
listen();
}
let editing = false, sel = null, flash = '', clip = null; // (clip: what Copy or Cut took, for Paste)
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const b = (act, label, on, v = '', dis = false) => `<button type="button" data-a="${act}" data-v="${esc(v)}" class="${on ? 'on' : ''}"${dis ? ' disabled' : ''}>${label}</button>`;
function typeOf(el, fam) { if (fam === 'text') return TYPES.text.find(([, , s]) => el.matches(s))?.[0];
  if (fam === 'button') return el.matches('.linkbtn') ? 'link' : el.matches('.pri') ? 'main' : 'plain'; if (fam === 'box') return el.matches('.gold') ? 'gold' : el.matches('.dashed') ? 'dashed' : 'plain'; }
function draw() {
  const ch = changes(), spec = sel && partSpec(sel), fam = spec && spec[2], simple = sel && sel.children.length === 0 && !sel.matches('input, select');
  panel.innerHTML = `<h3>Design <span class="sp"></span>${b('edit', editing ? 'Editing' : 'Edit', editing)}${b('close', '✕')}</h3>
    <div class="dr">${b('undo', 'Undo', false, '', !at)}${b('redo', 'Redo', false, '', at >= ops.length)}${b('reset', 'Reset', false, '', !ops.length)}</div>
    ${editing ? `<div class="dr"><b>Screen</b>${TABS.map(([v, n]) => b('screen', n, screenNow() === v, v, !$(`#sMode label[data-v="${v}"]`))).join('')}</div>` : ''}
    ${editing ? `<div class="dr dadd"><b>Add</b>${BLOCKS.map(([n], i) => b('add', n, false, String(i))).join('')}</div>` : ''}
    ${!editing ? '<p class="dhint">The game works as usual. Turn on Edit, then click a part of the menu to change it, or drag it somewhere else.</p>' : !sel ? '<p class="dhint">Click a part of the menu: the biggest part under the pointer first; click it again for a smaller one inside it (Escape: a bigger one; Alt + wheel: either). Drag to move it; Copy or Cut, then Paste on another screen.</p>'
    : `<div class="dsel"><div class="dr dpath">${chainAt(sel).map((x, i, c) => b('lvl', esc(partSpec(x) ? partSpec(x)[1] : x.tagName.toLowerCase()), i === c.length - 1, String(i))).join('<span class="dhint">›</span>')}</div>
      <b>${esc(nameOf(sel))}</b><span class="dhint">${esc(placeOf(sel))}</span>
      ${fam && TYPES[fam] ? `<div class="dr"><b>Type</b>${TYPES[fam].map(([v, n]) => b('type', n, typeOf(sel, fam) === v, v)).join('')}</div>` : ''}
      ${fam === 'button' && sel.matches('.btn') ? `<div class="dr"><b>Size</b>${b('big', 'Normal', !sel.matches('.big'), '')}${b('big', 'Big', sel.matches('.big'), 'big')}</div>` : ''}
      ${sel.matches(OPTION) ? '' : `<div class="dr"><b>Width</b>${WIDTHS.map(([v, n]) => b('w', n, v ? sel.classList.contains(v) : !WIDTHS.some(([w]) => w && sel.classList.contains(w)), v)).join('')}</div>`}
      ${simple ? `<div class="dr"><b>Text</b><input data-a="text" value="${esc(sel.textContent)}"></div>` : ''}
      <div class="dr"><b>Note</b><textarea data-a="note" rows="2" placeholder="What should change here?">${esc(notes.get(sel) || '')}</textarea></div>
      ${sel.matches(CHOICE) || sel.matches(OPTION) ? `<div class="dr">${b('addopt', 'Add option')}</div>` : ''}
      <div class="dr">${b('copy', 'Copy')}${b('cut', 'Cut')}${b('paste', 'Paste', false, '', !clip)}${b('del', 'Delete')}</div>
      ${clip ? `<p class="dhint">${clip.cut ? 'Cut' : 'Copied'}: ${esc(nameOf(clip.el))}. Choose where it goes (on any screen), then Paste: after the part chosen, or into it.</p>` : ''}</div>`}
    <div class="dsel"><b>Changes (${ch.length})</b>${ch.length ? `<ol>${ch.map((x, i) => `<li data-i="${i}">${esc(x.short)}</li>`).join('')}</ol>` : '<p class="dhint">None yet.</p>'}
      <div class="dr">${b('copyall', 'Copy for Claude', false, '', !ch.length)}</div>${flash ? `<p class="dhint">${esc(flash)}</p>` : ''}</div>`;
  panel.querySelector('[data-a="copyall"]').classList.add('dmain');
  for (const x of document.querySelectorAll('.d-mark')) x.classList.remove('d-mark');
  for (const x of ch) if (x.el.isConnected) x.el.classList.add('d-mark');
  frame();
}
function changed() { flash = ''; draw(); }
// the chosen part and the one under the pointer carry the highlight themselves (classes the editor alone sets and removes)
function mark() { for (const x of document.querySelectorAll('.d-sel')) if (x !== sel) x.classList.remove('d-sel'); if (editing && sel && sel.isConnected) sel.classList.add('d-sel'); }
function setHov(el) { if (el === hovEl) return; if (hovEl) hovEl.classList.remove('d-hov'); hovEl = el && el !== sel ? el : null; if (hovEl) hovEl.classList.add('d-hov'); }
const frame = () => mark();
function listen() {
panel.addEventListener('click', e => { const t = e.target.closest('[data-a]'); if (!t || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return; const a = t.dataset.a, v = t.dataset.v;
  if (a === 'edit') setEditing(!editing); else if (a === 'close') close(); else if (a === 'undo') undo(); else if (a === 'redo') redo();
  else if (a === 'reset') reset();
  else if (a === 'copyall') { const txt = copyText(); navigator.clipboard.writeText(txt).then(() => { flash = 'Copied: paste it to Claude.'; draw(); }, err => { flash = `Copying wasn't allowed here (${err.name}).`; draw(); }); }
  else if (a === 'screen') goScreen(v);
  else if (a === 'add') { if (dragging) return; const el = make(BLOCKS[+v][1]); const at = whereFor(el); if (!at) { flash = 'Choose where it goes first (a part, or a place that takes it), or drag it there.'; draw(); return; } run(addOp(el, ...at)); choose(el); }
  else if (!sel) return;
  else if (a === 'addopt') { const u = sel.matches(CHOICE) ? sel : sel.parentElement, o = newOption(u); run(addOp(o, u, sel.matches(OPTION) ? sel.nextElementSibling : null)); choose(o); }
  else if (a === 'type') { const fam = partSpec(sel)[2], T = TYPES[fam].find(x => x[0] === v);
    if (fam === 'text') run(tagOp(sel, T[2])); else run(clsOp(sel, T[2], TYPES[fam].flatMap(x => x[2]), `type of ${nameOf(sel)}`)); }
  else if (a === 'big') run(clsOp(sel, v ? ['big'] : [], ['big'], `size of ${nameOf(sel)}`));
  else if (a === 'w') run(clsOp(sel, v ? [v] : [], WIDTHS.map(w => w[0]).filter(Boolean), `width of ${nameOf(sel)}`));
  else if (a === 'screen') goScreen(v);
  else if (!sel) return;
  else if (a === 'lvl') choose(chainAt(sel)[+v]);
  else if (a === 'copy' || a === 'cut') { clip = { el: sel, cut: a === 'cut' }; draw(); }
  else if (a === 'paste') paste();
  else if (a === 'del') { run(delOp(sel)); choose(null); }
});
panel.addEventListener('change', e => { const t = e.target; if (!sel) return;
  if (t.dataset.a === 'text' && t.value !== sel.textContent) run(textOp(sel, t.value));
  if (t.dataset.a === 'note' && t.value.trim() !== (notes.get(sel) || '')) run(noteOp(sel, t.value.trim())); });
panel.addEventListener('mouseover', e => { const li = e.target.closest('li[data-i]'); setHov(li ? changes()[+li.dataset.i]?.el : null); });
panel.addEventListener('mouseout', () => setHov(null));
panel.addEventListener('pointerdown', e => { const t = e.target.closest('[data-a=add]'); if (t && editing) { e.preventDefault(); fresh = { html: BLOCKS[+t.dataset.v][1], x: e.clientX, y: e.clientY }; } });
panel.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (!li) return; const el = changes()[+li.dataset.i]?.el; if (el && el.isConnected) { el.scrollIntoView({ block: 'nearest' }); if (editing) choose(el); } });
}

/* ---------- edit mode: one set of listeners at the root, only while editing (nothing of it while the game is played) ---------- */
/* choosing (owner, 2026-10-05): the biggest part under the pointer first; a click again on the chosen part goes one smaller
   (inside it); a neighbour of the chosen part is taken at the same level; Escape goes one bigger; Alt + wheel either way */
// the parts under a point, biggest first (an option counts inside its switch, cards or swatches)
function chainAt(t) {
  if (!t || !t.closest || !FORM.contains(t) || (panel && panel.contains(t))) return [];
  const out = []; for (let e = t; e && e !== FORM; e = e.parentElement) if ((e.matches(PART) || e.matches(OPTION)) && !e.classList.contains('d-gone')) out.unshift(e);
  return out;
}
// what a press takes: the chosen part itself (to drag it), a neighbour at its level (the same bigger parts), else the biggest
function pick(t) { const c = chainAt(t); if (!c.length) return null; if (sel && c.includes(sel)) return sel;
  if (sel && sel.isConnected) { const s = chainAt(sel), d = s.length - 1; if (d > 0 && c.length > d && s.slice(0, d).every((x, k) => x === c[k])) return c[d]; }
  return c[0]; }
function choose(el) { sel = el; draw(); }
let press = null, dragging = null, passing = false, fresh = null; // (fresh: a part pressed in the Add row, dragged in once it moves)
const swallow = e => { if (!passing && FORM.contains(e.target) && !panel.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } };
function onDown(e) { if (!FORM.contains(e.target)) return; swallow(e); const el = pick(e.target); if (!el) { choose(null); return; }
  press = { el, was: el === sel, chain: chainAt(e.target), x: e.clientX, y: e.clientY }; if (!press.was) choose(el); }
function onMove(e) {
  if (fresh && !dragging && Math.hypot(e.clientX - fresh.x, e.clientY - fresh.y) > 5) startFresh(e);
  if (!press && !dragging) { setHov(pick(e.target)); return; }
  if (!dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) startDrag(e);
  if (dragging) dragTo(e);
}
function onUp(e) { fresh = null; if (dragging) endDrag(e);
  else if (press && press.was) { const c = press.chain, k = c.indexOf(press.el); if (k >= 0 && k < c.length - 1) choose(c[k + 1]); } // (a click again: one smaller)
  press = null; swallow(e); }
function onWheel(e) { if (!e.altKey || !FORM.contains(e.target)) return; e.preventDefault(); e.stopPropagation();
  const c = chainAt(e.target); if (!c.length) return; let k = c.indexOf(sel); if (k < 0) k = c.indexOf(pick(e.target));
  choose(c[Math.max(0, Math.min(c.length - 1, k + (e.deltaY > 0 ? 1 : -1)))]); }
// Copy or Cut, then Paste: into the chosen part when it takes it, else after the chosen part (or the nearest bigger one) in a
// place that takes it, on any screen
const make = html => { const t = document.createElement('template'); t.innerHTML = html; return t.content.firstElementChild; };
function whereFor(el, from) { if (!sel) return null;
  if (sel.matches(CONTAINER) && accepts(sel, el, from)) return [sel, null];
  for (let x = sel; x && x !== FORM; x = x.parentElement) { const p = x.parentElement; if (p && p.matches(CONTAINER) && accepts(p, el, from)) return [p, x.nextElementSibling]; }
  return null; }
function paste() { if (!clip || !sel) return; const el = clip.el, w = whereFor(el, clip.cut ? el.parentElement : null);
  if (!w) { flash = `${nameOf(el)} can't go there.`; draw(); return; } const [parent, next] = w;
  if (clip.cut) { run(moveOp(el, parent, next)); clip = null; choose(el); } else { const op = copyOp(el, parent, next); run(op); choose(op.el); } }
// the menu's screens, by its own tabs (the editor shows no screen of its own)
const TABS = [['local', 'This device'], ['online', 'Online'], ['replays', 'Replays']];
const screenNow = () => { const c = $('#sMode input:checked'); return c ? c.value : ''; };
function goScreen(v) { const l = $(`#sMode label[data-v="${v}"]`); if (!l) return; passing = true; try { l.click(); } finally { passing = false; } choose(null); requestAnimationFrame(draw); }
function onKey(e) {
  if (e.target.closest && (e.target.closest('#dPanel input, #dPanel textarea'))) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && (k === 'c' || k === 'x') && sel) { e.preventDefault(); clip = { el: sel, cut: k === 'x' }; draw(); }
  else if (mod && k === 'v' && clip) { e.preventDefault(); paste(); }
  else if (k === 'escape') { e.preventDefault(); e.stopPropagation(); if (dragging) cancelDrag(); else { const c = sel ? chainAt(sel) : []; choose(c.length > 1 ? c[c.length - 2] : null); } }
  else if ((k === 'delete' || k === 'backspace') && sel) { e.preventDefault(); run(delOp(sel)); choose(null); }
}
const LISTEN = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['click', swallow], ['dblclick', swallow], ['keydown', onKey], ['mousedown', swallow], ['input', swallow], ['change', swallow]];
function setEditing(on) {
  if (on === editing) return; editing = on;
  for (const [t, f] of LISTEN) (on ? addEventListener : removeEventListener)(t, f, true);
  (on ? addEventListener : removeEventListener)('wheel', onWheel, { capture: true, passive: false });
  document.documentElement.classList.toggle('d-editing', on);
  if (!on) { sel = null; clip = null; press = null; fresh = null; if (dragging) cancelDrag(); setHov(null); mark(); }
  draw();
  if (!on) check(!document.querySelector('.d-sel, .d-hov, .d-drag') && !document.documentElement.classList.contains('d-editing'), 'Edit off leaves nothing of edit mode on the page');
}

/* ---------- dragging: the part follows the pointer; a line shows where it would land; on release it moves there, and every
   part that moved slides from where it was (measured once at pick-up and once at the drop, never while it follows) ---------- */
function startFresh(e) { const el = make(fresh.html); fresh = null; el.classList.add('d-ghost'); document.body.appendChild(el);
  dragging = { el, fresh: true, ox: 0, oy: 0, target: null }; setHov(null); dragTo(e); }
function startDrag(e) {
  const el = press.el;
  const r = el.getBoundingClientRect(); dragging = { el, ox: e.clientX, oy: e.clientY, r, target: null };
  el.classList.add('d-drag'); setHov(null);
}
function dragTo(e) {
  const d = dragging, el = d.el; el.style.transform = d.fresh ? `translate(${e.clientX + 12}px,${e.clientY + 12}px)` : `translate(${e.clientX - d.ox}px,${e.clientY - d.oy}px)`;
  let c = null; for (const x of document.elementsFromPoint(e.clientX, e.clientY)) { if (!FORM.contains(x) || x === el || el.contains(x)) continue;
    for (let y = x.closest(CONTAINER); y && FORM.contains(y); y = y.parentElement && y.parentElement.closest(CONTAINER)) if (accepts(y, el)) { c = y; break; } if (c) break; }
  if (!c) { d.target = null; drop.style.display = 'none'; return; }
  const kids = [...c.children].filter(k => k !== el && k.offsetParent !== null && !k.classList.contains('d-gone') && k.id !== 'dPanel');
  const across = getComputedStyle(c).display.includes('flex') && !getComputedStyle(c).flexDirection.startsWith('column') && !c.matches(STACK + ', ' + LIST) || c.matches('.seg, .sws');
  let next = null, line;
  for (const k of kids) { const r = k.getBoundingClientRect();
    if (across ? (e.clientY < r.top || (e.clientY < r.bottom && e.clientX < r.left + r.width / 2)) : e.clientY < r.top + r.height / 2) { next = k; line = across ? [r.left - 4, r.top, 3, r.height] : [r.left, r.top - 4, r.width, 3]; break; } }
  if (!next) { const last = kids[kids.length - 1], r = (last || c).getBoundingClientRect(); line = across ? [r.right + 2, r.top, 3, r.height] : [r.left, last ? r.bottom + 2 : r.top + 2, r.width, 3]; }
  d.target = { c, next };
  Object.assign(drop.style, { display: 'block', transform: `translate(${line[0]}px,${line[1]}px)`, width: line[2] + 'px', height: line[3] + 'px' });
}
function cancelDrag() { const el = dragging.el; if (dragging.fresh) { el.remove(); dragging = null; drop.style.display = 'none'; return; } el.classList.remove('d-drag'); el.style.transform = ''; dragging = null; drop.style.display = 'none'; frame(); }
function endDrag() {
  const d = dragging, el = d.el; drop.style.display = 'none';
  if (d.fresh) { el.remove(); el.classList.remove('d-ghost'); el.style.transform = ''; dragging = null; if (!d.target) return;
    run(addOp(el, d.target.c, d.target.next)); choose(el); el.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' }); return; }
  if (!d.target || (d.target.c === el.parentElement && (d.target.next === el.nextElementSibling || d.target.next === el))) { slideBack(el); return; }
  // FLIP: where everything is now, the move, where it is after; then each slides from the first to the last
  const moved = new Set([...el.parentElement.children, ...d.target.c.children]); moved.delete(el);
  const first = new Map([...moved].map(k => [k, k.getBoundingClientRect()])), from = el.getBoundingClientRect();
  el.classList.remove('d-drag'); el.style.transform = '';
  run(moveOp(el, d.target.c, d.target.next)); dragging = null;
  const ease = getComputedStyle(document.documentElement).getPropertyValue('--ease').trim() || 'ease';
  for (const [k, a] of first) { const z = k.getBoundingClientRect(); if (Math.abs(a.left - z.left) + Math.abs(a.top - z.top) > .5) k.animate([{ transform: `translate(${a.left - z.left}px,${a.top - z.top}px)` }, { transform: 'none' }], { duration: 220, easing: ease }); }
  const to = el.getBoundingClientRect(); el.animate([{ transform: `translate(${from.left - to.left}px,${from.top - to.top}px)` }, { transform: 'none' }], { duration: 220, easing: ease });
  frame();
}
function slideBack(el) { const t = el.style.transform; el.classList.remove('d-drag'); el.style.transform = ''; dragging = null;
  if (t) el.animate([{ transform: t }, { transform: 'none' }], { duration: 180, easing: 'ease-out' }); frame(); }

/* ---------- open and close ---------- */
function open() { if (!panel) build(); panel.hidden = false; document.documentElement.classList.add('d-open'); draw(); }
function close() { if (!panel) return; setEditing(false); panel.hidden = true; document.documentElement.classList.remove('d-open'); setHov(null); }
// the menus' elements the editor doesn't know: none is a part, a container, or inside a part (test/design.cjs)
const uncovered = () => [...FORM.querySelectorAll('*')].filter(el => !el.matches(PART) && !el.matches(CONTAINER) && !el.matches(OPTION) && !(el.parentElement && el.parentElement.closest(PART + ', ' + OPTION))).map(el => pathOf(el) + (el.className ? ' .' + el.className.split(' ').join('.') : ''));
window.__design = { open, close, get built() { return !!panel; }, copyText, uncovered, changes: () => changes().map(x => x.line), get editing() { return editing; }, get count() { return ops.length; } };
