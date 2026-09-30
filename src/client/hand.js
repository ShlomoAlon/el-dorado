/* The hand (fanned over the bottom of the board), the cards in play, the two piles, and dragging a card to play it.
   Cards are positioned with transforms computed from cached sizes (geometry.js), never by measuring; every move is a
   CSS transition on transform, which the compositor runs. A new card is placed at the deck first and moved into the
   hand one frame later, so it slides in without the browser having to lay out anything in between. */
import { CT, typeOf, plural } from '../engine.gen.js';
import { $, esc, setText, setHTML, setStyle, reduceMotion, EASE } from './dom.js';
import { S, UI, cur, hp, viewIdx, canAct, G } from './state.js';
import { geo } from './geometry.js';
import { cardHTML, cardTitle } from './cards.js';
import { render } from './frame.js';
import { targetAt, setHot, hotTarget } from './board/overlays.js';
import { startAim } from './aim.js';
import { onHandCard, onPlayCard, cardUsable, isTargeted, isDisc, doMove, startDiscard, addDiscard, togglePick, playAction } from './actions.js';
import { replayNext } from './replay.js';
import { sfx } from './sound.js';

export const cardEls = new Map(); // card id → element
let lastViewer = -1;
export let drag = null; // a card being pressed / dragged
export const buySlotBox = { x: 0, y: 0, w: 92 }; // where the purchase slot sits (game-area coordinates)
const T = (x, y, rot, sc) => `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
export function setT(el, x, y, rot, sc) { el.__t = { x, y, rot, sc }; setStyle(el, 'transform', T(x, y, rot, sc)); }
/* the card's box (cw × 1.4 cw, scaled about its centre) covering a screen rectangle */
export function rectT(rect, rot) { const cw = geo.cw, ch = cw * 1.4, A = geo.app, sc = rect.width / cw; return [rect.left - A.left - (cw - rect.width) / 2, rect.top - A.top - (ch - rect.height) / 2, rot || 0, sc]; }
export const placeAt = (el, rect, rot) => setT(el, ...rectT(rect, rot));
function newCard(S,id) {
  const el = document.createElement('div'); el.className = 'card'; el.innerHTML = cardHTML(typeOf(S,id)); el.title = cardTitle(typeOf(S,id));
  $('#cards').appendChild(el); cardEls.set(id, el); wire(el, id); return el;
}

/* ---------- layout: where every card of the hand and the play area goes (pure arithmetic) ---------- */
function layoutCards() {
  if (!S) return;
  const W = geo.app.width, H = geo.app.height, cw = geo.cw, ch = cw * 1.4, phone = W < 600;
  const pl = hp(), hand = UI.cover ? [] : pl.hand, play = UI.cover ? [] : pl.play, n = hand.length;
  const pileW = phone ? 54 : 74, avail = W - 2 * (pileW + 32) - (W > 900 ? 140 : 0);
  const step = n > 1 ? Math.min(cw * .86, Math.max(cw * .32, (avail - cw) / (n - 1))) : 0;
  const hi = hand.indexOf(UI.hover), paying = UI.mode === 'pay' && UI.buy && !UI.cover, choosing = UI.mode === 'trashPick' && !UI.cover;
  const lifted = id => (UI.mode === 'card' && UI.card === id) || (!paying && UI.picks.includes(id)) || (drag && drag.started && drag.id === id);
  // the purchase slot above the hand, the spending tray to its right
  const bw = Math.round(cw * (phone ? .78 : .72)), bx = W / 2 - bw / 2, by = H - ch * 1.02 - 14 - bw * 1.4 - 26, bs = $('#buySlot');
  buySlotBox.x = bx; buySlotBox.y = by; buySlotBox.w = bw; setStyle(bs, '--bw', bw + 'px'); setStyle(bs, '--bx', bx + 'px'); setStyle(bs, '--by', by + 'px');
  const tsc = bw / cw * .78, tw = cw * tsc; let tk = 0;
  hand.forEach((id, i) => {
    const el = cardEls.get(id); if (!el || el.__enter || el.classList.contains('free')) return;
    const off = i - (n - 1) / 2;
    let x = W / 2 + off * step - cw / 2, y = H - ch * (phone ? .78 : .9) + off * off * (phone ? 1.6 : 2.6), rot = off * (phone ? 2.4 : 3.2), sc = 1, z = 10 + i;
    if (hi >= 0 && i !== hi) x += Math.sign(i - hi) * cw * .16;
    if (paying && UI.picks.includes(id)) { const k = tk++; x = bx + bw + 18 + k * tw * .55 - (cw - tw) / 2; y = by + bw * 1.4 * .5 - ch / 2 + k * 3; rot = 4 + k * 3; sc = tsc; z = 70 + k; }
    else if (choosing) { y = H - ch * 1.02 - 14 + off * off * 1.5; rot *= .5; if (UI.picks.includes(id)) { y -= ch * .16; z = 60 + i; } if (i === hi && !drag) { y = Math.min(y, H - ch * 1.1 - 14); rot = 0; z = 90; } } // the whole hand up; chosen cards higher
    else { if (lifted(id)) { y = H - ch * 1.02 - 14; rot *= .4; z = 60 + i; } if (i === hi && !drag) { y = H - ch * 1.12 - 14; rot = 0; sc = 1.14; z = 90; } }
    setStyle(el, 'zIndex', z); setT(el, x, y, rot, sc);
  });
  // the play area: a small overlapping row left of the discard pile
  const psc = .46, pw = cw * psc, ph = ch * psc, baseX = W - 16 - pileW - 24 - pw, py = H - 16 - (phone ? 76 : 104) + ((phone ? 76 : 104) - ph);
  play.forEach((id, i) => { const el = cardEls.get(id); if (!el || el.__enter) return; const k = play.length - 1 - i; setStyle(el, 'zIndex', 5 + i); setT(el, baseX - k * pw * .42 - (cw - pw) / 2, py - (ch - ph) / 2, 0, psc); });
  setStyle($('#choice'), '--cb', Math.round(ch * 1.18 + 14 + 30) + 'px'); // (just above the raised hand and its tags)
  const lbl = $('#playLbl'); setStyle(lbl, 'opacity', play.length ? 1 : 0); setStyle(lbl, 'transform', `translate(${baseX - (play.length - 1) * pw * .42}px,${py - 18}px)`);
}

/* ---------- the hand's view part ---------- */
let entering = [];
function update() {
  if (!S) { clear(); return; }
  const pl = hp(), vi = viewIdx(), switching = lastViewer !== vi; lastViewer = vi;
  const want = UI.cover ? [] : pl.hand, wantPlay = UI.cover ? [] : pl.play, keep = new Set([...want, ...wantPlay]), A = geo.app;
  // cards that left: to the discard pile, up and away (removed from the game), or down (another player's hand now)
  for (const [id, el] of cardEls) {
    if (keep.has(id)) continue; cardEls.delete(id); el.style.pointerEvents = 'none'; el.__enter = false;
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
    const el = cardEls.get(id); let dim = false;
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
  const q = acting && UI.mode === 'trashPick' && !UI.cover && S.turn.pending, qb = $('#choice');
  if (qb.hidden !== !q) qb.hidden = !q; $('#vp').classList.toggle('dim', !!q);
  if (q) setHTML(qb, `<div class="ct"><b>${esc(CT[q.by].n)}</b> · remove up to ${plural(q.max, 'card')}</div><div class="cs">${UI.picks.length ? `<b>${UI.picks.length}</b> of ${q.max} chosen · they leave the game` : 'Tap cards to choose · they leave the game'}</div>`);
  layoutCards();
  // piles
  setText($('#deckN'), pl.deck.length); setText($('#discN'), pl.discard.length);
  const dn = Math.min(3, pl.deck.length);
  setHTML($('#deckStack'), dn ? (dn > 2 ? '<div class="back b3"></div>' : '') + (dn > 1 ? '<div class="back b2"></div>' : '') + '<div class="back"></div>' : '<div class="empty-slot"></div>');
  const top = pl.discard[pl.discard.length - 1];
  setHTML($('#discStack'), top ? `<div class="mcard">${cardHTML(typeOf(S,top))}</div>` : '<div class="empty-slot"></div>');
}
function setLeft(el, txt) { let b = el.querySelector('.left'); if (!txt) { if (b) b.remove(); return; } if (!b) { b = document.createElement('div'); b.className = 'left'; el.appendChild(b); } setText(b, txt); }
function clear() { for (const [, el] of cardEls) el.remove(); cardEls.clear(); lastViewer = -1; entering = []; }
export const handPart = { name: 'hand',  update, reset: clear };

/* a card bought (or taken) by the player on view flies from where it was bought into the discard pile */
export function flyToDiscard(t, from) {
  if (!from || !from.width || reduceMotion) return;
  const el = document.createElement('div'); el.className = 'card fly'; el.innerHTML = cardHTML(t); $('#cards').appendChild(el);
  const [x, y, , sc] = rectT(from, 0), end = rectT(geo.disc, 6);
  el.animate([{ transform: T(x, y, 0, sc) }, { transform: T(x, y - 30, 0, sc * 1.15), offset: .3 }, { transform: T(...end) }], { duration: 700, easing: EASE, fill: 'forwards' }).finished.then(() => el.remove(), () => el.remove());
}

/* ---------- pressing and dragging a card ---------- */
const pastHand = y => y < geo.app.top + geo.app.height - geo.cw * 1.4 * 1.25; // dragged up out of the hand
function wire(el, id) {
  el.addEventListener('pointerenter', () => { if (drag || UI.cover) return; if (hp().hand.includes(id)) { UI.hover = id; layoutCards(); } });
  el.addEventListener('pointerleave', () => { if (UI.hover === id) { UI.hover = null; if (!drag) layoutCards(); } });
  el.addEventListener('pointerdown', e => {
    if (S.over || UI.cover || UI.anim || e.button > 0 || !canAct()) return;
    const inHand = cur().hand.includes(id), isAct = S.turn.active && S.turn.active.id === id;
    if (!inHand && !isAct) return;
    e.preventDefault();
    const pickMode = ['trashPick', 'endTurn', 'transmit'].includes(UI.mode);
    drag = { id, x0: e.clientX, y0: e.clientY, started: false, pid: e.pointerId, inHand, wasSel: UI.mode === 'card' && UI.card === id,
      kind: pickMode ? 'none' : UI.mode === 'discardFor' || UI.mode === 'pay' ? (inHand && !UI.picks.includes(id) ? 'free' : 'none') : (isAct || isTargeted(id) ? 'aim' : 'free') };
    try { el.setPointerCapture(e.pointerId); } catch (_) { }
  });
  el.addEventListener('pointermove', e => {
    if (!drag || drag.id !== id || e.pointerId !== drag.pid) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.started) {
      if (Math.hypot(dx, dy) < 8 || drag.kind === 'none') return; drag.started = true; UI.hover = null;
      if (drag.kind === 'aim') { if (!(UI.mode === 'card' && UI.card === id)) { UI.mode = 'card'; UI.card = id; if (S.turn.active && S.turn.active.id === id) UI.piece = S.turn.active.pi; UI.picks = []; render(); } else layoutCards(); }
      else el.classList.add('free');
    }
    if (drag.kind === 'aim') { drag.cx = e.clientX; drag.cy = e.clientY; startAim(); return; }
    const A = geo.app, cw = geo.cw, ch = cw * 1.4;
    setT(el, e.clientX - A.left - cw / 2, e.clientY - A.top - ch * .4, dx * .02, 1.08); el.style.zIndex = 150;
    const k = targetAt(e.clientX, e.clientY), dk = k && isDisc(UI.targets.get(k)) ? k : null; setHot(dk);
    el.classList.toggle('go', !!dk || (UI.mode !== 'discardFor' && pastHand(e.clientY)));
    if (UI.mode === 'pay') $('#buySlot').classList.toggle('hot', pastHand(e.clientY));
  });
  const end = e => {
    if (!drag || drag.id !== id) return; const d = drag; d.hot = hotTarget(); drag = null;
    if (!d.started) { if (d.inHand) onHandCard(id); else onPlayCard(id); return; }
    if (d.kind === 'aim') {
      const k = d.hot;
      if (k && UI.targets.has(k) && !UI.anim) doMove(k);
      else if (!d.wasSel && !(S.turn.active && S.turn.active.id === id)) { UI.mode = 'idle'; UI.card = null; }
      render(); return;
    }
    if (d.kind !== 'free') return;
    el.classList.remove('free', 'go');
    const k = targetAt(e.clientX, e.clientY), tg = k && UI.targets.get(k); setHot(null);
    if (UI.mode === 'pay') { $('#buySlot').classList.remove('hot'); if (pastHand(e.clientY) && !UI.picks.includes(id)) { sfx('pick'); togglePick(id); } else layoutCards(); }
    else if (isDisc(tg) && !UI.anim) { if (UI.mode === 'discardFor') addDiscard(id); else startDiscard(k, id); }
    else if (UI.mode !== 'discardFor' && pastHand(e.clientY)) playAction(id); else layoutCards();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', e => { if (drag && drag.id === id) { setHot(null); end(e); } });
}
