/* The design editor (owner, 2026-10-05; docs/HANDOFF.md "The theme and the design editor"): a way for the owner to show
   Claude what the menus should be. Opened by the menu's Design button (this file is fetched only then); its panel stays
   while the game works as usual, and nothing is editable until Edit is on. Every edit is an operation on one of the
   theme's parts, undone exactly; Copy gives the net changes, each with where it is, what changed and the owner's note.
   The site itself is never changed: what the editor shows lives in this page only. */
const $ = s => document.querySelector(s);
const FORM = $('#mform');
const fail = m => { throw new Error('assertion failed: design: ' + m); }; // (an uncaught error: the page's boundary reports it)
const check = (ok, m) => { if (!ok) fail(m); };

import { PART, UNIT, OPTION, partSpec, TYPES, WIDTHS, ALLOWED, STACK, LIST, CONTAINER, accepts } from './parts.js';

const SCREENS = { setup: 'This device', online: 'Online', room: 'Room lobby', replays: 'Replays' };

/* ---------- where things are, in words (the copied notes) and as a path (to find it in the code) ---------- */
const clip = t => { t = t.replace(/\s+/g, ' ').trim(); return t.length > 40 ? t.slice(0, 39) + '…' : t; };
function textOf(el) {
  if (el.matches('select')) return [...el.options].slice(0, 3).map(o => o.text).join(' / ');
  if (el.matches(UNIT)) return clip([...el.children].map(c => c.textContent.trim()).filter(Boolean).join(' / '));
  if (el.matches('.field')) { const l = el.querySelector(':scope>label'); return l ? clip(l.textContent) : ''; }
  if (el.matches('input')) return el.placeholder || el.name || '';
  if (el.matches(CONTAINER)) { const f = [...el.children].find(c => c.textContent.trim()); return f ? clip('with ' + f.textContent) : ''; }
  return clip(el.textContent);
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
function remember(el) { if (!firsts.has(el) && !copies.has(el)) firsts.set(el, { parent: el.parentElement, next: el.nextElementSibling, cls: el.className, text: textOf(el), tag: el.tagName }); }
function run(op) {
  for (const el of op.touches) remember(el);
  const before = snapshot(); ops.length = at; ops.push({ ...op, before }); op.do(); at++; changed();
}
function undo() { if (!at) return; const op = ops[--at]; op.undo(); check(snapshot() === op.before, `undo leaves the menu as it was before "${op.what}"`); changed(); }
function redo() { if (at >= ops.length) return; ops[at++].do(); changed(); }
function reset() { while (at) undo(); ops.length = 0; firsts.clear(); for (const c of copies) c.remove(); copies.clear(); changed(); }
// the menu's markup as edits see it (the editor's own marks aside): what an undo must give back
const snapshot = () => FORM.innerHTML.replace(/ ?\bd-(sel|hov|mark|drag|in)\b/g, '').replace(/ class=""/g, '').replace(/ style=""/g, '');
const place = (el, parent, next) => parent.insertBefore(el, next);
function moveOp(el, parent, next) { const from = [el.parentElement, el.nextElementSibling];
  return { what: 'move ' + nameOf(el), touches: [el], do: () => place(el, parent, next), undo: () => place(el, ...from) }; }
function copyOp(el) { const c = el.cloneNode(true), parent = el.parentElement, next = el.nextElementSibling, n = copies.size + 1;
  for (const x of [c, ...c.querySelectorAll('*')]) { x.removeAttribute('id'); if (x.name) x.name += '-copy' + n; x.classList.remove('d-sel', 'd-hov', 'd-mark'); }
  c.dataset.dcopy = String(n); copies.add(c);
  return { what: 'copy ' + nameOf(el), touches: [], el: c, src: el, do: () => place(c, parent, next), undo: () => c.remove() }; }
const delOp = el => ({ what: 'delete ' + nameOf(el), touches: [el], do: () => el.classList.add('d-gone'), undo: () => el.classList.remove('d-gone') });
function clsOp(el, add, remove, what) {
  for (const c of add) check(ALLOWED.has(c), `an edit sets only the theme's classes (not "${c}")`);
  const had = el.className; return { what, touches: [el], do: () => { el.classList.remove(...remove); el.classList.add(...add); }, undo: () => { el.className = had; } }; }
function noteOp(el, to) { const from = notes.get(el); const set = v => { if (v) notes.set(el, v); else notes.delete(el); };
  return { what: 'note on ' + nameOf(el), touches: [el], do: () => set(to), undo: () => set(from) }; }
function textOp(el, to) { const from = el.textContent; return { what: 'text of ' + nameOf(el), touches: [el], do: () => { el.textContent = to; }, undo: () => { el.textContent = from; } }; }
function tagOp(el, sel) { // a text part as another (title, lead, note): another element in its place, the same words
  const [tag, cls] = sel.split('.'), n = document.createElement(tag); if (cls) n.className = cls; n.textContent = el.textContent; if (el.id) n.id = el.id;
  return { what: 'type of ' + nameOf(el), touches: [el], swap: [el, n], do: () => { el.replaceWith(n); moveMarks(el, n); }, undo: () => { n.replaceWith(el); moveMarks(n, el); } }; }
function moveMarks(a, b) { if (notes.has(a)) { notes.set(b, notes.get(a)); notes.delete(a); } if (sel === a) sel = b; }
const current = el => { for (const op of ops.slice(0, at)) if (op.swap && op.swap[0] === el) el = op.swap[1]; return el; };

/* ---------- the changes: what differs from the original now (an edit put back by hand is no change) ---------- */
function changes() {
  const out = [];
  for (const [orig, was] of firsts) { const el = current(orig); if (copies.has(el)) continue;
    const bits = [];
    if (el.classList.contains('d-gone')) bits.push('deleted');
    else {
      if (el.parentElement !== was.parent || el.nextElementSibling !== was.next) bits.push(`moved: was ${spotOf(was.parent, was.next, el)}; now ${spotOf(el.parentElement, el.nextElementSibling, el)}`);
      if (el.tagName !== was.tag) bits.push(`type ${was.tag.toLowerCase()} → ${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ').filter(c => !c.startsWith('d-s') && !c.startsWith('d-h') && c !== 'd-mark').join('.') : ''}`);
      const a = was.cls.split(/\s+/).filter(c => c && !/^d-(sel|hov|mark|drag)$/.test(c)), b = el.className.split(/\s+/).filter(c => c && !/^d-(sel|hov|mark|drag)$/.test(c));
      if (el.tagName === was.tag && a.join(' ') !== b.join(' ')) bits.push(`look: ${lookOf(a.join(' '))} → ${lookOf(b.join(' '))}`);
      if (textOf(el) !== was.text) bits.push(`text: "${was.text}" → "${textOf(el)}"`);
    }
    if (bits.length || notes.has(el)) out.push({ el, head: `${placeOf(el)} › ${nameOf(el)}`, path: `${pathOf(was.parent)} > …${el.id ? ' #' + el.id : ''}`, what: bits.join('; ') || 'unchanged' });
  }
  for (const c of copies) if (c.isConnected && !c.classList.contains('d-gone')) { const op = ops.slice(0, at).find(o => o.el === c);
    out.push({ el: c, head: `${placeOf(c)} › a copy of ${nameOf(op.src)}`, path: pathOf(op.src), what: `placed ${spotOf(c.parentElement, c.nextElementSibling, c)}` }); }
  for (const x of out) if (notes.has(x.el)) x.what += ` — note: "${notes.get(x.el)}"`;
  for (const x of out) { x.line = `${x.head} (${x.path}): ${x.what}`; x.short = `${x.head}: ${x.what}`; }
  return out;
}
function copyText() { const c = changes(); return [`Design notes — El Dorado, ${innerWidth}×${innerHeight} at ${Math.round(devicePixelRatio * 100)}%`, ...c.map((x, i) => `${i + 1}. ${x.line}`)].join('\n'); }

/* ---------- the panel ---------- */
/* built on the first open, not when this file loads: the page fetches it while idle, and nothing of it exists (no style, no
   element, no listener) until Design is clicked (owner, 2026-10-05: the editor opens at once, and costs the game nothing) */
let panel, hov, selBox, drop;
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
#dPanel .dmain{height:var(--h-m);background:linear-gradient(var(--priA),var(--priB));border-color:var(--priEdge);color:var(--goldInk);font-weight:800}
.d-gone{display:none!important}
/* the panel has the right of the window to itself: the game and the menu make room (never under it) */
html.d-open #shell{width:calc(100% - 312px)}html.d-open #menu,html.d-open #dim,html.d-open .scrim{right:312px;width:auto}
@media (max-width:760px){#dPanel{top:auto;left:0;width:auto;height:45%;border-left:0;border-top:1px solid var(--line2)}
  html.d-open #shell{width:100%;height:55%}html.d-open #menu,html.d-open #dim,html.d-open .scrim{right:0;width:100%;bottom:45%;height:auto}}
.d-w4{width:calc(25% - 8px)!important;flex:0 0 auto!important}.d-w2{width:calc(50% - 5px)!important;flex:0 0 auto!important}.d-w1{width:100%!important;flex:0 0 auto!important}
.d-mark{outline:1px dashed var(--goldLine);outline-offset:2px}
.d-drag{position:relative;z-index:90;pointer-events:none;opacity:.92;box-shadow:var(--sh2)}
#dHov,#dSel,#dDrop{position:fixed;left:0;top:0;pointer-events:none;z-index:79;border-radius:var(--r-s);display:none}
#dHov{outline:1px solid var(--gold2);outline-offset:2px}#dSel{outline:2px solid var(--gold);outline-offset:3px}#dDrop{background:var(--gold);border-radius:2px}
html.d-editing #mform *{cursor:default}html.d-editing #mform{user-select:none}`;
document.head.appendChild(css);
panel = document.createElement('div'); panel.id = 'dPanel'; document.body.appendChild(panel);
hov = document.createElement('div'); selBox = document.createElement('div'); drop = document.createElement('div');
hov.id = 'dHov'; selBox.id = 'dSel'; drop.id = 'dDrop'; document.body.append(hov, selBox, drop);
listen();
}
let editing = false, sel = null, inUnit = null, flash = '';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const b = (act, label, on, v = '', dis = false) => `<button type="button" data-a="${act}" data-v="${esc(v)}" class="${on ? 'on' : ''}"${dis ? ' disabled' : ''}>${label}</button>`;
function typeOf(el, fam) { if (fam === 'text') return TYPES.text.find(([, , s]) => el.matches(s))?.[0];
  if (fam === 'button') return el.matches('.linkbtn') ? 'link' : el.matches('.pri') ? 'main' : 'plain'; if (fam === 'box') return el.matches('.gold') ? 'gold' : el.matches('.dashed') ? 'dashed' : 'plain'; }
function draw() {
  const ch = changes(), spec = sel && partSpec(sel), fam = spec && spec[2], simple = sel && sel.children.length === 0 && !sel.matches('input, select');
  panel.innerHTML = `<h3>Design <span class="sp"></span>${b('edit', editing ? 'Editing' : 'Edit', editing)}${b('close', '✕')}</h3>
    <div class="dr">${b('undo', 'Undo', false, '', !at)}${b('redo', 'Redo', false, '', at >= ops.length)}${b('reset', 'Reset', false, '', !ops.length)}</div>
    ${!editing ? '<p class="dhint">The game works as usual. Turn on Edit, then click a part of the menu to change it, or drag it somewhere else.</p>' : !sel ? '<p class="dhint">Click a part of the menu; drag it to move it. A switch or a set of cards is taken whole: double-click it to reach one of its options.</p>'
    : `<div class="dsel"><b>${esc(nameOf(sel))}</b><span class="dhint">${esc(placeOf(sel))}</span>
      ${fam && TYPES[fam] ? `<div class="dr"><b>Type</b>${TYPES[fam].map(([v, n]) => b('type', n, typeOf(sel, fam) === v, v)).join('')}</div>` : ''}
      ${fam === 'button' && sel.matches('.btn') ? `<div class="dr"><b>Size</b>${b('big', 'Normal', !sel.matches('.big'), '')}${b('big', 'Big', sel.matches('.big'), 'big')}</div>` : ''}
      ${sel.matches(OPTION) ? '' : `<div class="dr"><b>Width</b>${WIDTHS.map(([v, n]) => b('w', n, v ? sel.classList.contains(v) : !WIDTHS.some(([w]) => w && sel.classList.contains(w)), v)).join('')}</div>`}
      ${simple ? `<div class="dr"><b>Text</b><input data-a="text" value="${esc(sel.textContent)}"></div>` : ''}
      <div class="dr"><b>Note</b><textarea data-a="note" rows="2" placeholder="What should change here?">${esc(notes.get(sel) || '')}</textarea></div>
      <div class="dr">${b('copy', 'Copy')}${b('del', 'Delete')}${inUnit ? b('outunit', 'Back to the whole') : ''}</div></div>`}
    <div class="dsel"><b>Changes (${ch.length})</b>${ch.length ? `<ol>${ch.map((x, i) => `<li data-i="${i}">${esc(x.short)}</li>`).join('')}</ol>` : '<p class="dhint">None yet.</p>'}
      <div class="dr">${b('copyall', 'Copy for Claude', false, '', !ch.length)}</div>${flash ? `<p class="dhint">${esc(flash)}</p>` : ''}</div>`;
  panel.querySelector('[data-a="copyall"]').classList.add('dmain');
  for (const x of document.querySelectorAll('.d-mark')) x.classList.remove('d-mark');
  for (const x of ch) if (x.el.isConnected) x.el.classList.add('d-mark');
  frame();
}
function changed() { flash = ''; draw(); }
// the outlines follow what they mark, drawn in the next frame (the menu scrolls; nothing measured while the page updates)
let raf = 0; const frame = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; box(selBox, editing && sel); }); };
function box(o, el) { if (!el || !el.isConnected || el.closest('.d-gone')) { o.style.display = 'none'; return; } const r = el.getBoundingClientRect();
  Object.assign(o.style, { display: 'block', transform: `translate(${r.left}px,${r.top}px)`, width: r.width + 'px', height: r.height + 'px' }); }
