/* The explorers: HTML elements over the board (#pieces, inside the zoomed #bscale), one per explorer, positioned in
   board units. A move is two Web Animations run by the compositor, so nothing on the main thread can make them stutter:
   the explorer slides from space to space (easing in and out at each one) while its figure hops once per space above a
   shadow that stays on the ground. Whose turn it is: a pool of light and a marker (fading in and out); the explorer to
   move (two-explorer games): a dashed ring. */
import { S, MAP, R, hexAt } from '../../engine.gen.js';
import { $, reduceMotion } from '../dom.js';
import { UI } from '../state.js';
import { render } from '../frame.js';
import { meepleSVG } from '../meeple.js';
import { cam } from './camera.js';
import { onPiece } from '../actions.js';

const STEP = 200; // ms per space (the step sounds are timed to it: sound.js)
const els = new Map(); // 'player-explorer' → { el, pin, shadow, tf }
const moving = new Set(); // explorers walking now
const tf = (x, y) => `translate(${(x - MAP.minX).toFixed(1)}px,${(y - MAP.minY).toFixed(1)}px)`;
/* a small SVG drawn in board units around the explorer's spot (inside a box whose own corner is at ox, oy) */
const svg = (cls, box, body, ox = 0, oy = 0) => { const [x, y, w, h] = box.split(' ').map(Number);
  return `<div class="${cls}" style="left:${x - ox}px;top:${y - oy}px;width:${w}px;height:${h}px"><svg viewBox="${box}" width="${w}" height="${h}">${body}</svg></div>`; };
function make(pl, i) {
  const p = S.players[pl], el = document.createElement('div'); el.className = 'piece';
  el.innerHTML = svg('psel', '-30 -30 60 60', `<circle r="${R * .8}" fill="none" stroke="#f8dc97" stroke-width="3" stroke-dasharray="5 4"/>`)
    + svg('pglow', '-30 0 60 28', '<ellipse cy="13.5" rx="28" ry="12" fill="url(#turnGlow)"/><ellipse cy="13.5" rx="19" ry="7.5" fill="none" stroke="rgba(40,24,0,.55)" stroke-width="5"/><ellipse cy="13.5" rx="19" ry="7.5" fill="none" stroke="#ffe08a" stroke-width="2.6"/>')
    + svg('pshadow', '-15 8 30 11', '<ellipse cy="13.5" rx="14" ry="5" fill="rgba(0,0,0,.5)"/>')
    + `<div class="pin">${svg('pmark', '-9 -46 18 13', '<path d="M-7.5,-44 L7.5,-44 L0,-34 Z" fill="#ffe08a" stroke="rgba(40,24,0,.6)" stroke-width="1.5" stroke-linejoin="round"/>', -32, -50)}`
    + `<svg viewBox="-32 -50 64 72" width="64" height="72">${meepleSVG(p.color, p.pieces.length > 1 ? i + 1 : 0)}</svg></div>`;
  $('#pieces').appendChild(el);
  const P = { el, pin: el.querySelector('.pin'), shadow: el.querySelector('.pshadow'), tf: '', anims: [] };
  P.pin.addEventListener('click', e => { e.stopPropagation(); if (!cam.dragMoved) onPiece(pl, i); });
  return P;
}
/* where an explorer rests: its space, or (arrived) a spot in a row beside the city */
function piecePos(pl, i) {
  const k = S.players[pl].pieces[i];
  if (k !== 'done') { const h = hexAt(k); return [h.x, h.y]; }
  const C = MAP.city; let idx = 0;
  S.players.forEach((p, a) => p.pieces.forEach((pk, b) => { if (pk === 'done' && (a < pl || (a === pl && b < i))) idx++; }));
  const px = -C.dy, py = C.dx, off = (idx - 1.5) * 18;
  return [C.x + px * off + C.dx * R * 1.6, C.y + py * off + C.dy * R * 1.6];
}
const stopAnims = P => { for (const a of P.anims.splice(0)) a.cancel(); moving.delete(P); UI.anim = moving.size > 0; };
function rest(P, t) { if (P.tf === t) return; P.tf = t; P.el.style.transform = t; }
function update() {
  if (!S || !MAP) return;
  S.players.forEach((p, pl) => p.pieces.forEach((k, i) => {
    const id = pl + '-' + i; let P = els.get(id); if (!P) { P = make(pl, i); els.set(id, P); }
    const t = tf(...piecePos(pl, i));
    if (P.tf !== t) { stopAnims(P); rest(P, t); } // the game jumped (a replay stepped back, a new state arrived): no animation
    const turn = pl === S.cur && k !== 'done' && !S.over, sel = turn && i === UI.piece && p.pieces.length > 1;
    P.el.classList.toggle('turn', turn); P.el.classList.toggle('sel', sel);
    const z = moving.has(P) ? '3' : pl === S.cur ? '2' : '1'; if (P.el.style.zIndex !== z) P.el.style.zIndex = z; // the player to move stands in front
  }));
}
/* an explorer walked along keys (engine 'move' event; the state already has it at the end) */
export function animateMove(pl, i, keys) {
  const P = els.get(pl + '-' + i); if (!P || !S.players[pl]) return;
  const pts = keys.map(k => { const h = hexAt(k); return [h.x, h.y]; });
  if (S.players[pl].pieces[i] === 'done') pts.push(piecePos(pl, i));
  const T = pts.map(p => tf(...p)); stopAnims(P); rest(P, T[T.length - 1]);
  if (reduceMotion || T.length < 2) return;
  const n = T.length - 1;
  const slide = P.el.animate(T.map((t, k) => ({ transform: t, offset: k / n, easing: 'cubic-bezier(.45,0,.55,1)' })), { duration: n * STEP });
  // the hop: up fast and down fast like a thrown ball (sine), growing a little at the top; the shadow shrinks under it
  P.anims = [slide,
    P.pin.animate([{ transform: 'translateY(0) scale(1)', easing: 'cubic-bezier(.61,1,.88,1)' }, { transform: 'translateY(-8px) scale(1.1)', offset: .5, easing: 'cubic-bezier(.12,0,.39,0)' }, { transform: 'translateY(0) scale(1)' }], { duration: STEP, iterations: n }),
    P.shadow.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.72)', opacity: .55, offset: .5 }, { transform: 'scale(1)', opacity: 1 }], { duration: STEP, iterations: n, easing: 'ease-in-out' })];
  P.el.style.zIndex = '3'; moving.add(P); UI.anim = true;
  slide.finished.then(() => { if (P.anims[0] !== slide) return; P.anims = []; moving.delete(P); UI.anim = moving.size > 0; render(); }, () => { });
}
export const piecesPart = { name: 'pieces', 
  update,
  reset() { for (const P of els.values()) { stopAnims(P); P.el.remove(); } els.clear(); moving.clear(); UI.anim = false; },
};
