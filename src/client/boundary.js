/* The page's boundary for bugs (docs/ASSERTIONS.md). Whatever nobody handled ends here: an exception in an input handler,
   a timer or a network message (the browser reports it as an 'error' or 'unhandledrejection' event), a view part that
   failed (frame.js), a saved game that couldn't be rebuilt (state.js). The operation stopped where it threw; this logs
   the error (the diagnostics log: debug.js), sends the server a report once per message, and after a broken invariant
   (an AssertionError) outside the views shows the game again from its source: the local game's record, or, online, a
   fresh connection that brings the server's state. Debug mode (?debug): a failed assert stops in the debugger first,
   and nothing is sent. */
import { AssertionError, setAssertMode } from '../engine.gen.js';
import { DEBUG, diag, diagLog } from './debug.js';
import { UI, NET, G, online } from './state.js';
import { resync } from './actions.js';
import { HAS_SERVER } from './online.js';

const BUILD = document.currentScript.src.split('/').pop() || 'inline'; // app.<hash>.js on the site; the artifact is one page
const sent = new Set();
let recovering = false;

/* an error a boundary caught: logged, and reported once per message */
export function failed(e, where) {
  const msg = String(e && e.message || e);
  diag('ERROR ' + where + ': ' + msg);
  if (!DEBUG && HAS_SERVER && !sent.has(msg)) { sent.add(msg); report(e, msg, where); }
}
/* the report: the error, where the page was, and the game as its record (replaying it rebuilds the exact state) */
function report(e, msg, where) {
  try {
    const game = G.replay ? { replay: G.replay.id, at: G.replay.i, log: G.replay.id ? undefined : G.replay.log }
      : online() ? { room: NET.code, seat: NET.seat, S: NET.S } : { rec: G.rec };
    const body = JSON.stringify({ msg, stack: String(e && e.stack || ''), build: BUILD, context: {
      where, url: location.href, ua: navigator.userAgent, time: new Date().toISOString(), game,
      ui: { mode: UI.mode, card: UI.card, piece: UI.piece, picks: UI.picks, buy: UI.buy, pending: UI.pending, cover: UI.cover, preview: UI.preview },
      net: { available: NET.available, connected: NET.connected, busy: NET.busy, status: NET.status, code: NET.code, user: NET.user && NET.user.id },
      log: diagLog() } });
    const headers = { 'content-type': 'application/json' }; if (NET.token) headers.authorization = 'Bearer ' + NET.token;
    fetch('/api/bugs', { method: 'POST', headers, body, keepalive: body.length < 60000 }).catch(() => { /* expected: offline; a report must never become a second failure */ });
  } catch (_) { /* expected: a game that can't be serialized; a report must never become a second failure */ }
}
/* an exception nobody caught: after a broken invariant, the game on show comes back from its source */
function uncaught(e, where) {
  failed(e, where);
  if (!(e instanceof AssertionError) || recovering) return;
  recovering = true; try { resync(); } finally { recovering = false; }
}
export function boundaryInit() {
  setAssertMode({ debug: DEBUG });
  addEventListener('error', ev => uncaught(ev.error || ev.message, 'uncaught'));
  addEventListener('unhandledrejection', ev => uncaught(ev.reason, 'promise'));
}
