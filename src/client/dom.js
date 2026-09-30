/* DOM helpers shared by every view module. The set* helpers skip writes that change nothing: writing the same value
   again still costs the browser a style recalculation. */
export const $ = s => document.querySelector(s);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SVGNS = 'http://www.w3.org/2000/svg';
export function sv(tag, attrs, parent) { const e = document.createElementNS(SVGNS, tag); if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
export function el(tag, cls, parent) { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
export const setText = (e, t) => { t = String(t); if (e.__tx !== t) { e.__tx = t; e.textContent = t; } };
export const setHTML = (e, h) => { if (e.__h !== h) { e.__h = h; e.innerHTML = h; } };
export const setStyle = (e, p, v) => { v = String(v); const k = '__s' + p; if (e[k] !== v) { e[k] = v; if (p.startsWith('--')) e.style.setProperty(p, v); else e.style[p] = v; } };
export const show = (e, on) => { if (e.hidden === on) e.hidden = !on; };
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const EASE = 'cubic-bezier(.2,.8,.2,1)';
