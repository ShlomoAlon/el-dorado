/* Pan and zoom, the way Leaflet does it: #stage is permanently its own GPU layer (will-change: transform) and gestures
   only change its transform, so they never repaint the board. The layer keeps the resolution it was drawn at, so once
   zooming has stopped (no wheel events for 250 ms, no fingers down, no glide running) the scale is baked into #bscale
   and the layer's own scale goes back to 1, in the same frame: one sharp redraw at a quiet moment. */
import { R, assert } from '../../engine.gen.js';
import { $ } from '../dom.js';
import { S, MAP, UI, G, cur, canAct, passing } from '../state.js';
import { geo, onGeo, measure, handTop } from '../geometry.js';
import { after, frameDue } from '../frame.js';
import { diag, diagLog, CHECKS } from '../debug.js';
import { layout, xy } from './layout.js';
import { walking } from './pieces.js';
import { terrainLive } from './terrain.js';
export const view = { s: 1, x: 0, y: 0 };
/* userZoomed: the player moved the board (a resize then keeps their view); dragMoved: the current press became a drag
   (its click is not a tap) */
export const cam = { userZoomed: false, dragMoved: false, pointers: 0, fitZoomed: false }; // fitZoomed: the last fit zoomed in beyond the whole board (small screens)
const stage = () => $('#stage');
let viewRaf = 0, baked = 1, settleT = 0, gliding = false, drags = 0;
const hoverHooks = [];
/* things drawn over the board in screen space (the hover tip) hide when the board moves */
export function onViewMove(f) { hoverHooks.push(f); }
const moved = () => { for (const f of hoverHooks) f(); };
function applyView() {
  if (!viewRaf) viewRaf = requestAnimationFrame(() => { viewRaf = 0; stage().style.transform = `translate3d(${view.x}px,${view.y}px,0) scale(${view.s / baked})`; });
  scheduleSettle();
}
function scheduleSettle() { clearTimeout(settleT); settleT = setTimeout(settle, 250); if (CHECKS) { clearTimeout(restT); restT = setTimeout(restCheck, 700); } }
/* EXPERIMENT (branch only): once settled, a short animation on the board's layer makes Chrome draw it again at the largest
   scale that animation reaches (it keeps a will-change layer's resolution otherwise): 'inplace' to the same transform,
   'x2' toward twice the scale, held at the start (steps) so nothing moves */
let ZEXP = ''; try { ZEXP = localStorage.getItem('zexp') || ''; } catch (e) { /* expected: storage blocked; no experiment */ }
function kick() {
  if (!ZEXP) return; const st = stage(), t = `translate3d(${view.x}px,${view.y}px,0) scale(${view.s / baked})`;
  const f = ZEXP === 'inplace' ? 1 : +ZEXP.slice(1), t2 = `translate3d(${view.x}px,${view.y}px,0) scale(${f * view.s / baked})`;
  diag(`kick ${ZEXP}`);
  st.animate([{ transform: t }, { transform: t2 }], { duration: 120, easing: 'steps(1, end)' });
}
function settle() {
  if (cam.pointers || gliding) { scheduleSettle(); return; } if (Math.abs(view.s / baked - 1) < .005) { kick(); return; }
  requestAnimationFrame(() => {
    if (cam.pointers || gliding) { scheduleSettle(); return; } // a glide or grab may have begun since the timer fired
    diag(`bake ${baked.toFixed(3)} → ${view.s.toFixed(3)}`); baked = view.s; $('#bscale').style.transform = `scale(${baked})`; stage().style.transform = `translate3d(${view.x}px,${view.y}px,0) scale(${view.s / baked})`; kick();
  });
}
/* checks: once the board is at rest (no gesture or glide, settled) */
let restT = 0;
function restCheck() {
  if (cam.pointers || gliding) { restT = setTimeout(restCheck, 300); return; }
  // what a redraw of the board records: its live elements (the terrain is one image; overlays, labels and pieces are live).
  // A few hundred; the terrain drawn live was 2,271, 9 ms of the main thread per redraw at maximum zoom
  const n = document.querySelectorAll('#bscale *').length;
  assert(terrainLive || n <= LIVE_MAX, `view: the board is a few hundred live elements, its fixed terrain one image (${n})`);
}
const LIVE_MAX = 650; // (most seen: 531, four players; 2026-10-04)
/* the part of the game area the board should fill: under the prompt, left of the market, above the hand */
function safeRect() {
  const W = geo.app.width, H = geo.app.height, phone = W < 600;
  const t = Math.max(phone ? 108 : 112, geo.promptBottom ? geo.promptBottom + 10 : 0);
  const mr = UI.mktOpen && S ? geo.mktW + (phone ? 10 : 28) : 0; // the market column on the right
  return { l: phone ? 8 : 62, t, r: W - 16 - mr, b: handTop() - 8, W, H }; // (above the resting hand: handTop, the hand's own)
}
/* what a fit depends on, but the prompt's side (a recap growing a second line over the board is the owner's to decide,
   playtest 2 B): when it changes, the board is fitted again */
