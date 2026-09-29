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
import { diag, DEBUG } from './debug.js';
import { failed } from './boundary.js';
export function flush() {
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  const t0 = DEBUG ? performance.now() : 0;
  for (const p of parts) safe(() => p.update(), p.name);
  for (const f of afterQ.splice(0)) safe(f, 'after');
  if (DEBUG) { const ms = performance.now() - t0; if (ms > 8) diag(`update ${ms.toFixed(0)} ms`); }
}
export function after(f) { afterQ.push(f); render(); }
export function resetView() { for (const p of parts) if (p.reset) safe(() => p.reset(), p.name + ' reset'); render(); }
