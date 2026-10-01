/* What is drawn over the board for the current turn: the spaces you can move to (targets), the blockades, the dotted
   path and tip while you point at a target, the cards-paid dots on a rubble space, and another player's trail.
   Each is its own layer and changes only when what it shows does. */
import { R, SQ3, key, hexAt, def, SYMCOL, SYMNAME, blkLabel } from '../../engine.gen.js';
import { $, sv, reduceMotion } from '../dom.js';
import { S, MAP, UI, G, cur } from '../state.js';
import { L, hexPts, label, edgeSeg } from './terrain.js';
import { layout, xy } from './layout.js';
import { view, boardPoint, onViewMove } from './camera.js';

/* ---------- targets: one ring per reachable space, kept while the space stays a target ---------- */
const rings = new Map(); // space key → element
const isPayKind = k => k === 'rubble' || k === 'camp';
function updateTargets() {
  for (const [k, g] of rings) if (!UI.targets.has(k)) { g.remove(); rings.delete(k); }
  for (const [k, t] of UI.targets) {
    if (k[0] === 'B') continue;
    const cls = 'tgt' + (isPayKind(t.kind) ? ' dis' : '') + (hot === k ? ' hot' : '');
    let g = rings.get(k);
    if (!g) { const h = xy(k); g = sv('g', { 'data-t': k }, L.hl); sv('polygon', { points: hexPts(h.x, h.y, R - 3.4), class: 'ring' }, g); rings.set(k, g); }
    if (g.getAttribute('class') !== cls) g.setAttribute('class', cls);
  }
}

/* ---------- blockades: drawn when the deal is shown and when one is taken; otherwise only their target mark changes ---------- */
export const blPos = {};
let blDeal = ''; const blEls = new Map(); // bi -> the blockade's elements (its group on the board, its two labels)
/* one element set per blockade, drawn once per deal; a blockade that is taken leaves the board alone (nothing else is
   redrawn). (a new board comes with a reset: blDeal '') */
