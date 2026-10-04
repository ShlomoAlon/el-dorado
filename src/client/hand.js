/* The hand (fanned over the bottom of the board), the cards in play, the two piles, and dragging a card to play it.
   Cards are positioned with transforms computed from cached sizes (geometry.js), never by measuring; every move is a
   CSS transition on transform, which the compositor runs. A new card is placed at the deck first and moved into the
   hand one frame later, so it slides in without the browser having to lay out anything in between. */
import { CT, typeOf, plural, assert } from '../engine.gen.js';
import { $, esc, setText, setHTML, setStyle, reduceMotion, EASE } from './dom.js';
import { S, UI, cur, hp, viewIdx, canAct, G, covered } from './state.js';
import { geo, handTop } from './geometry.js';
import { cardHTML, cardTitle } from './cards.js';
import { render, after, afterEach } from './frame.js';
import { targetAt, setHot, hotTarget } from './board/overlays.js';
import { startAim } from './aim.js';
import { onHandCard, onPlayCard, cardUsable, isTargeted, isDisc, doMove, startDiscard, addDiscard, togglePick, playAction, targets } from './actions.js';
import { replayNext } from './replay.js';
import { sfx } from './sound.js';
import { hoverCheck } from './hovercheck.js';
import { CHECKS, diag } from './debug.js';

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
/* the risen card's hit area: one, made once; a press on it is a press on the card's own (its handlers, its pointer capture) */
let rhEl = null;
function risenHit() { if (rhEl) return rhEl; rhEl = document.createElement('div'); rhEl.className = 'chit risen'; rhEl.style.zIndex = 1; rhEl.style.display = 'none';
  rhEl.addEventListener('pointerdown', e => { const el = cardEls.get(rhEl.dataset.id), h = el && el.__hit; if (!h) return;
    const f = new PointerEvent('pointerdown', e); h.dispatchEvent(f); if (f.defaultPrevented) e.preventDefault(); });
  $('#cardhits').appendChild(rhEl); return rhEl; }
