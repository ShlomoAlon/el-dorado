/* The update loop. Whatever changes the game or the selection calls render(); in the next animation frame every view
   part updates itself from the state. A part writes only what differs from what it wrote last time, and never reads
   layout (sizes come from geometry.js), so an update costs what actually changed on screen. Code that has to measure
   the new DOM (a card flying to where it now sits) runs in after(): once every part has written. */
const parts = [], afterQ = [];
let raf = 0, drawing = false;
/* the view parts are drawing: they read the state and write the page, never the state (state.js checks every write) */
export const isDrawing = () => drawing;
/* p: { update(), reset?() } — reset: a different game is on show (drop its elements) */
export function addPart(p) { parts.push(p); }
// a part that fails is a bug: logged and reported (boundary.js), and the other parts still update
const safe = (f, what) => { try { f(); } catch (e) { console.error(what, e); failed(e, 'view ' + what); } };
let gen = 0;
export function render() { gen++; if (!raf) raf = requestAnimationFrame(flush); watchFlash(); } // (checks: a change starts the watch for flashes)
/* which change the page is at: each render() (a change) moves it on; what is derived from the state is kept for one */
export const changeGen = () => gen;
// a frame is due: the state has moved on and the page doesn't show it yet (checks judge the page only when it is up to date)
export const frameDue = () => !!raf;
import { diag, CHECKS, frameMark, watchFlash } from './debug.js';
import { assert } from '../engine.gen.js';
import { failed } from './boundary.js';
export function flush() {
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  const t1 = CHECKS ? performance.now() : 0;
  safe(frameMark, 'checks'); // (checks: what changed before this frame is judged apart from it)
  let slow = '', slowMs = 0; // (checks: the slowest part of this frame, named when the frame is slow)
  drawing = true; try { for (const p of parts) { const t = CHECKS ? performance.now() : 0; safe(() => p.update(), p.name); if (CHECKS) { const d = performance.now() - t; if (d > slowMs) { slowMs = d; slow = p.name; } } } } finally { drawing = false; }
  const t2 = CHECKS ? performance.now() : 0; for (const f of afterQ.splice(0)) safe(f, 'after'); for (const f of eachQ) safe(f, 'after'); const t3 = CHECKS ? performance.now() : 0;
  safe(frameMark, 'checks'); drawnAt = innerWidth + '×' + innerHeight;
  if (CHECKS) { const t4 = performance.now(), ms = t4 - t1; if (ms > 8) diag(`update ${ms.toFixed(0)} ms (parts ${(t2 - t1).toFixed(0)}, slowest ${slow} ${slowMs.toFixed(0)}; after ${(t3 - t2).toFixed(0)}; checks ${(t4 - t3).toFixed(0)})`); }
}
let drawnAt = ''; // (the window's size when the page was last drawn: checks)
export function after(f) { afterQ.push(f); render(); }
/* f after every frame that draws, once its views are updated (measuring is free then), without asking for frames of its own:
   for what is derived from the page as drawn (the card under a still mouse), so it is worked out again whatever changed */
const eachQ = []; export function afterEach(f) { eachQ.push(f); }
/* checks that measure the page run once the frame showing it has been drawn, in a task right after it: its layout is
   done then, so measuring costs nothing. (In after() they made the browser lay the page out early, inside the frame:
   up to 10 ms of a frame in the tests, which the player's browser never pays) */
export function afterDrawn(f) { requestAnimationFrame(() => { const c = new MessageChannel(); c.port1.onmessage = () => safe(f, 'check'); c.port2.postMessage(0); }); }
export function resetView() { for (const p of parts) if (p.reset) safe(() => p.reset(), p.name + ' reset'); render(); }
/* checks (debug and tests): the page is up to date. Four times a second and after every input, when no frame is due, one extra frame is drawn:
   with nothing new it must change nothing. If it changes something, the state had moved on without anyone asking for a
   frame (render), and the page showed stale content until then; wherever the missed render() is, this catches it.
   during(): in play (main.js). The turn clock's text changes with time, not with the state: not counted */
export function freshInit(during) {
  if (!CHECKS) return;
  const app = document.getElementById('app'), mo = new MutationObserver(() => {});
  const who = r => { const n = r.target.nodeType === 1 ? r.target : r.target.parentElement; if (!n) return '?'; const c = n.getAttribute('class');
    const was = r.type === 'childList' ? '' : ': ' + String(r.oldValue).slice(0, 80) + ' -> ' + String(r.type === 'attributes' ? r.target.getAttribute(r.attributeName) : r.target.data).slice(0, 80);
    return ((n.closest('[id]') || {}).id || '?') + ' ' + n.tagName.toLowerCase() + (c ? '.' + c.split(' ')[0] : '') + (r.type === 'attributes' ? ' [' + r.attributeName + ']' : r.type === 'childList' ? ' (elements)' : ' (text)') + was; };
  let due = 0, sizeAt = ''; // checks in a row that found a frame due (and so judged nothing); the window's size at the last check
  const check = () => {
    if (!during()) { due = 0; return; }
    // (a window resized since the last check: its frame is the page keeping up with a change from outside, not a page that
    // never rests. Resized all along, WebKit's frames of 50-70 ms were due at every check of a 16 s sweep; 2026-10-05)
    const size = innerWidth + '×' + innerHeight; if (size !== sizeAt) { sizeAt = size; due = 0; }
    // a frame is due: judged at the next check. Not for long: a page that always has a frame due is never judged, and never rests
    if (raf) { if (++due >= 40) { due = 0; assert(false, 'view: the page rests (a frame was due at every check for 10 s)'); } return; }
    due = 0;
    // (the window resized since the page was last drawn: a change from outside, like an input, whose own frame is on its way
    // (geometry.js's observer); what is under a still mouse may differ already. Judged at the next check)
    if (drawnAt !== innerWidth + '×' + innerHeight) return;
    safe(frameMark, 'checks'); // (what came before this frame is judged as before)
    mo.observe(app, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true });
    flush();
    // (a real change only: an attribute or text written again with the same value isn't stale content)
    const stale = mo.takeRecords().filter(r => { const n = r.target.nodeType === 1 ? r.target : r.target.parentElement; if (!n || n.closest('#turnTimer')) return false;
      return r.type === 'childList' ? true : r.type === 'attributes' ? r.target.getAttribute(r.attributeName) !== r.oldValue : r.target.data !== r.oldValue; });
    mo.disconnect();
    if (stale.length) assert(false, 'view: the page is up to date (a frame with nothing new still changed ' + who(stale[0]) + ')');
    // and it rests: a frame with nothing new asks for no other (one that did would draw again, and again: a page that never idles)
    assert(!raf, 'view: the page rests (a frame with nothing new asked for another frame)');
  };
  setInterval(check, 250);
  // and right after every input (once its handlers have run): a handler that changed something without asking for a frame
  // is caught at once, not only when a sample happens to fall in the moment before the next frame
  let soon = 0; const afterInput = () => { if (!soon) soon = setTimeout(() => { soon = 0; check(); }, 0); };
  for (const t of ['pointerdown', 'pointerup', 'pointerover', 'pointerout', 'click', 'keydown']) addEventListener(t, afterInput, true);
}

