/* Sharp at rest (owner, 2026-10-05: "Sharpness problems have a zero tolerance. The only tolerance that we have for sharpness
   is while something is in motion"). Chrome draws text with the screen's sharpest smoothing (sub-pixel: ClearType on
   Windows) only in a layer that is solid and not faded, filtered or kept for motion. The board is always GPU layers of its
   own (the terrain's canvases, the explorers), so whatever is drawn over it goes into layers of Chrome's choosing, and
   see-through glass there drew every menu and HUD text grey-smoothed: fuzzy on a 1080p screen. Under a layer kept for motion
   (will-change) text is never drawn sub-pixel either. The rules:
   - text over the game sits on a surface that is a layer of its own (a 3D transform: translateZ(0)), solid (its background
     and border), casting no shadow (a shadow makes the layer partly see-through; the menus' frame draws theirs behind);
   - nothing above a text is faded, filtered or kept for motion (will-change).
   A card is a picture (its art, rounded, shadowed, tilted in the fan): its text, and what is written on it ("1 left"), is
   drawn at full resolution but grey-smoothed, as on a phone. Checked once the page rests (nothing animating, no input for a moment): in tests every second, in a player's
   browser once a minute (a failure is logged and reported: boundary.js). The pixels themselves: test/sharp.cjs */
import { assert } from '../engine.gen.js';
import { CHECKS } from './debug.js';
import { frameDue, afterDrawn, changeGen } from './frame.js';
import { failed } from './boundary.js';

const ROOTS = ['#app', '#menu', '#overlay', '#banner', '#toast']; // (over the game, the board's own picture (#stage) aside; the side cells and the replay dock sit beside it)
const alpha = c => c === 'transparent' ? 0 : c.startsWith('rgba') ? +c.match(/[\d.]+/g)[3] : c.startsWith('color(') && c.includes('/') ? +c.split('/')[1].replace(')', '') : 1;
// (a layer of its own: a 3D transform, which the page gives exactly the surfaces that hold text over the game)
const ownLayer = e => { const t = e.computedStyleMap().get('transform'); return !!t && t.is2D === false; };
// (a shadow outside the box: the layer then reaches past its solid background. One inside it (inset) stays within)
const outerShadow = v => v !== 'none' && v.split(/,(?![^(]*\))/).some(x => !/\binset\b/.test(x));
const who = e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '')) + (!e.id && e.closest('[id]') ? ' in #' + e.closest('[id]').id : '');
function* checks() {
  const st = new Map(), cs = e => { let s = st.get(e); if (!s) st.set(e, s = getComputedStyle(e)); return s; }, seen = new Set();
  for (const sel of ROOTS) {
    const root = document.querySelector(sel); if (!root) continue;
    const wk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: n => n.nodeType === 1 && (n.id === 'stage' || n.hidden) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    for (let n = wk.nextNode(); n; n = wk.nextNode()) {
      if (n.nodeType !== 3 || !n.data.trim()) continue; const p = n.parentElement;
      if (seen.has(p) || p.closest('.card, .mcard') || !p.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue; seen.add(p);
      let layer = null;
      for (let e = p; e && e !== document.documentElement; e = e.parentElement) { const s = cs(e);
        assert(+s.opacity === 1 && s.filter === 'none' && s.backdropFilter === 'none' && s.mixBlendMode === 'normal' && !/transform|opacity/.test(s.willChange), `view: text at rest is never faded, filtered or in a layer kept for motion ("${n.data.trim().slice(0, 20)}" under ${who(e)}: opacity ${s.opacity}, filter ${s.filter}, backdrop ${s.backdropFilter}, will-change ${s.willChange})`);
        if (!layer && ownLayer(e)) layer = e; }
      assert(layer, `view: text over the game sits on a surface that is a layer of its own ("${n.data.trim().slice(0, 20)}" in ${who(p)})`);
      const s = cs(layer), edges = ['Top', 'Right', 'Bottom', 'Left'].every(k => parseFloat(s['border' + k + 'Width']) === 0 || alpha(s['border' + k + 'Color']) === 1);
      assert(alpha(s.backgroundColor) === 1 && edges && !outerShadow(s.boxShadow), `view: a surface holding text is solid and casts no shadow (${who(layer)}: background ${s.backgroundColor}, border ${s.borderTopColor}, shadow ${s.boxShadow})`);
      yield;
    }
  }
}
/* a pass runs a few milliseconds at a time, each slice a task of its own (all at once it took 17-41 ms of a slowed phone's
   main thread: a long task, frames: test/framebudget.cjs), and is dropped when the page moves on before it ends (an input,
   any change of the page's, an AI's move too: what it judged may be moving now); the next rest judges it again. A failure is logged and reported, as a
   view part's is (frame.js) */
let run = null;
const next = (() => { const c = new MessageChannel(); c.port1.onmessage = () => step(); return () => c.port2.postMessage(0); })();
function step() {
  const r = run; if (!r) return;
  if (inputAt > r.at || changeGen() !== r.gen || frameDue() || moving()) { run = null; return; } // (something began to move: a timer's animation too)
  const t = performance.now();
  try { while (performance.now() - t < 3) if (r.it.next().done) { run = null; return; } }
  catch (e) { run = null; console.error('check', e); failed(e, 'check'); return; }
  next();
}
let inputAt = -1e9, lastAt = -1e9;
const moving = () => document.getAnimations().some(a => a.playState === 'running' && a.effect && a.effect.getComputedTiming().endTime !== Infinity);
export function sharpInit() {
  if (!Element.prototype.computedStyleMap) return; // (Firefox has no typed styles: it can't tell a layer of its own; Chrome, the owner's, and the tests' can)
  for (const t of ['pointerdown', 'pointermove', 'keydown', 'wheel']) addEventListener(t, () => { inputAt = performance.now(); }, { capture: true, passive: true });
  setInterval(() => {
    const t = performance.now(); if (t - inputAt < 600 || t - lastAt < (CHECKS ? 1000 : 60000) || frameDue() || document.hidden) return;
    if (moving()) return;
    // (begun once a frame is drawn: judged from the change it rested at, and dropped if a change came in that frame)
    const g = changeGen(); lastAt = t; if (!run) afterDrawn(() => { if (changeGen() !== g || moving()) return; run = { it: checks(), at: t, gen: g }; step(); });
  }, 1000);
}
