/* Sizes and positions the views need, measured only when something resized (ResizeObserver callbacks run after layout,
   so reading there is free). Views read these instead of measuring the DOM while they update. */
import { $ } from './dom.js';
import { diag, expectLayout } from './debug.js';
import { render } from './frame.js';
export const geo = { app: { left: 0, top: 0, width: 0, height: 0 }, cw: 132, promptBottom: 0, recapFits: true, mktW: 0, actW: 0, act: null, deck: null, disc: null };
const subs = [];
/* f(sized): after every measurement; sized = the game area itself changed size */
export function onGeo(f) { subs.push(f); }
/* where the resting hand's top edge is (its middle card; the others sit lower): the hand lays its cards from it and the
   board's fit keeps above it. One place, so the two can't drift apart */
export const handTop = () => geo.app.height - geo.cw * 1.4 * (geo.app.width < 600 ? .78 : .9);
const rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
/* measures everything the views need; whoever calls it (the resize observer, the camera fitting the board), a change that
   matters (the game area's size, the recap's room) asks for a redraw here, so no caller can measure it away unseen */
export function measure() {
  const app = $('#app'), a = rect(app), fits = geo.recapFits;
  const sized = a.width !== geo.app.width || a.height !== geo.app.height;
  geo.app = a;
  geo.cw = parseFloat(getComputedStyle(app).getPropertyValue('--cw')) || 132; // set per game-area size (container queries)
  const pr = $('#prompt'); geo.promptBottom = pr.offsetHeight ? pr.getBoundingClientRect().bottom - a.top : 0;
  // the recap (six cards wide, --six) shows only where the prompt holds it: not beside an open market on a small phone
  const ps = getComputedStyle(pr); geo.recapFits = pr.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight) >= parseFloat(ps.getPropertyValue('--six')) - .5;
  geo.mktW = $('#mkt').offsetWidth; geo.actW = $('#actBtns').offsetWidth;
  { const r = rect($('#actBtns')); geo.act = r.width ? { left: r.left - a.left, right: r.right - a.left, bottom: r.bottom - a.top } : null; } // (the turn buttons, in the game area: what a chosen card may not rise into)
  geo.deck = rect($('#deckStack')); geo.disc = rect($('#discStack'));
  if (sized) expectLayout(); // (the game area changed size: what's in it moves, on purpose)
  if (sized || geo.recapFits !== fits) render(); // (a new size, or the recap's room came or went: the views lay themselves out again)
  return sized;
}
export function watchGeometry() {
  measure(); for (const f of subs) f(true);
  const ro = new ResizeObserver(() => { const sized = measure(); diag(`layout: game area ${Math.round(geo.app.width)}×${Math.round(geo.app.height)}${sized ? ' (resized)' : ''}, prompt ${Math.round(geo.promptBottom)}, market ${Math.round(geo.mktW)}, buttons ${Math.round(geo.actW)}`); for (const f of subs) f(sized); });
  for (const s of ['#app', '#prompt', '#mkt', '#actBtns']) ro.observe($(s));
}
