/* The hand (fanned over the bottom of the board), the cards in play, the two piles, and dragging a card to play it.
   Cards are positioned with transforms computed from cached sizes (geometry.js), never by measuring; every move is a
   CSS transition on transform, which the compositor runs. A new card is placed at the deck first and moved into the
   hand one frame later, so it slides in without the browser having to lay out anything in between. */
import { CT, typeOf, plural, assert } from '../engine.gen.js';
import { $, esc, setText, setHTML, setStyle, reduceMotion, EASE } from './dom.js';
import { S, UI, cur, hp, viewIdx, canAct, G, covered } from './state.js';
import { geo, handTop } from './geometry.js';
import { cardHTML, cardTitle } from './cards.js';
import { render, after } from './frame.js';
import { targetAt, setHot, hotTarget } from './board/overlays.js';
import { startAim } from './aim.js';
import { onHandCard, onPlayCard, cardUsable, isTargeted, isDisc, doMove, startDiscard, addDiscard, togglePick, playAction, targets } from './actions.js';
import { replayNext } from './replay.js';
import { sfx } from './sound.js';
import { hoverCheck } from './hovercheck.js';
import { CHECKS } from './debug.js';

export const cardEls = new Map(); // card id → element
let lastViewer = -1;
export let drag = null; // a card being pressed / dragged (the hand's layout reads it: changed only by setDrag, which draws)
const setDrag = d => { drag = d; render(); };
export const buySlotBox = { x: 0, y: 0, w: 92 }; // where the purchase slot sits (game-area coordinates)
const T = (x, y, rot, sc) => `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
export function setT(el, x, y, rot, sc) { el.__t = { x, y, rot, sc }; setStyle(el, 'transform', T(x, y, rot, sc)); }
/* a card's hit area (#cardhits): where it rests, which alone takes the pointer (hover, tap, drag). The card itself is only
   drawn: it rises, grows and flies without ever taking a neighbour's place under the pointer (owner, 2026-10-03: the card
   underneath has priority; the market's slots work the same way) */
let hitsMoved = false; // (a hit area moved in this layout: what is under a still mouse may have changed)
function setHit(el, x, y, rot, sc, z) { const h = el.__hit; if (!h) return; const t = T(x, y, rot, sc); if (h.__stransform !== t) hitsMoved = true; setStyle(h, 'transform', t); setStyle(h, 'zIndex', z); }
/* the card's box (cw × 1.4 cw, scaled about its centre) covering a screen rectangle */
function rectT(rect, rot) { const cw = geo.cw, ch = cw * 1.4, A = geo.app, sc = rect.width / cw; return [rect.left - A.left - (cw - rect.width) / 2, rect.top - A.top - (ch - rect.height) / 2, rot || 0, sc]; }
export const placeAt = (el, rect, rot) => setT(el, ...rectT(rect, rot));
/* a card flies in as itself: it is already where the game puts it (in the recap, on a pile) and is animated there from
   where it came from (from: a rect on screen), ending as it rests (no transform), so it can only land in its own place.
   No copy flies for it: nothing to hand over to, keep in step or remove. o: tilt, fade (how it starts), lift (rises a
   little on its way), delay, duration; raise: an element lifted over the controls while the card flies (a pile, which
   sits under the turn buttons) */
export function flyIn(el, from, o = {}) {
  if (reduceMotion || !from || !from.width) return;
  assert(getComputedStyle(el).transform === 'none', 'view: a card flies in to its own resting place (it rests with a transform: it would jump as the flight ends)');
  const to = el.getBoundingClientRect(); if (!to.width) return;
  const dx = from.left - to.left, dy = from.top - to.top, s = from.width / to.width, at = (x, y, r, k) => `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r}deg) scale(${k.toFixed(3)})`;
  const k = [{ transformOrigin: '0 0', transform: at(dx, dy, o.tilt || 0, s), opacity: o.fade ? 0 : 1 }];
  if (o.lift) k.push({ transformOrigin: '0 0', transform: at(dx, dy - 30, 0, s * 1.15), opacity: 1, offset: .3 });
  k.push({ transformOrigin: '0 0', transform: 'none', opacity: 1 });
  const a = el.animate(k, { duration: o.duration || 400, delay: o.delay || 0, easing: EASE, fill: 'backwards' });
  if (o.raise) { o.raise.classList.add('flying'); const end = () => o.raise.classList.remove('flying'); a.finished.then(end, end); }
}
function newCard(S,id) {
  const el = document.createElement('div'); el.className = 'card'; el.innerHTML = cardHTML(typeOf(S,id)); el.title = cardTitle(typeOf(S,id));
  $('#cards').appendChild(el); cardEls.set(id, el);
  const h = document.createElement('div'); h.className = 'chit'; h.dataset.id = id; $('#cardhits').appendChild(h); el.__hit = h; wire(el, id); return el;
}

/* ---------- layout: where every card of the hand and the play area goes (pure arithmetic) ---------- */
function layoutCards() {
  if (!S) return;
  const W = geo.app.width, H = geo.app.height, cw = geo.cw, ch = cw * 1.4, phone = W < 600;
  const pl = hp(), hand = covered() ? [] : pl.hand, play = covered() ? [] : pl.play, n = hand.length;
  // the hand is centred and keeps clear of the piles and the turn buttons (their measured width: geometry.js), on both sides alike
  const pileW = phone ? 54 : 74, avail = W - 2 * Math.max(pileW + 32, (W > 900 ? geo.actW + 32 : 0));
  const step = n > 1 ? Math.min(cw * .86, Math.max(cw * .32, (avail - cw) / (n - 1))) : 0;
  const hi = hand.indexOf(UI.hover), paying = UI.mode === 'pay' && UI.buy && !covered(), choosing = UI.mode === 'trashPick' && !covered();
  const lifted = id => (UI.mode === 'card' && UI.card === id) || (!paying && UI.picks.includes(id)) || (drag && drag.started && drag.id === id);
  // the purchase slot above the hand, the spending tray to its right
  const bw = Math.round(cw * (phone ? .78 : .72)), bx = W / 2 - bw / 2, by = H - ch * 1.02 - 14 - bw * 1.4 - 26, bs = $('#buySlot');
  buySlotBox.x = bx; buySlotBox.y = by; buySlotBox.w = bw; setStyle(bs, '--bw', bw + 'px'); setStyle(bs, '--bx', bx + 'px'); setStyle(bs, '--by', by + 'px');
  const tsc = bw / cw * .78, tw = cw * tsc; let tk = 0;
  hand.forEach((id, i) => {
    const el = cardEls.get(id); if (!el || el.__enter || el.classList.contains('free')) return;
    const off = i - (n - 1) / 2;
    let x = W / 2 + off * step - cw / 2, y = handTop() + off * off * (phone ? 1.6 : 2.6), rot = off * (phone ? 2.4 : 3.2), sc = 1, z = 10 + i;
    // (where it rests, the hover aside: its place in the fan, or what choosing it does; checks: hovering is judged from it)
    let rx = x, ry = y, rs = 1, rz = z;
    if (paying && UI.picks.includes(id)) { const k = UI.picks.indexOf(id); rx = bx + bw + 18 + k * tw * .55 - (cw - tw) / 2; ry = by + bw * 1.4 * .5 - ch / 2 + k * 3; rs = tsc; rz = 70 + k; }
    else if (choosing) { ry = H - ch * 1.02 - 14 + off * off * 1.5; if (UI.picks.includes(id)) { ry -= ch * .16; rz = 60 + i; } }
    else if (lifted(id) && !(drag && drag.started && drag.id === id)) { ry = H - ch * 1.02 - 14; rz = 60 + i; }
    setHit(el, rx, ry, off * (phone ? 2.4 : 3.2) * (choosing ? .5 : lifted(id) ? .4 : 1) * (paying && UI.picks.includes(id) ? 0 : 1), rs, rz);
    el.__rest = { l: geo.app.left + rx + cw * (1 - rs) / 2, t: geo.app.top + ry + ch * (1 - rs) / 2, w: cw * rs, h: ch * rs, z: rz, rot: off * (phone ? 2.4 : 3.2) * (choosing ? .5 : lifted(id) ? .4 : 1) * (paying && UI.picks.includes(id) ? 0 : 1) };
    // (a card under the pointer rises, and stays risen while pressed: only a drag takes it out of the hand's look)
    if (hi >= 0 && i !== hi) x += Math.sign(i - hi) * cw * .16;
    if (paying && UI.picks.includes(id)) { const k = tk++; x = bx + bw + 18 + k * tw * .55 - (cw - tw) / 2; y = by + bw * 1.4 * .5 - ch / 2 + k * 3; rot = 4 + k * 3; sc = tsc; z = 70 + k; }
    else if (choosing) { y = H - ch * 1.02 - 14 + off * off * 1.5; rot *= .5; if (UI.picks.includes(id)) { y -= ch * .16; z = 60 + i; } if (i === hi && !(drag && drag.started)) { y = Math.min(y, H - ch * 1.1 - 14); rot = 0; z = 90; } } // the whole hand up; chosen cards higher
    else { if (lifted(id)) { y = H - ch * 1.02 - 14; rot *= .4; z = 60 + i; } if (i === hi && !(drag && drag.started)) { y = H - ch * 1.12 - 14; rot = 0; sc = 1.14; z = 90; } }
    // whatever lifts a card (chosen, under the pointer, the removal choice), it rises no further than the turn buttons
    // above it: a card never covers End turn (the spending tray beside the buy slot is placed apart, above them)
    const B = geo.act; if (B && !(paying && UI.picks.includes(id)) && x < B.right && x + cw > B.left) y = Math.max(y, B.bottom + 6 + ch * (sc - 1) / 2 + Math.sin(Math.abs(rot) * Math.PI / 180) * cw * sc / 2); // (its drawn box: grown about its centre, and tilted)
    setStyle(el, 'zIndex', z); setT(el, x, y, rot, sc);
  });
  // the play area: a small overlapping row left of the discard pile
  const psc = .46, pw = cw * psc, ph = ch * psc, baseX = W - 16 - pileW - 24 - pw, py = H - 16 - (phone ? 76 : 104) + ((phone ? 76 : 104) - ph);
  play.forEach((id, i) => { const el = cardEls.get(id); if (!el || el.__enter) return; const k = play.length - 1 - i; setStyle(el, 'zIndex', 5 + i); setT(el, baseX - k * pw * .42 - (cw - pw) / 2, py - (ch - ph) / 2, 0, psc); setHit(el, baseX - k * pw * .42 - (cw - pw) / 2, py - (ch - ph) / 2, 0, psc, 5 + i); });
  setStyle($('#choice'), '--cb', Math.round(ch * 1.18 + 14 + 30) + 'px'); // (just above the raised hand and its tags)
  const lbl = $('#playLbl'); setStyle(lbl, 'opacity', play.length ? 1 : 0); setStyle(lbl, 'transform', `translate(${baseX + pw - W}px,${py - 18}px)`); // (its right end at the row's, which never moves: the row grows to the left, the label stays put)
  if (hitsMoved) { hitsMoved = false; pointAgain(); }
}

/* ---------- the hand's view part ---------- */
let entering = [];
function update() {
  if (!S) { clear(); return; }
  const pl = hp(), vi = viewIdx(), switching = lastViewer !== vi; lastViewer = vi;
  const want = covered() ? [] : pl.hand, wantPlay = covered() ? [] : pl.play, keep = new Set([...want, ...wantPlay]), A = geo.app;
  // cards that left: to the discard pile, up and away (removed from the game), or down (another player's hand now)
  for (const [id, el] of cardEls) {
    if (keep.has(id)) continue; cardEls.delete(id); if (el.__hit) { el.__hit.remove(); el.__hit = null; } el.__enter = false;
    const t = el.__t;
    if (switching || !S.cards[id]) { setT(el, t.x, A.height + 40, t.rot, t.sc); el.style.opacity = 0; }
    else if (S.trash.includes(id)) { setT(el, t.x, t.y - 90, t.rot - 8, t.sc * .9); el.style.opacity = 0; }
    else placeAt(el, geo.disc, 0);
    setTimeout(() => el.remove(), 380);
  }
  // new cards: drawn from the deck (or, a new player's hand, from below), one after another
  let k = 0;
  for (const id of [...want, ...wantPlay]) {
    if (cardEls.has(id)) continue; const el = newCard(S,id);
    if (switching) setT(el, A.width / 2 - geo.cw / 2, A.height + 30, 0, 1); else placeAt(el, geo.deck, 0);
    if (!reduceMotion) { el.style.transitionDelay = (switching ? k * 50 : k * 70) + 'ms'; setTimeout(() => { el.style.transitionDelay = ''; }, 420 + k * 70); }
    el.__enter = true; entering.push(el); k++;
  }
  // (two frames later: the browser has drawn them at the deck once, so moving them now is a transition, not a jump)
  if (entering.length) { const list = entering; entering = []; requestAnimationFrame(() => requestAnimationFrame(() => { for (const el of list) el.__enter = false; layoutCards(); })); }
  // what each card is doing: selected, picked to pay or keep, discarded for a space, dimmed (can't be used now), in play
  const act = S.turn.active, acting = canAct(), rn = G.replay && replayNext(), rx = rn && rn[1];
  for (const id of want) {
    const el = cardEls.get(id); let dim = !acting && !G.replay; // (not this player's turn: the hand looks as it does for a card that can't be played, owner 2026-10-03)
    if (UI.mode === 'transmit') dim = id !== UI.card;
    if (acting && (UI.mode === 'idle' || UI.mode === 'card') && UI.card !== id) dim = !cardUsable(id);
    el.classList.toggle('sel', (UI.mode === 'card' || UI.mode === 'transmit') && UI.card === id);
    el.classList.toggle('pick', UI.picks.includes(id));
    const dp = (UI.mode === 'discardFor' || UI.mode === 'trashPick') && UI.picks.includes(id); el.classList.toggle('dpick', dp); if (dp) el.dataset.pk = UI.mode === 'trashPick' || UI.pending.kind === 'camp' ? 'Remove' : 'Discard';
    el.classList.toggle('dim', dim); el.classList.remove('inplay', 'act'); setLeft(el, null);
  }
  for (const id of wantPlay) {
    const el = cardEls.get(id), isA = act && act.id === id;
    setLeft(el, isA ? act.left + ' left' : null);
    el.classList.toggle('sel', !!isA && UI.mode === 'card' && UI.card === id); el.classList.add('inplay'); el.classList.toggle('act', !!isA); el.classList.remove('pick', 'dim', 'dpick');
  }
  // a replay marks the card the next move plays and the cards it pays with
  for (const [id, el] of cardEls) { el.classList.toggle('rnext', !!(rx && rx.card === id)); el.classList.toggle('rpay', !!(rx && (rx.cards || rx.keep || []).includes(id))); }
  // a removal to choose (Scientist, Travel Log): the hand is up (layoutCards), this says what's asked, the board steps back
  const q = acting && UI.mode === 'trashPick' && !covered() && S.turn.pending, qb = $('#choice');
  if (qb.hidden !== !q) qb.hidden = !q; $('#vp').classList.toggle('dim', !!q);
  if (q) { setHTML(qb.firstElementChild, `<b>${esc(CT[q.by].n)}</b> · remove up to ${plural(q.max, 'card')}`); setHTML(qb.lastElementChild, UI.picks.length ? `<b>${UI.picks.length}</b> of ${q.max} chosen · they leave the game` : 'Tap cards to choose · they leave the game'); } // (two fixed parts: a pick rewrites only the count)
  layoutCards();
  // piles
  setText($('#deckN'), pl.deck.length); setText($('#discN'), pl.discard.length);
  const dn = Math.min(3, pl.deck.length);
  setHTML($('#deckStack'), dn ? (dn > 2 ? '<div class="back b3"></div>' : '') + (dn > 1 ? '<div class="back b2"></div>' : '') + '<div class="back"></div>' : '<div class="empty-slot"></div>');
  pileShow($('#discStack'), pl.discard.slice(-2)); // (its top card, and the one under it: what shows while a new top flies in)
}
/* a pile's cards, bottom first, over its outline (the slot: always there, the cards cover it). One element per card, kept by
   its id (the outline is in the page's markup): a card that is still there keeps its element (the old top stays where it was, under the new one), so a new card
   never redraws the others */
function pileShow(box, ids) {
  const have = new Map([...box.children].slice(1).map(e => [e.dataset.id, e]));
  for (const [id, e] of have) if (!ids.includes(id)) e.remove();
  ids.forEach((id, i) => { let e = have.get(id); if (!e) { e = document.createElement('div'); e.className = 'mcard'; e.dataset.id = id; e.innerHTML = cardHTML(typeOf(S, id)); }
    if (box.children[i + 1] !== e) box.insertBefore(e, box.children[i + 1] || null); });
}
function setLeft(el, txt) { let b = el.querySelector('.left'); if (!txt) { if (b) b.remove(); return; } if (!b) { b = document.createElement('div'); b.className = 'left'; el.appendChild(b); } setText(b, txt); }
function clear() { for (const [, el] of cardEls) { el.remove(); if (el.__hit) el.__hit.remove(); } cardEls.clear(); lastViewer = -1; entering = []; }
export const handPart = { name: 'hand',  update, reset: clear };

/* a card bought (or taken) by the player on view flies from where it was bought onto their discard pile: the pile's top
   card, once this frame has drawn it there (the card under it shows meanwhile) */
export function flyToDiscard(from) {
  after(() => { const c = $('#discStack .mcard:last-child'); if (c) flyIn(c, from, { duration: 700, lift: true, raise: $('#discPile') }); });
}

/* ---------- the card under the pointer ---------- */
/* which card the pointer is over: worked out again at every move, from the hit area actually under it (the event's target),
   never kept from an enter or a leave. (Set on entering a card only if that card was in the hand at that instant, and cleared
   on leaving it, a dropped enter left the card under a resting pointer unraised until it left and came back: 2026-10-04.)
   One place decides it, so nothing else sets it; a drag clears it, and a pointer that leaves the page leaves no card under it */
const overCard = e => { const h = e.target && e.target.closest ? e.target.closest('.chit') : null, id = h && h.dataset.id;
  return id && !drag && !covered() && hp().hand.includes(id) ? id : null; };
let pointer = null; // (the mouse's last place on the page; a touch has no place between taps)
const pointAt = e => { pointer = e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY } : null; const id = overCard(e); if (UI.hover !== id) UI.hover = id; };
for (const t of ['pointermove', 'pointerover']) addEventListener(t, pointAt, { capture: true, passive: true });
document.documentElement.addEventListener('pointerleave', () => { pointer = null; if (UI.hover) UI.hover = null; });
/* and again when a hit area moved under a mouse that didn't (a card played, the hand closing up): the browser sends no event
   for that, so once the frame's layout is done the hit area under the mouse is asked (measuring after the update: after).
   Only when one moved: asked after every layout, the answer's own render laid the hand out again, without end */
function pointAgain() { if (!pointer) return; after(() => { if (!pointer) return; const t = document.elementFromPoint(pointer.x, pointer.y); const id = overCard({ target: t }); if (UI.hover !== id) UI.hover = id; }); }
/* ---------- pressing and dragging a card ---------- */
const pastHand = y => y < geo.app.top + geo.app.height - geo.cw * 1.4 * 1.25; // dragged up out of the hand
/* checks: the card under the pointer in the hand is the one whose resting place is there (hovercheck.js); while nothing is
   dragged and the hand is shown */
if (CHECKS) addEventListener('pointermove', e => { const off = () => !!drag || !S || covered() || G.replay; if (off()) return;
  hoverCheck('hand', $('#cardhits'), e.clientX, e.clientY, () => hp().hand.map(id => cardEls.get(id)).filter(Boolean), el => el.__rest, () => (UI.hover && cardEls.get(UI.hover)) || null, off); });
function wire(el, id) {
  const hit = el.__hit; // (the pointer's: its events; the card: what is drawn and moved)
  hit.addEventListener('pointerdown', e => {
    if (S.over || covered() || e.button > 0 || !canAct()) return;
    const inHand = cur().hand.includes(id), isAct = S.turn.active && S.turn.active.id === id;
    if (!inHand && !isAct) return;
    e.preventDefault();
    const pickMode = ['trashPick', 'endTurn', 'transmit'].includes(UI.mode);
    setDrag({ id, x0: e.clientX, y0: e.clientY, started: false, pid: e.pointerId, inHand, wasSel: UI.mode === 'card' && UI.card === id,
      kind: pickMode ? 'none' : UI.mode === 'discardFor' || UI.mode === 'pay' ? (inHand && !UI.picks.includes(id) ? 'free' : 'none') : (isAct || isTargeted(id) ? 'aim' : 'free') });
    try { hit.setPointerCapture(e.pointerId); } catch (_) { /* expected: the pointer was already released */ }
  });
  hit.addEventListener('pointermove', e => {
    if (!drag || drag.id !== id || e.pointerId !== drag.pid) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.started) {
      if (Math.hypot(dx, dy) < 8 || drag.kind === 'none') return; setDrag({ ...drag, started: true }); UI.hover = null;
      if (drag.kind === 'aim') { if (!(UI.mode === 'card' && UI.card === id)) { UI.mode = 'card'; UI.card = id; if (S.turn.active && S.turn.active.id === id) UI.piece = S.turn.active.pi; UI.picks = []; } }
      else el.classList.add('free');
    }
    if (drag.kind === 'aim') { drag.cx = e.clientX; drag.cy = e.clientY; startAim(); return; }
    const A = geo.app, cw = geo.cw, ch = cw * 1.4;
    setT(el, e.clientX - A.left - cw / 2, e.clientY - A.top - ch * .4, dx * .02, 1.08); el.style.zIndex = 150;
    const k = targetAt(e.clientX, e.clientY), dk = k && isDisc(targets().get(k)) ? k : null; setHot(dk);
    el.classList.toggle('go', !!dk || (UI.mode !== 'discardFor' && pastHand(e.clientY)));
    if (UI.mode === 'pay') $('#buySlot').classList.toggle('hot', pastHand(e.clientY));
  });
  const end = e => {
    if (!drag || drag.id !== id) return; const d = drag; d.hot = hotTarget(); setDrag(null);
    if (!d.started) { if (d.inHand) onHandCard(id); else onPlayCard(id); return; }
    if (d.kind === 'aim') {
      const k = d.hot;
      if (k && targets().has(k)) doMove(k);
      else if (!d.wasSel && !(S.turn.active && S.turn.active.id === id)) { UI.mode = 'idle'; UI.card = null; }
      render(); return;
    }
    if (d.kind !== 'free') return;
    el.classList.remove('free', 'go');
    const k = targetAt(e.clientX, e.clientY), tg = k && targets().get(k); setHot(null);
    if (UI.mode === 'pay') { $('#buySlot').classList.remove('hot'); if (pastHand(e.clientY) && !UI.picks.includes(id)) { sfx('pick'); togglePick(id); } else render(); }
    else if (isDisc(tg)) { if (UI.mode === 'discardFor') addDiscard(id); else startDiscard(k, id); }
    else if (UI.mode !== 'discardFor' && pastHand(e.clientY)) playAction(id); else render();
  };
  hit.addEventListener('pointerup', end);
  hit.addEventListener('pointercancel', e => { if (drag && drag.id === id) { setHot(null); end(e); } });
}