function setHit(el, x, y, rot, sc, z) { const h = el.__hit; if (!h) return; setStyle(h, 'transform', T(x, y, rot, sc)); setStyle(h, 'zIndex', z); }
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
  const tsc = bw / cw * .78, tw = cw * tsc; let tk = 0, risenAt = null;
  hand.forEach((id, i) => {
    // (a card still entering, or dragged, is drawn where its flight or the drag puts it; its hit area rests in its place from the
    // start: a hit area only ever where its card rests, never where it was made (the game area's corner, over the Menu button))
    const el = cardEls.get(id); if (!el) return; const moving = el.__enter || el.classList.contains('free');
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
    if (!moving) { setStyle(el, 'zIndex', z); setT(el, x, y, rot, sc); }
    if (i === hi && !moving) risenAt = [id, x, y, rot, sc];
  });
  // the hovered card's own hit area where it is drawn, risen and grown: under every resting place (a neighbour's resting place
  // keeps priority where they overlap), the card's own above them (ledger #54: its top drew over nothing that took the pointer)
  const rh = risenHit(); if (risenAt) { const [id, x, y, rot, sc] = risenAt; rh.dataset.id = id; setStyle(rh, 'transform', T(x, y, rot, sc)); setStyle(rh, 'display', ''); }
  else setStyle(rh, 'display', 'none');
  // the play area: a small overlapping row left of the discard pile
  const psc = .46, pw = cw * psc, ph = ch * psc, baseX = W - 16 - pileW - 24 - pw, py = H - 16 - (phone ? 76 : 104) + ((phone ? 76 : 104) - ph);
  play.forEach((id, i) => { const el = cardEls.get(id); if (!el) return; const k = play.length - 1 - i; if (!el.__enter) { setStyle(el, 'zIndex', 5 + i); setT(el, baseX - k * pw * .42 - (cw - pw) / 2, py - (ch - ph) / 2, 0, psc); } setHit(el, baseX - k * pw * .42 - (cw - pw) / 2, py - (ch - ph) / 2, 0, psc, 5 + i); });
  setStyle($('#choice'), '--cb', Math.round(ch * 1.18 + 14 + 30) + 'px'); // (just above the raised hand and its tags)
  const lbl = $('#playLbl'); setStyle(lbl, 'opacity', play.length ? 1 : 0); setStyle(lbl, 'transform', `translate(${baseX + pw - W}px,${py - 18}px)`); // (its right end at the row's, which never moves: the row grows to the left, the label stays put)
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
  // new cards: drawn from the deck (or, a new player's hand, from below), one after another; after a reshuffle, once it is shown
  const wait = reshuffled(pl, vi, switching); // (ms)
  let k = 0;
  for (const id of [...want, ...wantPlay]) {
    if (cardEls.has(id)) continue; const el = newCard(S,id);
    if (switching) setT(el, A.width / 2 - geo.cw / 2, A.height + 30, 0, 1); else placeAt(el, geo.deck, 0);
    el.__enter = { wait: reduceMotion ? 0 : switching ? k * 50 : wait + k * 70 }; entering.push(el); k++; // (held: layoutCards leaves it where it starts)
    if (el.__enter.wait) setStyle(el, 'visibility', 'hidden'); // (unseen until it leaves: face up on the deck, it hid the cards before it and the reshuffle)
  }
  // each one waits where it starts (its hit area already in its place: layoutCards) and is let go at its turn, after two
  // frames at least: the browser has drawn it there once, so moving it is a transition, not a jump. (A wait set on the
  // card's transition instead applied to every later move of the card too, until a timer cleared it: a hover during a
  // reshuffle's wait restarted it, and a move made then jumped, 2026-10-05)
  if (entering.length) { const list = entering; entering = []; requestAnimationFrame(() => requestAnimationFrame(() => {
    const go = el => { el.__enter = false; setStyle(el, 'visibility', ''); render(); }; // (laid out in a frame, as every change is: never directly, which moved hit areas no frame had drawn)
    for (const el of list) if (el.__enter && el.__enter.wait) setTimeout(go, el.__enter.wait, el); else go(el); })); }
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
  // checks: a hit area takes the pointer only where its card rests: placed the frame it is made, never left where it was made
  if (CHECKS) for (const [id, el] of cardEls) assert(!el.__hit || el.__hit.__stransform, `view: a card's hit area rests where its card does, never where it was made (${id})`);
  // piles
  setText($('#deckN'), pl.deck.length); setText($('#discN'), pl.discard.length);
  const dn = Math.min(3, pl.deck.length);
  setHTML($('#deckStack'), dn ? (dn > 2 ? '<div class="back b3"></div>' : '') + (dn > 1 ? '<div class="back b2"></div>' : '') + '<div class="back"></div>' : '<div class="empty-slot"></div>');
  pileShow($('#discStack'), pl.discard.slice(-2)); // (its top card, and the one under it: what shows while a new top flies in)
}
/* a reshuffle: the deck ran out, and the discard pile became the deck (engine drawCards). Seen in the game, never told: the
   bottom card of the pile on view left it for its owner's hand or deck, which nothing else does (a replay stepped back
   undoes discards: not a reshuffle). How it shows is UI.reshuffle (owner, 2026-10-05: tried in the design editor, the
   chosen one is then built in for good): 'instant', the deck simply full again; 'gather', the pile's cards fly over onto
   the deck; 'riffle', and the deck is riffled. Only drawn (cards that exist only while they fly, the deck shown once they
   land); the cards drawn from it wait for it, input never does. Returns that wait (ms) */