function listen() {
panel.addEventListener('click', e => { const t = e.target.closest('[data-a]'); if (!t || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return; const a = t.dataset.a, v = t.dataset.v;
  if (a === 'edit') setEditing(!editing); else if (a === 'close') close(); else if (a === 'undo') undo(); else if (a === 'redo') redo();
  else if (a === 'reset') reset();
  else if (a === 'copyall') { const txt = copyText(); navigator.clipboard.writeText(txt).then(() => { flash = 'Copied: paste it to Claude.'; draw(); }, err => { flash = `Copying wasn't allowed here (${err.name}).`; draw(); }); }
  else if (!sel) return;
  else if (a === 'type') { const fam = partSpec(sel)[2], T = TYPES[fam].find(x => x[0] === v);
    if (fam === 'text') run(tagOp(sel, T[2])); else run(clsOp(sel, T[2], TYPES[fam].flatMap(x => x[2]), `type of ${nameOf(sel)}`)); }
  else if (a === 'big') run(clsOp(sel, v ? ['big'] : [], ['big'], `size of ${nameOf(sel)}`));
  else if (a === 'w') run(clsOp(sel, v ? [v] : [], WIDTHS.map(w => w[0]).filter(Boolean), `width of ${nameOf(sel)}`));
  else if (a === 'copy') { const op = copyOp(sel); run(op); choose(op.el); }
  else if (a === 'del') { run(delOp(sel)); choose(null); }
  else if (a === 'outunit') { const u = inUnit; inUnit = null; choose(u); }
});
panel.addEventListener('change', e => { const t = e.target; if (!sel) return;
  if (t.dataset.a === 'text' && t.value !== sel.textContent) run(textOp(sel, t.value));
  if (t.dataset.a === 'note' && t.value.trim() !== (notes.get(sel) || '')) run(noteOp(sel, t.value.trim())); });
panel.addEventListener('mouseover', e => { const li = e.target.closest('li[data-i]'); box(hov, li ? changes()[+li.dataset.i]?.el : null); });
panel.addEventListener('mouseout', () => box(hov, null));
panel.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (!li) return; const el = changes()[+li.dataset.i]?.el; if (el && el.isConnected) { el.scrollIntoView({ block: 'nearest' }); if (editing) choose(el); } });
}

