/* DOM helpers shared by every view module. The set* helpers skip writes that change nothing: writing the same value
   again still costs the browser a style recalculation. */
import { movedTo } from './debug.js';
export const $ = s => document.querySelector(s);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SVGNS = 'http://www.w3.org/2000/svg';
export function sv(tag, attrs, parent) { const e = document.createElementNS(SVGNS, tag); if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
/* an overlay is up over the game (the menu, or a window), not on its way out: what the one dimming layer follows */
export const overlayUp = () => { const m = document.getElementById('menu'), sc = document.querySelector('#overlay .scrim'); return (m.open && !m.classList.contains('closing')) || (!!sc && !sc.classList.contains('closing')); };
export const setText = (e, t) => { t = String(t); if (e.__tx !== t) { e.__tx = t; e.textContent = t; } };
export const setHTML = (e, h) => { if (e.__h !== h) { e.__h = h; e.innerHTML = h; } };
export const setStyle = (e, p, v) => { v = String(v); const k = '__s' + p; if (e[k] !== v) { if (p === 'transform') movedTo(e, e[k], v); e[k] = v; if (p.startsWith('--')) e.style.setProperty(p, v); else e.style[p] = v; } };
export const show = (e, on) => { if (e.hidden === on) e.hidden = !on; };
/* the address bar's parameters (?room=, ?replay=): set (a value) or remove (null) only those given, keeping the rest (?debug) */
export function setQuery(set) {
  try { const u = new URL(location.href); for (const k in set) { if (set[k] == null) u.searchParams.delete(k); else u.searchParams.set(k, set[k]); } history.replaceState(null, '', u); }
  catch (e) { /* expected: a page with no address of its own (the claude.ai artifact build) */ }
}
/* the page's icon symbols (shell.html's sprite), as markup for an SVG drawn as an image: an image can't see the page's
   definitions, so it carries its own copy (the cards' art, the board's terrain) */
let SPRITES = null;
export const spriteDefs = () => SPRITES ??= new XMLSerializer().serializeToString(document.querySelector('body > svg defs'));
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const EASE = 'cubic-bezier(.2,.8,.2,1)';
