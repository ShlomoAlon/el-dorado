/* Pan and zoom, the way Leaflet does it: #stage is permanently its own GPU layer (will-change: transform) and gestures
   only change its transform, so they never repaint the board. The layer keeps the resolution it was drawn at, so once
   zooming has stopped (no wheel events for 250 ms, no fingers down, no glide running) the scale is baked into #bscale
   and the layer's own scale goes back to 1, in the same frame: one sharp redraw at a quiet moment. */
import { R } from '../../engine.gen.js';
import { $ } from '../dom.js';
import { S, MAP, UI, cur } from '../state.js';
import { geo, onGeo, measure } from '../geometry.js';
import { after } from '../frame.js';
import { diag } from '../debug.js';
import { layout, xy } from './layout.js';
export const view = { s: 1, x: 0, y: 0 };
/* userZoomed: the player moved the board (a resize then keeps their view); dragMoved: the current press became a drag
   (its click is not a tap) */
export const cam = { userZoomed: false, dragMoved: false, pointers: 0 };
const stage = () => $('#stage');
let viewRaf = 0, baked = 1, settleT = 0, gliding = false, drags = 0;
const hoverHooks = [];
/* things drawn over the board in screen space (the hover tip) hide when the board moves */
export function onViewMove(f) { hoverHooks.push(f); }
const moved = () => { for (const f of hoverHooks) f(); };
export function applyView() {
  if (!viewRaf) viewRaf = requestAnimationFrame(() => { viewRaf = 0; stage().style.transform = `translate3d(${view.x}px,${view.y}px,0) scale(${view.s / baked})`; });
  scheduleSettle();
}
function scheduleSettle() { clearTimeout(settleT); settleT = setTimeout(settle, 250); }
function settle() {
  if (cam.pointers || gliding) { scheduleSettle(); return; } if (Math.abs(view.s / baked - 1) < .005) return;
  requestAnimationFrame(() => {
    if (cam.pointers || gliding) { scheduleSettle(); return; } // a glide or grab may have begun since the timer fired
    diag(`bake ${baked.toFixed(3)} → ${view.s.toFixed(3)}`); baked = view.s; $('#bscale').style.transform = `scale(${baked})`; stage().style.transform = `translate3d(${view.x}px,${view.y}px,0) scale(${view.s / baked})`;
  });
}
/* the part of the game area the board should fill: under the prompt, left of the market, above the hand */
function safeRect() {
  const W = geo.app.width, H = geo.app.height, phone = W < 600;
  const t = Math.max(phone ? 108 : 112, geo.promptBottom ? geo.promptBottom + 10 : 0);
  const mr = UI.mktOpen && S ? geo.mktW + (phone ? 10 : 28) : 0; // the market column on the right
  return { l: phone ? 8 : 62, t, r: W - 16 - mr, b: H - geo.cw * 1.4 * .62, W, H };
}
export function focusPoint() {
  const pl = cur(); const k = pl.pieces[UI.piece] && pl.pieces[UI.piece] !== 'done' ? pl.pieces[UI.piece] : pl.pieces.find(x => x !== 'done');
  const p = k ? xy(k) : layout().city; return [p.x, p.y];
}
export function fit(anim) {
  if (!MAP) return; const r = safeRect(); if (!r.W) return; diag(`fit${anim ? ' (glide)' : ''} in ${Math.round(r.W)}×${Math.round(r.H)}`);
  const aw = r.r - r.l, ah = r.b - r.t;
  let s = Math.min(aw / layout().w, ah / layout().h); view.s = s; view.x = r.l + (aw - layout().w * s) / 2; view.y = r.t + (ah - layout().h * s) / 2;
  // too small to play (phones): zoom in on the explorer to move, or (the start screen's preview) on the starting spaces,
  // so the game starts in exactly the view the preview showed
  if (s * R < 13) {
    s = Math.min(ah / layout().h, 13 / R * 1.6); view.s = s;
    const c = S ? focusPoint() : MAP.starts.map(xy).reduce((a, h, i, A) => [a[0] + h.x / A.length, a[1] + h.y / A.length], [0, 0]);
    view.x = (r.l + r.r) / 2 - (c[0] - layout().minX) * s; view.y = r.t + (ah - layout().h * s) / 2; clampView();
  }
  // not animated: drawn sharp at this scale right away (no blurry frame, no later redraw once it's on screen)
  if (anim) glide(); else { baked = view.s; $('#bscale').style.transform = `scale(${baked})`; }
  applyView(); cam.userZoomed = false;
  document.documentElement.classList.add('boardready'); // the game area may show now (with its fonts): never an unfitted board
}
/* fit once the frame's updates are in (the prompt's height and the market's width are part of the fit); anim: glide there */
export const fitSoon = anim => after(() => { measure(); fit(anim); });
function glide() {
  stage().style.transition = 'transform .45s cubic-bezier(.2,.8,.2,1)'; gliding = true; clearTimeout(glide.t);
  glide.t = setTimeout(() => { stage().style.transition = ''; gliding = false; scheduleSettle(); }, 480);
}
function clampView() {
  const W = geo.app.width, H = geo.app.height, bw = layout().w * view.s, bh = layout().h * view.s;
  if (bw <= W) view.x = Math.max(Math.min(view.x, W - bw), 0); else view.x = Math.min(W * .4, Math.max(W * .6 - bw, view.x));
  if (bh <= H) view.y = Math.max(Math.min(view.y, H - bh), 0); else view.y = Math.min(H * .4, Math.max(H * .6 - bh, view.y));
}
/* glide the explorer about to move into view, if it isn't */
export function ensureVisible() {
  const r = safeRect(), c = focusPoint();
  const sx = (c[0] - layout().minX) * view.s + view.x, sy = (c[1] - layout().minY) * view.s + view.y, m = 40;
  if (sx > r.l + m && sx < r.r - m && sy > r.t + m && sy < r.b - m) return; diag('ensureVisible: glide');
  view.x += (r.l + r.r) / 2 - sx; view.y += (r.t + r.b) / 2 - sy; clampView(); glide(); applyView();
}
function zoomAt(px, py, f) { const ns = Math.max(.25, Math.min(3.2, view.s * f)); const k = ns / view.s; view.x = px - (px - view.x) * k; view.y = py - (py - view.y) * k; view.s = ns; applyView(); cam.userZoomed = true; moved(); }
/* screen point → board point; board point → point in the game area */
export function boardPoint(cx, cy) { return [(cx - geo.app.left - view.x) / view.s + layout().minX, (cy - geo.app.top - view.y) / view.s + layout().minY]; }
export function boardToApp(bx, by) { return [(bx - layout().minX) * view.s + view.x, (by - layout().minY) * view.s + view.y]; }
export function setupPanZoom() {
  const v = $('#vp');
  v.addEventListener('wheel', e => {
    e.preventDefault(); const x = e.clientX - geo.app.left, y = e.clientY - geo.app.top;
    const mouseWheel = e.deltaMode !== 0 || (Math.abs(e.deltaX) < 1 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);
    // zoom factor as d3-zoom normalises wheel deltas (pixels / lines / pages; ctrl+wheel = trackpad pinch on Chrome, Edge, Firefox)
    if (e.ctrlKey || mouseWheel) zoomAt(x, y, 2 ** (-e.deltaY * (e.deltaMode === 1 ? .05 : e.deltaMode ? 1 : .002) * (e.ctrlKey ? 10 : 1)));
    else { view.x -= e.deltaX; view.y -= e.deltaY; applyView(); cam.userZoomed = true; moved(); }
  }, { passive: false });
  const ptrs = new Map(); let start = null, pinch = null;
  const local = (cx, cy) => [cx - geo.app.left, cy - geo.app.top];
  const beginPan = () => { const [p] = [...ptrs.values()]; start = { x: p[0], y: p[1], vx: view.x, vy: view.y }; };
  const beginPinch = () => {
    const p = [...ptrs.values()].slice(0, 2); const m = local((p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2);
    // remember which board point sits under the fingers' midpoint, so it stays under them
    pinch = { d: Math.max(1, Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1])), s: view.s, bx: (m[0] - view.x) / view.s, by: (m[1] - view.y) / view.s }; start = null;
  };
  v.addEventListener('pointerdown', e => {
    stage().style.transition = ''; gliding = false; ptrs.set(e.pointerId, [e.clientX, e.clientY]); cam.pointers = ptrs.size;
    if (ptrs.size === 1) { cam.dragMoved = false; beginPan(); }
    else if (ptrs.size === 2) { beginPinch(); cam.dragMoved = true; moved(); diag('pinch starts'); }
  });
  window.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && ptrs.size >= 2) {
      const p = [...ptrs.values()].slice(0, 2), d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]), m = local((p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2);
      const ns = Math.max(.25, Math.min(3.2, pinch.s * d / pinch.d));
      view.s = ns; view.x = m[0] - pinch.bx * ns; view.y = m[1] - pinch.by * ns; applyView(); cam.userZoomed = true; return;
    }
    if (start) {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!cam.dragMoved && Math.hypot(dx, dy) > 5) {
        cam.dragMoved = true; moved();
        // the grabbing cursor: mouse only (the class change restyles every board element, a stall at the start of a touch drag)
        if (e.pointerType === 'mouse') v.classList.add('drag');
        try { v.setPointerCapture(e.pointerId); } catch (_) { }
      }
      // follow the pointer from the first pixel (a 5 px dead zone made the board jump when the drag began); 5 px still tells a drag from a click
      view.x = start.vx + dx; view.y = start.vy + dy; applyView(); if (cam.dragMoved) cam.userZoomed = true;
    }
  });
  const up = e => {
    if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
    if (ptrs.size === 1) { pinch = null; beginPan(); } // one finger left: continue panning from here, no jump
    else if (ptrs.size >= 2) beginPinch();
    cam.pointers = ptrs.size; if (ptrs.size) diag(`still down: ${[...ptrs.keys()].join(',')}`); if (!ptrs.size && cam.dragMoved) diag(`———— drag ${++drags} ended`); if (!ptrs.size) { start = null; pinch = null; v.classList.remove('drag'); setTimeout(() => cam.dragMoved = false, 0); scheduleSettle(); }
  };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  const mid = f => () => zoomAt(geo.app.width / 2, geo.app.height / 2, f);
  $('#zin').onclick = mid(1.25); $('#zout').onclick = mid(.8); $('#zfit').onclick = () => fit(true);
  // the game area resized: fit again unless the player has moved the board (a height change while a finger is down is
  // the phone's address bar: not then)
  let lastW = geo.app.width;
  onGeo(sized => { if (!sized) return; const wc = Math.abs(geo.app.width - lastW) > 2; lastW = geo.app.width; if (!cam.userZoomed && (wc || !ptrs.size)) fit(); });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
  // Safari's trackpad pinch arrives as gesture events (not ctrl+wheel); touch pinches are already handled by the pointers above
  let g0 = 1; v.addEventListener('gesturestart', () => { g0 = view.s; });
  v.addEventListener('gesturechange', e => { if (ptrs.size >= 2 || !e.scale) return; diag(`gesture zoom ${e.scale.toFixed(2)} with ${ptrs.size} pointers`); const [x, y] = local(e.clientX, e.clientY); zoomAt(x, y, g0 * e.scale / view.s); });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
}