/* ---------- edit mode: one set of listeners at the root, only while editing (nothing of it while the game is played) ---------- */
// the part a pointer is on: what was clicked, unless it is inside a control taken whole (unless that control was entered)
function partAt(t) {
  if (!t || !t.closest || !FORM.contains(t) || panel.contains(t)) return null;
  const unit = t.closest(UNIT); if (unit && FORM.contains(unit)) { if (inUnit === unit) { const o = t.closest(OPTION); if (o && unit.contains(o)) return o; } else return unit; }
  let el = t.closest(PART); while (el && (!FORM.contains(el) || el.closest('.d-gone'))) el = el.parentElement && el.parentElement.closest(PART);
  return el && FORM.contains(el) ? el : null;
}
function choose(el) { sel = el; draw(); }
let press = null, dragging = null;
const swallow = e => { if (FORM.contains(e.target) && !panel.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } };
function onDown(e) { const el = partAt(e.target); if (!el && !FORM.contains(e.target)) return; swallow(e); if (!el) { choose(null); return; }
  choose(el); press = { el, x: e.clientX, y: e.clientY, id: e.pointerId }; }
function onMove(e) {
  if (!press) { const el = partAt(e.target); box(hov, el !== sel ? el : null); return; }
  if (!dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) startDrag(e);
  if (dragging) dragTo(e);
}
function onUp(e) { if (dragging) endDrag(e); press = null; swallow(e); }
function onDbl(e) { swallow(e); const u = e.target.closest && e.target.closest(UNIT); if (u && FORM.contains(u)) { inUnit = u; const o = e.target.closest(OPTION); choose(o && u.contains(o) ? o : u); } }
function onKey(e) {
  if (e.target.closest && (e.target.closest('#dPanel input, #dPanel textarea'))) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (k === 'escape') { e.preventDefault(); e.stopPropagation(); if (dragging) cancelDrag(); else if (inUnit) { const u = inUnit; inUnit = null; choose(u); } else choose(null); }
  else if ((k === 'delete' || k === 'backspace') && sel) { e.preventDefault(); run(delOp(sel)); choose(null); }
}
const LISTEN = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['click', swallow], ['dblclick', onDbl], ['keydown', onKey], ['mousedown', swallow], ['input', swallow], ['change', swallow]];
const follow = () => frame();
function setEditing(on) {
  if (on === editing) return; editing = on;
  for (const [t, f] of LISTEN) (on ? addEventListener : removeEventListener)(t, f, true);
  (on ? addEventListener : removeEventListener)('scroll', follow, true);
  document.documentElement.classList.toggle('d-editing', on);
  if (!on) { sel = null; inUnit = null; press = null; if (dragging) cancelDrag(); box(hov, null); }
  draw();
  if (!on) check(!document.querySelector('.d-sel, .d-hov, .d-drag') && !document.documentElement.classList.contains('d-editing'), 'Edit off leaves nothing of edit mode on the page');
}

