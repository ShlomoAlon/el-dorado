/* The page's own browser storage: every key it keeps is listed here, and nowhere else touches localStorage. The one
   failure expected here is storage being unavailable (a private window, blocked site data, a full quota): reads give
   null and writes report false, so the page works without it. A key the page finds that isn't in this list belongs to
   an older version: removed when this module loads, so nothing piles up as the keys change. */
import { assert } from '../engine.gen.js';
const KEYS = {
  save: 'eldorado-game-v2',     // the local game in play: its record (state.js)
  games: 'eldorado-games-v2',   // finished local games, kept to watch again (state.js)
  token: 'ed-token',            // the sign-in session (online.js)
  seats: 'eldorado-seats',      // the setup screen's AI choices (menu.js)
  setup: 'eldorado-setup',      // the whole setup, so Play is the game set up last time (menu.js)
  buywarn: 'eldorado-buywarn',  // setting: "you can still afford" reminder (menu.js)
  market: 'eldorado-mkt',       // market shown or hidden (market.js)
  sound: 'eldorado-sound',      // sound on or off (sound.js)
  history: 'eldorado-hist',     // history panel mode (feed.js)
  rspeed: 'eldorado-rspeed2',   // replay speed (replay.js)
  rside: 'eldorado-rside',      // replay side panel (replay.js)
};
export function load(k) {
  try { return localStorage.getItem(KEYS[k]); }
  catch (e) { /* expected: storage unavailable */ return null; }
}
/* v: a string, or null to remove the key; false when storage is unavailable or full */
export function store(k, v) {
  try { if (v === null) localStorage.removeItem(KEYS[k]); else localStorage.setItem(KEYS[k], v); }
  catch (e) { /* expected: storage unavailable or full */ return false; }
  // (after each write: a handful of keys; an older version's key still here means nothing removes them as keys change)
  const stale = Object.keys(localStorage).filter(x => OURS.test(x) && !MINE.has(x));
  assert(!stale.length, 'storage: the page keeps only the keys it lists (' + stale.join(', ') + ')');
  return true;
}
const MINE = new Set(Object.values(KEYS)), OURS = /^(eldorado|ed)-/;
// (when this module loads, before anything reads or writes: no caller has to remember it)
try { for (const k of Object.keys(localStorage)) if (OURS.test(k) && !MINE.has(k)) localStorage.removeItem(k); }
catch (e) { /* expected: storage unavailable */ }
