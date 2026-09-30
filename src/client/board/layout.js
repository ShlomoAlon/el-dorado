/* Where the board is drawn, in board units: the engine's map has the topology only (spaces, neighbours, boards,
   connections), so the page works out each space's centre from its hex coordinates, the city beside El Dorado, and the
   board's bounds. Computed once per map (a new deal or a replay's course). */
import { R, pxOf } from '../../engine.gen.js';
import { MAP } from '../state.js';

const cache = new WeakMap();
/* the layout of the map on show: { pos: Map key → {x, y}, city: {x, y, dx, dy}, minX, minY, w, h } */
export function layout() {
  let L = cache.get(MAP); if (L) return L;
  const pos = new Map(); for (const h of MAP.hexes.values()) { const [x, y] = pxOf(h.q, h.r); pos.set(h.k, { x, y }); }
  // the city: beyond El Dorado's three spaces, away from the last board's centre
  const mean = ks => ks.reduce((a, k) => { const p = pos.get(k); return [a[0] + p.x / ks.length, a[1] + p.y / ks.length]; }, [0, 0]);
  const last = MAP.tiles.length - 2; // (the last board: the final tile is El Dorado itself)
  const gc = mean(MAP.goals), lc = mean([...MAP.hexes.values()].filter(h => h.tile === last).map(h => h.k));
  let dx = gc[0] - lc[0], dy = gc[1] - lc[1]; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  const city = { x: gc[0] + dx * R * 2.5, y: gc[1] + dy * R * 2.5, dx, dy };
  let minX = city.x - R * 2.6, maxX = city.x + R * 2.6, minY = city.y - R * 2.6, maxY = city.y + R * 2.6;
  for (const { x, y } of pos.values()) { minX = Math.min(minX, x - R); maxX = Math.max(maxX, x + R); minY = Math.min(minY, y - R); maxY = Math.max(maxY, y + R); }
  const pad = R * .6; minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  L = { pos, city, minX, minY, w: maxX - minX, h: maxY - minY };
  cache.set(MAP, L); return L;
}
/* a space's centre */
export const xy = k => layout().pos.get(k);