const keyOf = r => [r.l, r.r, r.b, r.W, r.H].map(Math.round).join(',');
let fitKey = '';
function focusPoint() {
  const pl = cur(); const k = pl.pieces[UI.piece] && pl.pieces[UI.piece] !== 'done' ? pl.pieces[UI.piece] : pl.pieces.find(x => x !== 'done');
  const p = k ? xy(k) : layout().city; return [p.x, p.y];
}
export function fit(anim) {
  if (!MAP) return; const r = safeRect(); if (!r.W) return; diag(`fit${anim ? ' (glide)' : ''} in ${Math.round(r.W)}×${Math.round(r.H)}`);
  fitKey = keyOf(r); const aw = r.r - r.l, ah = r.b - r.t;
  let s = Math.min(aw / layout().w, ah / layout().h); const whole = s; view.s = s; view.x = r.l + (aw - layout().w * s) / 2; view.y = r.t + (ah - layout().h * s) / 2;
  // too small to play (phones): zoom in on the explorer to move, or (the start screen's preview) on the starting spaces,
  // so the game starts in exactly the view the preview showed
  // (only when that does zoom in: where the area's height already limits the board, zooming can't make it bigger, and
  // moving it toward the explorer would only push it off-centre, under the market)
  if (s * R < 13 && Math.min(ah / layout().h, 13 / R * 1.6) > s * 1.01) {
    s = Math.min(ah / layout().h, 13 / R * 1.6); view.s = s;
    const c = S ? focusPoint() : MAP.starts.map(xy).reduce((a, h, i, A) => [a[0] + h.x / A.length, a[1] + h.y / A.length], [0, 0]);
    view.x = (r.l + r.r) / 2 - (c[0] - layout().minX) * s; view.y = r.t + (ah - layout().h * s) / 2; clampView();
  }
  cam.fitZoomed = view.s > whole * 1.01;
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
/* the follow, as a view part: the explorer about to move is glided into view when it changes (a new turn, or the hand
   revealed after one) and, during my turn, when it arrives somewhere or another one is picked, once nothing is walking.
   One place decides it (it was called on a new turn only, so an explorer I moved under the market stayed there). Other
   players' explorers are followed at their turn's start only: following their moves is the owner's to decide */
let followed = null;
export const cameraPart = { name: 'camera', update() {
  if (!S || !MAP || S.over || passing() || walking() || UI.preview || G.replay) return;
  const pl = cur(), game = S.seed + '|' + S.players.length, key = game + '|' + S.round + '|' + S.cur + (canAct() ? '|' + UI.piece + '|' + pl.pieces.join() : '');
  if (key === followed) return;
  const same = followed && followed.startsWith(game + '|'); followed = key;
  if (same) ensureVisible(); // (a new game on show is placed by its fit)
}};
/* glide the explorer about to move into view, if it isn't */
function ensureVisible() {
  const r = safeRect(), c = focusPoint();
  // the whole board already shown (beside the market, above the hand): every explorer is visible, nothing to follow
  // (moving it would only push it off-centre, under the hand or the market). (Not the prompt's side: a recap growing a
  // second line over the board is the owner's to decide, playtest 2 B; until then it never moves the board either)
  if (view.x >= r.l - 1 && view.y >= 0 && view.x + layout().w * view.s <= r.r + 1 && view.y + layout().h * view.s <= r.b + 1) return;
  const sx = (c[0] - layout().minX) * view.s + view.x, sy = (c[1] - layout().minY) * view.s + view.y, m = 40;
  if (sx > r.l + m && sx < r.r - m && sy > r.t + m && sy < r.b - m) return; diag('ensureVisible: glide to ' + c.map(Math.round));
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
        // the grabbing cursor (a mouse): shown by its own layer over the board, so the board's elements aren't restyled
        if (e.pointerType === 'mouse') $('#grab').classList.add('on');
        try { v.setPointerCapture(e.pointerId); } catch (_) { /* expected: the pointer was already released */ }
      }
      // follow the pointer from the first pixel (a 5 px dead zone made the board jump when the drag began); 5 px still tells a drag from a click
      view.x = start.vx + dx; view.y = start.vy + dy; applyView(); if (cam.dragMoved) cam.userZoomed = true;
    }
  });
  const up = e => {
    if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
    if (ptrs.size === 1) { pinch = null; beginPan(); } // one finger left: continue panning from here, no jump
    else if (ptrs.size >= 2) beginPinch();
    cam.pointers = ptrs.size; if (ptrs.size) diag(`still down: ${[...ptrs.keys()].join(',')}`); if (!ptrs.size && cam.dragMoved) diag(`———— drag ${++drags} ended`); if (!ptrs.size) { start = null; pinch = null; $('#grab').classList.remove('on'); setTimeout(() => cam.dragMoved = false, 0); scheduleSettle(); }
  };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  const mid = f => () => zoomAt(geo.app.width / 2, geo.app.height / 2, f);
  $('#zin').onclick = mid(1.25); $('#zout').onclick = mid(.8); $('#zfit').onclick = () => fit(true);
  // the game area resized: fit again unless the player has moved the board (a height change while a finger is down is
  // the phone's address bar: not then)
  let lastW = geo.app.width;
  // the fit stands on what it read (fitKey): anything else that changes it (the market's width reflowing without the area
  // resizing) fits again too
  onGeo(sized => { if (cam.userZoomed) return;
    if (sized) { const wc = Math.abs(geo.app.width - lastW) > 2; lastW = geo.app.width; if (wc || !ptrs.size) fit(); }
    else if (MAP && fitKey && fitKey !== keyOf(safeRect())) fit(); });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
  // Safari's trackpad pinch arrives as gesture events (not ctrl+wheel); touch pinches are already handled by the pointers above
  let g0 = 1; v.addEventListener('gesturestart', () => { g0 = view.s; });
  v.addEventListener('gesturechange', e => { if (ptrs.size >= 2 || !e.scale) return; diag(`gesture zoom ${e.scale.toFixed(2)} with ${ptrs.size} pointers`); const [x, y] = local(e.clientX, e.clientY); zoomAt(x, y, g0 * e.scale / view.s); });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
}
/* checks (debug and tests): the board as fitted is clear of the hand and the market and, shown whole, centred between them (or, zoomed in on a small
   screen, the explorer to move is), measured on the elements themselves, not on the fit's own numbers. Twice a second,
   while the fit stands (the player hasn't panned or zoomed), nothing moves and no card is chosen */
