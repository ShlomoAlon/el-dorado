/* Sizes and positions the views need, measured only when something resized (ResizeObserver callbacks run after layout,
   so reading there is free). Views read these instead of measuring the DOM while they update. */
import { $ } from './dom.js';
import { diag, expectLayout } from './debug.js';
import { render } from './frame.js';
export const geo = { app: { left: 0, top: 0, width: 0, height: 0 }, cw: 132, promptBottom: 0, recapFits: true, mktW: 0, actW: 0, deck: null, disc: null };
const subs = [];
/* f(sized): after every measurement; sized = the game area itself changed size */
export function onGeo(f) { subs.push(f); }
const rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
export function measure() {
  const app = $('#app'), a = rect(app);
  const sized = a.width !== geo.app.width || a.height !== geo.app.height;
  geo.app = a;
  geo.cw = parseFloat(getComputedStyle(app).getPropertyValue('--cw')) || 132; // set per game-area size (container queries)
  const pr = $('#prompt'); geo.promptBottom = pr.offsetHeight ? pr.getBoundingClientRect().bottom - a.top : 0;
  // the recap (six cards wide, --six) shows only where the prompt holds it: not beside an open market on a small phone
  const ps = getComputedStyle(pr); geo.recapFits = pr.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight) >= parseFloat(ps.getPropertyValue('--six')) - .5;
  geo.mktW = $('#mkt').offsetWidth; geo.actW = $('#actBtns').offsetWidth;
  geo.deck = rect($('#deckStack')); geo.disc = rect($('#discStack'));
  return sized;
}
export function watchGeometry() {
  measure(); for (const f of subs) f(true);
  const ro = new ResizeObserver(() => { const fits = geo.recapFits, sized = measure(); if (sized) expectLayout(); /* (the game area changed size: what's in it moves, on purpose) */ diag(`layout: game area ${Math.round(geo.app.width)}×${Math.round(geo.app.height)}${sized ? ' (resized)' : ''}, prompt ${Math.round(geo.promptBottom)}, market ${Math.round(geo.mktW)}, buttons ${Math.round(geo.actW)}`); for (const f of subs) f(sized); if (sized || geo.recapFits !== fits) render(); }); // (a new size, or the recap's room came or went: the views lay themselves out again)
  for (const s of ['#app', '#prompt', '#mkt', '#actBtns']) ro.observe($(s));
}