let seen = null; // the pile on view at the last update: { vi, ids, at (the replay's step) }
export const reshuffles = { n: 0 }; // (reshuffles seen: tests check their games reached one)
function reshuffled(pl, vi, switching) {
  const was = seen, at = G.replay ? G.replay.i : -1; seen = { vi, ids: pl.discard.slice(), at };
  if (!was || switching || was.vi !== vi || !was.ids.length || (G.replay && at <= was.at)) return 0;
  const b = was.ids[0]; if (pl.discard.includes(b) || !(pl.hand.includes(b) || pl.deck.includes(b))) return 0;
  reshuffles.n++; diag(`reshuffle ${was.ids.length} (${UI.reshuffle})`);
  if (UI.reshuffle === 'instant' || reduceMotion || !geo.disc || !geo.deck) return 0;
  const A = geo.app, D = geo.disc, K = geo.deck, n = Math.min(6, was.ids.length), FLY = 420, GAP = 55;
  const box = (r, html) => { const f = document.createElement('div'); f.className = 'shuf'; f.innerHTML = html;
    f.style.width = r.width + 'px'; f.style.height = r.height + 'px'; f.style.setProperty('--cw', r.width + 'px'); f.style.transform = `translate(${r.left - A.left}px,${r.top - A.top}px)`; $('#cards').appendChild(f); return f; };
  const gone = (f, a) => { const end = () => f.remove(); a.finished.then(end, end); }; // (cancelled: a page leaving the game; the card goes either way)
  const dx = K.left - D.left, dy = K.top - D.top;
  for (let i = 0; i < n; i++) { // bottom first: the top card, face up, turns over on its way
    const top = i === n - 1, f = box(D, (top ? `<div class="mcard">${cardHTML(typeOf(S, was.ids[was.ids.length - 1]))}</div>` : '') + '<div class="back"></div>');
    const a = f.animate([{ transform: 'none' }, { transform: `translate(${dx * .5}px,${dy * .5 - 46}px) rotate(${-10 + i * 3}deg) scale(1.06)`, offset: .5 }, { transform: `translate(${dx}px,${dy}px)` }],
      { duration: FLY, delay: i * GAP, easing: EASE, fill: 'both', composite: 'add' });
    gone(f, a);
    if (top) f.firstElementChild.animate([{ opacity: 1 }, { opacity: 1, offset: .35 }, { opacity: 0, offset: .55 }, { opacity: 0 }], { duration: FLY, delay: i * GAP, fill: 'both' });
  }
  let t = FLY + (n - 1) * GAP;
  if (UI.reshuffle === 'riffle') { // the deck split in two halves, which drop back into one, interleaved
    // (both halves part toward the board: the deck sits at the game area's left edge)
    const R = 520, half = (dx, dy, r) => { const f = box(K, '<div class="back"></div>'); f.style.opacity = 0; // (shown once the cards have landed)
      f.animate([{ opacity: 1 }, { opacity: 1 }], { duration: R, delay: t, fill: 'forwards' }); gone(f, f.animate([{ transform: 'none' },
      { transform: `translate(${dx * K.width}px,${dy * K.height}px) rotate(${r}deg)`, offset: .3 }, { transform: `translate(${dx * K.width * .92}px,${dy * K.height * .8}px) rotate(${r * .85}deg)`, offset: .55 },
      { transform: 'none' }], { duration: R, delay: t, easing: EASE, fill: 'both', composite: 'add' })); };
    half(.1, -.26, -10); half(.8, -.1, 12); t += R;
  }
  const end = t - 60; $('#deckStack').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 60, delay: end, fill: 'backwards' }); // (the deck shows once the cards are on it)
  return t;
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
function clear() { for (const [, el] of cardEls) { el.remove(); if (el.__hit) el.__hit.remove(); } cardEls.clear(); if (rhEl) setStyle(rhEl, 'display', 'none'); lastViewer = -1; entering = []; seen = null; }
export const handPart = { name: 'hand',  update, reset: clear };

/* a card bought (or taken) by the player on view flies from where it was bought onto their discard pile: the pile's top
   card, once this frame has drawn it there (the card under it shows meanwhile) */
export function flyToDiscard(from) {
  after(() => { const c = $('#discStack .mcard:last-child'); if (c) flyIn(c, from, { duration: 700, lift: true, raise: $('#discPile') }); });
}

/* ---------- the card under the pointer ---------- */
/* which card the pointer is over: derived from the hit area actually under it, never kept from an enter or a leave, and worked
   out again at every move and after every frame that draws: whatever changed what is under a still mouse (the hand laid out
   again, an overlay closed, the start screen gone, a card joining the hand) is drawn in a frame, and then asked. (Kept from
   enter and leave, a dropped enter left a card under a resting mouse unraised, 2026-10-04; worked out again only for the
   changes listed, a hand moving under it, any other change left it stale, 2026-10-05.) One place decides it; a drag clears
   it, and a pointer that leaves the page leaves no card under it */
const overCard = t => { const h = t && t.closest ? t.closest('.chit') : null, id = h && h.dataset.id;
  return id && !drag && !covered() && hp().hand.includes(id) ? id : null; };
let pointer = null, decided = 0; // (the mouse's last place on the page, a touch having none between taps; decided: times the hover was worked out)
const setHover = (id, how) => { decided++; if (UI.hover === id) return;
  if (CHECKS) { diag(`hover ${UI.hover} → ${id} (${how})`);
    if (pointer && !drag && !covered() && onRisen(pointer.x, pointer.y)) assert(false, `view: the card drawn under the pointer is the card under it (${UI.hover}, drawn risen beyond every card's resting place, lost the pointer to ${id || 'nothing'} at ${Math.round(pointer.x)},${Math.round(pointer.y)}: ${how})`); }
  UI.hover = id; }; // (a change draws a frame, which asks again: the same answer, and it rests)