let fitSeen = ''; // (the last sample's finding: a wrong fit counts once it is the same on two samples in a row, the board unmoved)
/* settled: judged at once (test/play.cjs, after each of its moves has settled); otherwise sampled, and a wrong fit counts
   only once it is the same on two samples in a row */
export function fitCheck(settled) {
  if (frameDue()) return; // (the state has moved on and the next frame will show it: the page is judged once it does)
  if (!S || S.over || UI.preview || cam.userZoomed || gliding || cam.pointers || walking() || UI.mode !== 'idle' || S.turn.pending || document.getElementById('menu').open) return; // (a removal being chosen raises the whole hand, by design)
  const rect = e => e.getBoundingClientRect(), cards = [...document.querySelectorAll('#cards .card:not(.inplay)')].filter(c => c.style.pointerEvents !== 'none'); // (not those leaving the hand: hand.js)
  // (only when nothing finite is animating anywhere: the market sliding in, a card dealt, the board gliding)
  if (!cards.length || document.getAnimations().some(a => a.playState === 'running' && isFinite(a.effect && a.effect.getComputedTiming().endTime))) return;
  // (a card under the pointer is raised and drawn larger, by design (hand.js): the hand's own top is the others')
  const resting = cards.filter(c => !/scale\((?!1\))/.test(c.style.transform)); if (!resting.length) return;
  const handTop = Math.min(...resting.map(c => rect(c).top));
  // (the prompt's side is left out until the owner decides what a recap growing a second line does to the board: playtest 2, B)
  const app = rect($('#app')), b = rect($('#board'));
  // (a resize still in flight: the page measured another size than there is now, and the refit comes with the next frame)
  if (Math.abs(app.left - geo.app.left) > 1 || Math.abs(app.width - geo.app.width) > 1 || Math.abs(app.height - geo.app.height) > 1 || (UI.mktOpen && Math.abs($('#mkt').offsetWidth - geo.mktW) > 1)) return;
  const free = { l: app.left, r: UI.mktOpen && $('#mkt').offsetWidth ? rect($('#mkt')).left : app.right, t: -Infinity, b: handTop }; // (a market not shown covers nothing)
  const inside = (x, y) => x >= free.l - 2 && x <= free.r + 2 && y >= free.t - 2 && y <= free.b + 2;
  const zoomed = cam.fitZoomed; // (zoomed in by the fit: only the explorer to move must be clear)
  let bad = '';
  // (zoomed in: the explorer to move is followed into view during my turn (cameraPart); whether to follow other players'
  // moves, live or in a replay, is the owner's to decide (playtest 2 triage, B13): until then only my turn is judged)
  if (zoomed && !canAct()) return;
  if (zoomed) { const el = document.querySelector('#pieces .piece.turn'); if (!el) return; const r = rect(el); // (the explorer to move: marked .turn)
    if (!inside(r.left + r.width / 2, r.top + r.height / 2)) bad = 'zoomed in: its explorer to move is, at ' + [r.left, r.top, r.width].map(Math.round) + ' (its transform ' + el.style.transform + '; stage ' + stage().style.transform + '; layer ' + $('#bscale').style.transform + ', baked ' + baked + ')' + ', free ' + [free.l, free.r, free.b].map(Math.round) + (G.replay ? ', replay' : ''); }
  else if (!(inside(b.left, b.top) && inside(b.right, b.bottom))) bad = 'board ' + [b.left, b.top, b.right, b.bottom].map(Math.round) + ', free ' + [free.l, free.t, free.r, free.b].map(Math.round);
  else { const z = rect(document.querySelector('.zoomctl')); // (not zoomed in: the whole board, centred between the zoom buttons and the market)
    // (where the zoom buttons are a column beside the board; a short landscape screen puts them, and the market, in rows
    // above it: that layout is playtest 2 item A7, its own fix)
    if (z.height > z.width) { const mid = (z.right + free.r) / 2, bm = (b.left + b.right) / 2; if (Math.abs(bm - mid) > 40) bad = 'board centred at ' + Math.round(bm) + ', the free area at ' + Math.round(mid); } }
  const seen = bad && bad + '|' + [b.left, b.top, b.right, b.bottom].map(Math.round), again = seen && (settled || seen === fitSeen); fitSeen = seen;
  assert(!again, 'view: the fitted board is clear of the hand and the market, and centred if it shows whole (' + bad + '; hand ' + cards.map(c => c.className.replace('card', '').trim() + '@' + Math.round(rect(c).top) + (resting.includes(c) ? '' : ' (raised)')).join(' ') + ', hover ' + UI.hover + '; explorer to move at ' + focusPoint().map(Math.round) + ', view ' + [view.x, view.y, view.s * 1000].map(Math.round) + ', board ' + [layout().w, layout().h, layout().minX].map(Math.round) + ', safe area now ' + JSON.stringify(safeRect()) + '; camera log: ' + diagLog().filter(l => / (fit|ensureVisible|bake)/.test(l)).slice(-4).join(' / ') + ')');
}
if (CHECKS) setInterval(() => fitCheck(false), 500);

