/* checks: what the pointer is over is the item whose resting place is under it (owner, 2026-10-03: a card grown or lifted
   under the pointer never takes its neighbour's place; the card underneath has priority). One check for every place whose
   items grow or move when hovered (the market, the All cards spread, the hand): each says where its items rest and which
   one is highlighted. Judged once the frame is drawn (afterDrawn: layout already done, so measuring is free) */
import { assert } from '../engine.gen.js';
import { afterDrawn } from './frame.js';
/* where: a name; box: the element that holds them (only a point where the page's topmost element is inside it is judged:
   under a menu or another panel the pointer isn't over these items at all); items(): the elements; rest(el): its resting box in page coordinates {l, t, w, h, z, rot?: degrees about its centre} (the topmost resting
   box under the pointer wins where they overlap, as in a fanned hand); hovered(): the highlighted element or null */
export function hoverCheck(where, box, x, y, items, rest, hovered) {
  afterDrawn(() => {
    const t = document.elementFromPoint(x, y); if (!t || !box.contains(t)) return;
    let under = null, uz = -Infinity;
    for (const e of items()) { const r = rest(e); if (!r || r.z < uz) continue;
      // (a box turned by rot degrees about its centre: the pointer turned back into the box's own frame)
      const cx = r.l + r.w / 2, cy = r.t + r.h / 2, a = -(r.rot || 0) * Math.PI / 180, dx = x - cx, dy = y - cy;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      // (within a pixel of an edge the browser's hit test and this sum may round apart, on a turned or scaled card: such a
      // point is not judged; the bug this guards is a card taking tens of pixels of its neighbour's place)
      const ex = r.w / 2 - Math.abs(lx), ey = r.h / 2 - Math.abs(ly); if (Math.abs(ex) < 1 && ey > -1 || Math.abs(ey) < 1 && ex > -1) return;
      if (ex > 0 && ey > 0) { under = e; uz = r.z; } }
    const h = hovered() || null, name = e => e ? (e.dataset.k || e.dataset.id || e.className.split(' ')[0]) : 'none';
    assert(h === under, `view: the card under the pointer is the one whose resting place is there (a grown card never takes its neighbour's place: ${where}, ${name(h)} over ${name(under)}; at ${Math.round(x)},${Math.round(y)} the page has ${t ? (t.id ? '#' + t.id : t.tagName.toLowerCase() + '.' + (t.getAttribute('class') || '').split(' ')[0]) : 'nothing'})`);
  });
}
/* a slot laid out by CSS (the market, the All cards spread): it rests where the page lays it out (offset box: its own
   transform, a hover's, doesn't count) */
export const slotRest = e => { const p = e.offsetParent; if (!p) return null; const o = p.getBoundingClientRect(); return { l: o.left + e.offsetLeft, t: o.top + e.offsetTop, w: e.offsetWidth, h: e.offsetHeight, z: 0 }; };