function updateBlockades() {
  const deal = MAP.course + '|' + S.seed;
  if (blDeal !== deal) { blDeal = deal; L.bl.innerHTML = ''; $('#blabels2').innerHTML = ''; blEls.clear();
    S.blockades.forEach((B, bi) => { if (B.owner === null) blEls.set(bi, drawBlockade(B, bi)); }); }
  for (const [bi, els] of blEls) if (S.blockades[bi].owner !== null) { for (const e of els) e.remove(); blEls.delete(bi); delete blPos[bi]; }
  for (const bg of L.bl.querySelectorAll('.bl-badge')) {
    const k = 'B' + bg.dataset.bi, tg = UI.targets.has(k), cls = 'bl-badge' + (tg ? ' tgt' : '') + (hot === k ? ' hot' : '');
    if (bg.getAttribute('class') !== cls) bg.setAttribute('class', cls);
  }
}
/* draws an open blockade; returns its elements */
function drawBlockade(B, bi) {
  const col = SYMCOL[B.k], g = sv('g', null, L.bl), segs = MAP.conns[B.conn].edges.map(([a, b]) => edgeSeg(a, b));
  let sx = 0, sy = 0;
  for (const [x1, y1, x2, y2] of segs) { sv('line', { x1, y1, x2, y2, stroke: '#0b120f', 'stroke-width': 11, 'stroke-linecap': 'round' }, g); sx += (x1 + x2) / 2; sy += (y1 + y2) / 2; }
  for (const [x1, y1, x2, y2] of segs) { sv('line', { x1, y1, x2, y2, stroke: col, 'stroke-width': 6.5, 'stroke-linecap': 'round' }, g); sv('line', { x1, y1, x2, y2, stroke: 'rgba(255,255,255,.35)', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-dasharray': '2 5' }, g); }
  sx /= segs.length; sy /= segs.length; let best = null, bd = 1e9;
  for (const [x1, y1, x2, y2] of segs) { const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dd = Math.hypot(mx - sx, my - sy); if (dd < bd) { bd = dd; best = [mx, my]; } }
  blPos[bi] = best; const [bx, by] = best;
  const bg = sv('g', { class: 'bl-badge', transform: `translate(${bx},${by})`, 'data-bi': bi }, g);
  sv('circle', { r: 27, fill: 'rgba(0,0,0,0)', class: 'bl-halo', stroke: 'transparent' }, bg);
  sv('rect', { x: -17, y: -17, width: 34, height: 34, rx: 7, transform: 'rotate(45)', fill: '#0b120f' }, bg);
  sv('rect', { x: -15, y: -15, width: 30, height: 30, rx: 6, transform: 'rotate(45)', fill: col, stroke: 'rgba(255,255,255,.45)', 'stroke-width': 1.2 }, bg);
  const ink = B.k === 'v' ? '#4b3409' : '#fff';
  const u = sv('use', { href: '#i-' + (B.k === 'r' ? 'cards' : B.k), x: -13, y: -8, width: 15, height: 15 }, bg); u.style.color = ink;
  const nb = sv('g', { transform: 'translate(0,-25)' }, bg); sv('circle', { r: 8, fill: '#0b120f', stroke: col, 'stroke-width': 1.5 }, nb);
  sv('title', null, bg).textContent = 'Blockade #' + B.n + ': ' + blkLabel(B) + '. The first explorer to pay it keeps it (tiebreaker).';
  const lab = $('#blabels2');
  return [g, label(lab, bx + 8, by + 6, B.v, { anchor: 'middle', size: 16, weight: 800, color: ink }), label(lab, bx, by - 25 + 3.6, B.n, { anchor: 'middle', size: 10, weight: 800, color: '#fff' })];
}

/* ---------- the path and tip for the target under the pointer (or the aimed card) ---------- */
let hot = null, hoverShown = false;
export const hotTarget = () => hot;
function targetLabel(k, tg) {
  const act = S.turn.active && S.turn.active.id === UI.card;
  if (tg.kind === 'move' || tg.kind === 'bl') {
    if (!UI.card) return G.replay ? 'The next move goes here' : ''; // (a replay marks the next move's space)
    const budget = act ? S.turn.active.left : def(S,UI.card).p;
    if (tg.kind === 'move' && hexAt(S,k).type === 'g') return 'Reach El Dorado · uses <b>' + tg.cost + '</b> of ' + budget;
    return (tg.kind === 'bl' ? 'Tear down blockade · ' : '') + 'Uses <b>' + tg.cost + '</b> of ' + budget + ' ' + SYMNAME[tg.sym] + (budget > 1 ? 's' : '');
  }
  if (tg.kind === 'native') return 'Native: move here for free' + (tg.bl != null ? ' and take the blockade' : '');
  if (tg.kind === 'nativebl') return 'Native: tear down this blockade';
  if (tg.kind === 'rubble') return 'Rubble: discard <b>' + tg.need + '</b> card' + (tg.need > 1 ? 's' : '');
  if (tg.kind === 'camp') return 'Base camp: remove <b>' + tg.need + '</b> card' + (tg.need > 1 ? 's' : '') + ' from the game';
  if (tg.kind === 'blr') return 'Blockade: discard <b>' + tg.need + '</b> card' + (tg.need > 1 ? 's' : '');
  return '';
}
export function showHover(k, tg) {
  hoverShown = true; L.path.innerHTML = '';
  const from = cur().pieces[tg.pi ?? UI.piece], keys = [from, ...(tg.path || [])];
  if (keys.length > 1) {
    const d = keys.map((kk, i) => { const h = xy(kk); return (i ? 'L' : 'M') + h.x.toFixed(1) + ' ' + h.y.toFixed(1); }).join(' ');
    sv('path', { d, fill: 'none', stroke: 'rgba(0,0,0,.45)', 'stroke-width': 8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, L.path);
    sv('path', { d, fill: 'none', stroke: '#f8dc97', 'stroke-width': 3.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': '1 7' }, L.path);
    for (const kk of keys.slice(1, -1)) { const h = xy(kk); sv('circle', { cx: h.x, cy: h.y, r: 4, fill: '#f8dc97' }, L.path); }
  }
  const tip = $('#tip'), txt = targetLabel(k, tg); tip.innerHTML = txt; if (!txt) { tip.style.opacity = 0; return; }
  let x, y; if (k[0] === 'B') { const p = blPos[+k.slice(1)]; x = p[0]; y = p[1] - 10; } else { const h = xy(k); x = h.x; y = h.y - R * .6; }
  tip.style.left = ((x - layout().minX) * view.s + view.x) + 'px'; tip.style.top = ((y - layout().minY) * view.s + view.y) + 'px'; tip.style.opacity = 1;
}
// clearing an already-empty SVG group still re-lays out the whole layer, so only clear when needed
export function hideHover() { if (!hoverShown) return; hoverShown = false; L.path.innerHTML = ''; $('#tip').style.opacity = 0; }
onViewMove(hideHover);
/* the target a card is being aimed or dragged at: lit ring, path and tip */
export function setHot(k) {
  if (k === hot) return; const was = hot; hot = k;
  const el = x => x[0] === 'B' ? L.bl.querySelector(`[data-bi="${x.slice(1)}"]`) : rings.get(x);
  if (was) { const e = el(was); if (e) e.classList.remove('hot'); }
  if (k) { const e = el(k); if (e) e.classList.add('hot'); showHover(k, UI.targets.get(k)); } else hideHover();
}
function hexRound(x, y) {
  const q = (SQ3 / 3 * x - y / 3) / R, r = (2 / 3 * y) / R; let rx = q, rz = r, ry = -q - r; let a = Math.round(rx), b = Math.round(ry), c = Math.round(rz);
  const dx = Math.abs(a - rx), dy = Math.abs(b - ry), dz = Math.abs(c - rz); if (dx > dy && dx > dz) a = -b - c; else if (dy > dz) b = -a - c; else c = -a - b; return key(a, c);
}
/* the target at a screen point: a blockade badge within reach, else the space under it */
export function targetAt(cx, cy) {
  const [x, y] = boardPoint(cx, cy);
  for (const bi in blPos) { const p = blPos[bi]; if (UI.targets.has('B' + bi) && Math.hypot(p[0] - x, p[1] - y) < 24) return 'B' + bi; }
  const k = hexRound(x, y); return UI.targets.has(k) ? k : null;
}
/* the space under a screen point (its key, whether or not the board has one there) */
export function spaceAt(cx, cy) { const [x, y] = boardPoint(cx, cy); return hexRound(x, y); }

/* ---------- rubble / base camp / rubble blockade being paid: one dot per card, filled as cards go in (HTML, above the explorers) ---------- */
function discardAnchor(tk) { if (tk[0] === 'B') { const p = blPos[+tk.slice(1)]; return [p[0], p[1] - 40]; } const h = xy(tk); return [h.x, h.y - R * .95]; }
function updatePips() {
  const box = $('#bfx'), P = UI.mode === 'discardFor' ? UI.pending : null, a = P && discardAnchor(P.tk);
  const sig = a ? [P.tk, P.kind, P.need, UI.picks.length].join('|') : '';
  if (box.__sig === sig) return; box.__sig = sig;
  if (!a) { box.innerHTML = ''; return; }
  let g = box.querySelector('.dpips');
  if (!g || g.dataset.tk !== P.tk) { box.innerHTML = ''; g = document.createElement('div'); g.className = 'dpips' + (P.kind === 'camp' ? ' camp' : ''); g.dataset.tk = P.tk;
    g.style.transform = `translate(${a[0] - layout().minX}px,${a[1] - 4 - layout().minY}px) translate(-50%,-50%)`; box.appendChild(g); }
  g.innerHTML = '<i class="on"></i>'.repeat(UI.picks.length) + '<i></i>'.repeat(Math.max(0, P.need - UI.picks.length));
}
export function pulseDiscard() {
  const g = $('#bfx .dpips'); if (!g || reduceMotion) return;
  g.animate([{ scale: 1.35 }, { scale: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
}

/* ---------- another player's moves this turn: a dotted trail in their colour (feed.js says what) ---------- */
let trailSig = '';
export function setTrail(paths, color) {
  const sig = color + JSON.stringify(paths); if (sig === trailSig) return; trailSig = sig; L.trail.innerHTML = '';
  for (const keys of paths) {
    if (keys.length < 2) continue; const d = keys.map((k, i) => { const h = xy(k); return (i ? 'L' : 'M') + h.x.toFixed(1) + ' ' + h.y.toFixed(1); }).join(' ');
    sv('path', { d, fill: 'none', stroke: 'rgba(0,0,0,.45)', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, L.trail);
    sv('path', { d, fill: 'none', stroke: color, 'stroke-width': 3.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': '.5 8' }, L.trail);
    const h = xy(keys[0]); sv('circle', { cx: h.x, cy: h.y, r: 5, fill: color, stroke: 'rgba(0,0,0,.55)', 'stroke-width': 2 }, L.trail);
  }
}

let targetsSig = '';
export const overlaysPart = { name: 'overlays', 
  update() {
    if (!S) return; // (a game on show has its board: showGame)
    // the targets changed (another card, another explorer, a move made): the path and tip shown were for the old ones
    const tsig = [...UI.targets.keys()].join(',') + '|' + UI.card + '|' + UI.piece;
    if (tsig !== targetsSig) { targetsSig = tsig; setHot(null); hideHover(); }
    updateBlockades(); updateTargets(); updatePips();
  },
  reset() { rings.clear(); blSig = ''; targetsSig = ''; trailSig = ''; hot = null; hoverShown = false; for (const k in blPos) delete blPos[k]; L.hl.innerHTML = ''; L.path.innerHTML = ''; L.trail.innerHTML = ''; const b = $('#bfx'); b.innerHTML = ''; b.__sig = ''; },
};