const pointAt = e => { pointer = e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY } : null; decidedOn = e.target; setHover(overCard(e.target), e.type); };
for (const t of ['pointermove', 'pointerover']) addEventListener(t, pointAt, { capture: true, passive: true });
document.documentElement.addEventListener('pointerleave', () => { pointer = null; setHover(null); });
let decidedOn = null; // (checks: what was under the pointer when the hover was last decided)
const askAgain = how => { if (!pointer) return; const t = document.elementFromPoint(pointer.x, pointer.y); decidedOn = t; setHover(overCard(t), how + ', over ' + (t ? t.id || t.tagName.toLowerCase() + '.' + String(t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className).split(' ')[0] : 'nothing')); checkHover(pointer.x, pointer.y); };
afterEach(() => askAgain('drawn'));
// (and when something stops moving, which no frame of ours draws: a closing menu fading out, a card landing)
for (const t of ['transitionend', 'transitioncancel', 'animationend', 'animationcancel']) addEventListener(t, () => askAgain(t), { capture: true, passive: true });
/* ---------- pressing and dragging a card ---------- */
const pastHand = y => y < geo.app.top + geo.app.height - geo.cw * 1.4 * 1.25; // dragged up out of the hand
/* checks: the card under the pointer in the hand is the one whose resting place is there (hovercheck.js); while nothing is
   dragged and the hand is shown */
/* Judged where the hover was decided, each time: a judgement is dropped once the hover has been worked out again since (the
   page may draw nothing for seconds after a move; by the time it is judged, a later answer stands, judged in its turn) */
function checkHover(x, y) { if (!CHECKS) return; const n = decided, off = () => !!drag || !S || covered() || G.replay || decided !== n; if (off()) return;
  const idOf = el => [...cardEls].find(([, e]) => e === el)?.[0], where = id => !id ? 'none' : `${id} ${hp().hand.includes(id) ? 'in the hand' : hp().play.includes(id) ? 'in play' : 'elsewhere'}`;
  hoverCheck('hand', $('#cardhits'), x, y, () => hp().hand.map(id => cardEls.get(id)).filter(Boolean), el => el.__rest, () => (UI.hover && cardEls.get(UI.hover)) || null, off,
    (t, under) => `; the hit area's card ${where(t.closest('.chit') && t.closest('.chit').dataset.id)}, the resting card ${where(idOf(under))}; hover ${UI.hover}, covered ${covered()}, mode ${UI.mode}; decided over ${decidedOn ? (decidedOn.id ? '#' + decidedOn.id : decidedOn.tagName.toLowerCase() + '.' + String(decidedOn.className && decidedOn.className.baseVal !== undefined ? decidedOn.className.baseVal : decidedOn.className).split(' ')[0]) + (decidedOn.closest('[id]') ? ' in #' + decidedOn.closest('[id]').id : '') + ' (' + (decidedOn.getAnimations ? decidedOn.getAnimations({ subtree: false }).length : '?') + ' animations)' : 'nothing'}`, drawnBox); }
if (CHECKS) addEventListener('pointermove', e => checkHover(e.clientX, e.clientY));
/* checks: the card drawn under the pointer is the card under it. Where the hovered card is drawn (risen and grown) beyond every
   card's resting place, it is the only card there: the pointer there is on it, and a press there is on it (ledger #54: a tap
   on a raised card's top did nothing, and a mouse moving onto that top lowered the card from under it). Where it covers a
   neighbour's resting place, the neighbour has priority (owner, 2026-10-03), so only the part over no resting place is judged */
const inBox = (x, y, r) => { const cx = r.l + r.w / 2, cy = r.t + r.h / 2, a = -(r.rot || 0) * Math.PI / 180, dx = x - cx, dy = y - cy;
  return Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) < r.w / 2 - 1 && Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) < r.h / 2 - 1; };
const drawnBox = el => { const t = el.__t, cw = geo.cw, ch = cw * 1.4, A = geo.app; return t && { l: A.left + t.x + cw * (1 - t.sc) / 2, t: A.top + t.y + ch * (1 - t.sc) / 2, w: cw * t.sc, h: ch * t.sc, rot: t.rot }; };
const onRisen = (x, y) => { const el = UI.hover && cardEls.get(UI.hover), b = el && drawnBox(el); return !!b && inBox(x, y, b) && ![...cardEls.values()].some(c => c.__rest && inBox(x, y, c.__rest)); };
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