/* ---------- dragging: the part follows the pointer; a line shows where it would land; on release it moves there, and every
   part that moved slides from where it was (measured once at pick-up and once at the drop, never while it follows) ---------- */
function startDrag(e) {
  const el = press.el; if (el.matches(OPTION) ? false : el.closest(UNIT) && el.closest(UNIT) !== el) return;
  const r = el.getBoundingClientRect(); dragging = { el, ox: e.clientX, oy: e.clientY, r, target: null };
  el.classList.add('d-drag'); box(hov, null); selBox.style.display = 'none';
}
function dragTo(e) {
  const d = dragging, el = d.el; el.style.transform = `translate(${e.clientX - d.ox}px,${e.clientY - d.oy}px)`;
  let c = null; for (const x of document.elementsFromPoint(e.clientX, e.clientY)) { if (!FORM.contains(x) || x === el || el.contains(x)) continue;
    for (let y = x.closest(CONTAINER); y && FORM.contains(y); y = y.parentElement && y.parentElement.closest(CONTAINER)) if (accepts(y, el)) { c = y; break; } if (c) break; }
  if (el.matches(OPTION) && !c) c = el.parentElement;
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
function cancelDrag() { const el = dragging.el; el.classList.remove('d-drag'); el.style.transform = ''; dragging = null; drop.style.display = 'none'; frame(); }
function endDrag() {
  const d = dragging, el = d.el; drop.style.display = 'none';
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
function close() { if (!panel) return; setEditing(false); panel.hidden = true; document.documentElement.classList.remove('d-open'); box(hov, null); box(selBox, null); }
// the menus' elements the editor doesn't know: none is a part, a container, or inside a part (test/design.cjs)
const uncovered = () => [...FORM.querySelectorAll('*')].filter(el => !el.matches(PART) && !el.matches(CONTAINER) && !el.matches(OPTION) && !(el.parentElement && el.parentElement.closest(PART + ', ' + OPTION))).map(el => pathOf(el) + (el.className ? ' .' + el.className.split(' ').join('.') : ''));
window.__design = { open, close, get built() { return !!panel; }, copyText, uncovered, changes: () => changes().map(x => x.line), get editing() { return editing; }, get count() { return ops.length; } };
