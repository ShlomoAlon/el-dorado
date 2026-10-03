/* The game appears once its fonts have loaded (they come with its CSS; the menu uses the device's fonts), so no text in it
   ever changes font, and once every card type's art is drawn (cards.js), so no card shows without it; at most 4 s (a font
   that can't load then falls back). */
import { artLoad } from './cards.js';
export const GAME_READY = Promise.race([Promise.allSettled([...(document.fonts ? ["400 1em Figtree", "800 1em Figtree", "1em 'Young Serif'"].map(f => document.fonts.load(f)) : []), artLoad()]), new Promise(r => setTimeout(r, 4000))])
  .then(() => { GAME_READY.done = true; });
