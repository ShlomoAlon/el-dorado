/* The page's own browser storage: every key it keeps is listed here, and nowhere else touches localStorage. The one
   failure expected here is storage being unavailable (a private window, blocked site data, a full quota): reads give
   null and writes report false, so the page works without it. A key the page finds that isn't in this list belongs to
   an older version: removed at boot (storageInit), so nothing piles up as the keys change. */
export const KEYS = {
  save: 'eldorado-game-v2',     // the local game in play: its record (state.js)
  games: 'eldorado-games-v2',   // finished local games, kept to watch again (state.js)
  token: 'ed-token',            // the sign-in session (online.js)
  seats: 'eldorado-seats',      // the setup screen's AI choices (menu.js)
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
  try { if (v === null) localStorage.removeItem(KEYS[k]); else localStorage.setItem(KEYS[k], v); return true; }
  catch (e) { /* expected: storage unavailable or full */ return false; }
}
export function storageInit() {
  const mine = new Set(Object.values(KEYS));
  try { for (const k of Object.keys(localStorage)) if (/^(eldorado|ed)-/.test(k) && !mine.has(k)) localStorage.removeItem(k); }
  catch (e) { /* expected: storage unavailable */ }
}
