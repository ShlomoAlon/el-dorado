/* The aiming arrow: shown while a movement card is selected (by a tap or a drag). With a mouse it follows the pointer and
   snaps onto reachable spaces; on touch it points at the explorer that will move until you drag. Chevrons flow along the
   curve. It runs a frame loop only while it is on screen. */
import { S, R, hexAt, typeOf, assert } from '../engine.gen.js';
import { $, sv } from './dom.js';
import { UI, cur } from './state.js';
import { geo } from './geometry.js';
import { cardEls, drag } from './hand.js';
import { targetAt, setHot, blPos } from './board/overlays.js';
import { boardToApp } from './board/camera.js';
const aim = { raf: 0, mx: null, my: null, touch: false, pool: null };
function aimWanted() { return S && !S.over && !UI.cover && UI.mode === 'card' && cardEls.has(UI.card) && typeOf(UI.card) !== 'transmitter'; }
export function startAim() { if (!aim.raf && aimWanted()) aim.raf = requestAnimationFrame(loop); }
function stopAim() { if (aim.raf) cancelAnimationFrame(aim.raf); aim.raf = 0; setHot(null); if (aim.pool) aim.pool.root.style.display = 'none'; }
function loop(ts) {
  aim.raf = 0; if (!aimWanted()) { stopAim(); return; }
  // where the card sits (its layout position: no measuring), the top middle of it
  const t = cardEls.get(UI.card).__t;
  const cw = geo.cw, ch = cw * 1.4, sx = t.x + cw / 2, sy = t.y + ch / 2 - ch * t.sc / 2 + Math.min(16, ch * t.sc * .1);
  const dragging = drag && drag.started && drag.kind === 'aim';
  let tx = null, ty = null, free = false;
  if (dragging) { tx = drag.cx; ty = drag.cy; free = true; } else if (!aim.touch && aim.mx != null) { tx = aim.mx; ty = aim.my; free = true; }
  let hot = null; if (free) { hot = targetAt(tx, ty); tx -= geo.app.left; ty -= geo.app.top; }
  setHot(hot);
  let ex, ey;
  if (hot) { const p = hot[0] === 'B' ? blPos[+hot.slice(1)] : [hexAt(hot).x, hexAt(hot).y];[ex, ey] = boardToApp(p[0], p[1]); }
  else if (free) { ex = tx; ey = ty; }
  else { const pi = S.turn.active && S.turn.active.id === UI.card ? S.turn.active.pi : UI.piece, pk = cur().pieces[pi];
    assert(pk && pk !== 'done', 'aim: the explorer to move is on the board'); const h = hexAt(pk);[ex, ey] = boardToApp(h.x, h.y - R * .9); }
  // hidden while the pointer is still down in the hand; the loop then rests until the pointer moves
  const show = Math.hypot(ex - sx, ey - sy) > 50 && ey < sy - 10;
  draw(sx, sy, ex, ey, !!hot, show, (ts / 1100) % 1);
  if (show || dragging) aim.raf = requestAnimationFrame(loop);
}
function pool() {
  if (aim.pool) return aim.pool;
  const root = sv('g', null, $('#arrow')), segs = [];
  for (let i = 0; i < 26; i++) { const g = sv('g', null, root); sv('path', { d: 'M-6 -7 L4 0 L-6 7 L-2 0Z', 'stroke-width': 1.5, 'stroke-linejoin': 'round', stroke: 'rgba(0,0,0,.55)' }, g); segs.push(g); }
  const head = sv('g', null, root); sv('path', { d: 'M-24 -16 L5 0 L-24 16 L-15 0Z', stroke: 'rgba(0,0,0,.6)', 'stroke-width': 2, 'stroke-linejoin': 'round' }, head);
  const ring = sv('circle', { r: 12, fill: 'none', 'stroke-width': 2.5 }, root);
  return aim.pool = { root, segs, head, ring };
}
function draw(sx, sy, ex, ey, ok, show, phase) {
  const P0 = pool(); P0.root.style.display = show ? '' : 'none'; if (!show) return;
  const mx = (sx + ex) / 2, my = Math.min(sy, ey) - Math.max(50, Math.abs(ex - sx) * .22);
  const cx1 = sx + (mx - sx) * .15, cy1 = my, cx2 = ex - (ex - mx) * .25, cy2 = my;
  const P = t => { const u = 1 - t; return [u * u * u * sx + 3 * u * u * t * cx1 + 3 * u * t * t * cx2 + t * t * t * ex, u * u * u * sy + 3 * u * u * t * cy1 + 3 * u * t * t * cy2 + t * t * t * ey]; };
  const len = Math.hypot(ex - sx, ey - sy) + Math.abs(my - sy) * .6, nSeg = Math.max(5, Math.min(P0.segs.length, Math.round(len / 30))), col = ok ? '#f8dc97' : '#e9efe9';
  P0.segs.forEach((g, i) => {
    if (i >= nSeg) { g.style.display = 'none'; return; }
    const t = (i + phase) / nSeg; if (t < .04 || t > .93) { g.style.display = 'none'; return; }
    g.style.display = ''; const [x, y] = P(t), [x2, y2] = P(t + .01), a = Math.atan2(y2 - y, x2 - x) * 180 / Math.PI, sc = .5 + .5 * t;
    g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(1)}) scale(${sc.toFixed(2)})`);
    g.firstChild.setAttribute('fill', col); g.style.opacity = Math.min(1, t * 6).toFixed(2);
  });
  const [hx, hy] = P(.97), ha = Math.atan2(ey - hy, ex - hx) * 180 / Math.PI;
  P0.head.setAttribute('transform', `translate(${ex.toFixed(1)} ${ey.toFixed(1)}) rotate(${ha.toFixed(1)})`); P0.head.firstChild.setAttribute('fill', col);
  P0.ring.setAttribute('cx', ex.toFixed(1)); P0.ring.setAttribute('cy', ey.toFixed(1)); P0.ring.setAttribute('stroke', col);
  P0.ring.style.opacity = ok ? (.5 + .4 * Math.sin(phase * Math.PI * 2)).toFixed(2) : 0;
}
export function aimInit() {
  window.addEventListener('pointermove', e => { aim.touch = e.pointerType !== 'mouse'; if (!aim.touch) { aim.mx = e.clientX; aim.my = e.clientY; startAim(); } }, { passive: true });
  window.addEventListener('pointerdown', e => { aim.touch = e.pointerType !== 'mouse'; }, { passive: true });
}
/* after each update: the arrow comes or goes with the selected card */
export const aimPart = { name: 'aim',  update() { if (aimWanted()) startAim(); else stopAim(); } };
