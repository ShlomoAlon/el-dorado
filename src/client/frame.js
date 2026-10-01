/* The update loop. Whatever changes the game or the selection calls render(); in the next animation frame every view
   part updates itself from the state. A part writes only what differs from what it wrote last time, and never reads
   layout (sizes come from geometry.js), so an update costs what actually changed on screen. Code that has to measure
   the new DOM (a card flying to where it now sits) runs in after(): once every part has written. */
const parts = [], afterQ = [];
let raf = 0;
/* p: { update(), reset?() } — reset: a different game is on show (drop its elements) */
export function addPart(p) { parts.push(p); }
// a part that fails is a bug: logged and reported (boundary.js), and the other parts still update
const safe = (f, what) => { try { f(); } catch (e) { console.error(what, e); failed(e, 'view ' + what); } };
export function render() { if (!raf) raf = requestAnimationFrame(flush); }
// a frame is due: the state has moved on and the page doesn't show it yet (checks judge the page only when it is up to date)
export const frameDue = () => !!raf;
import { diag, DEBUG, CHECKS, frameMark } from './debug.js';
import { assert } from '../engine.gen.js';
import { failed } from './boundary.js';
export function flush() {
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  const t0 = DEBUG ? performance.now() : 0;
  safe(frameMark, 'checks'); // (checks: what changed before this frame is judged apart from it)
  for (const p of parts) safe(() => p.update(), p.name);
  for (const f of afterQ.splice(0)) safe(f, 'after');
  safe(frameMark, 'checks');
  if (DEBUG) { const ms = performance.now() - t0; if (ms > 8) diag(`update ${ms.toFixed(0)} ms`); }
}
export function after(f) { afterQ.push(f); render(); }
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
  const check = () => {
    if (raf || !during()) return;
    safe(frameMark, 'checks'); // (what came before this frame is judged as before)
    mo.observe(app, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true });
    flush();
    // (a real change only: an attribute or text written again with the same value isn't stale content)
    const stale = mo.takeRecords().filter(r => { const n = r.target.nodeType === 1 ? r.target : r.target.parentElement; if (!n || n.closest('#turnTimer')) return false;
      return r.type === 'childList' ? true : r.type === 'attributes' ? r.target.getAttribute(r.attributeName) !== r.oldValue : r.target.data !== r.oldValue; });
    mo.disconnect();
    if (stale.length) assert(false, 'view: the page is up to date (a frame with nothing new still changed ' + who(stale[0]) + ')');
  };
  setInterval(check, 250);
  // and right after every input (once its handlers have run): a handler that changed something without asking for a frame
  // is caught at once, not only when a sample happens to fall in the moment before the next frame
  let soon = 0; const afterInput = () => { if (!soon) soon = setTimeout(() => { soon = 0; check(); }, 0); };
  for (const t of ['pointerdown', 'pointerup', 'pointerover', 'pointerout', 'click', 'keydown']) addEventListener(t, afterInput, true);
}

