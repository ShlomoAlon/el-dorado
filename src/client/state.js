/* The page's own state: the game on show (S, and its board MAP), what the player has selected (UI), the online connection
   (NET), and the game record / replay (G). Selectors answer "who am I, whose turn, may I act". */
import { isActive, recState, replayCheck, recFinal, mapOf } from '../engine.gen.js';
import { failed } from './boundary.js';
import { load, store } from './store.js';
/* the game on show (the engine's functions take it as their first argument) and its board */
export let S = null, MAP = null;
export function setS(gs) { S = gs; if (gs) MAP = mapOf(gs); }
/* a board with no game on it (the course previews, main.js showCourse) */
export function setMAP(m) { MAP = m; }
export const UI = { mode: 'idle', card: null, piece: 0, picks: [], targets: new Map(), cover: false, hover: null, mktOpen: true, allFor: null,
  buy: null, pending: null, max: 0, viewer: null, preview: false, anim: false, lastReplay: null };
/* nothing selected: no card, no picks, no purchase or payment under way */
export function clearSelection() { UI.mode = 'idle'; UI.card = null; UI.picks = []; UI.buy = null; UI.pending = null; }
/* NET.S: the online game the server last sent (the game on show is online while it is that one); NET.seat: my seat in it;
   NET.clockEnd: when the turn clock runs out (local time) */
export const NET = { available: false, cfg: null, user: null, token: null, ws: null, lobbyWs: null, room: null, S: null, seat: -1, connected: false, clockEnd: null,
  canUndo: false, busy: false, heard: 0, status: '', rooms: [], active: null, code: null, pendingRoom: null, viewUser: null, leaving: false }; // leaving: resigned, going to the Online screen once the server has it
/* rec: the local game's record (engine recNewGame; saved with the game, kept as a replay once it's over).
   replay: set while watching a replay (replay.js): nothing can be played then */
export const G = { rec: null, replay: null };
export const cur = () => S.players[S.cur];
export const myId = () => NET.user ? NET.user.id : null;
export const online = () => !!S && S === NET.S;
export const isAI = i => !!S.players[i].ai;
export const canAct = () => !G.replay && (!S || (online() ? S.cur === NET.seat && NET.connected && !S.over : !isAI(S.cur)));
// local games with AI seats: while an AI moves, the table shows the hand of the human who played last
export const viewIdx = () => {
  if (!online()) { if (!isAI(S.cur) || G.replay) return S.cur; const v = UI.viewer, h = v != null && v < S.players.length && !isAI(v) ? v : S.players.findIndex(p => !p.ai); return h < 0 ? S.cur : h; }
  return NET.seat < 0 ? S.cur : NET.seat; // (a watcher follows the player to move)
};
export const hp = () => S.players[viewIdx()];
export const humanRacing = () => S.players.some(p => !p.ai && isActive(p));
export const inGame = () => !!(S && !S.over && !G.replay && !UI.preview);

/* the local save is the game's record (the state is rebuilt from it) */
/* the saved game rebuilt from its record, {rec, S}, or null. Storage can fail, or hold a game that this version can't
   rebuild: a bug, reported, and the page goes on without it */
export function loadSave() {
  let rec; try { rec = JSON.parse(load('save') || 'null'); } catch (e) { /* expected: a save cut short (storage full while writing) */ return null; }
  if (!rec || replayCheck(rec)) return null; // (a game recorded by an older version: dropped, as decided 2026-09-29)
  try { return { rec, S: recState(rec) }; } catch (e) { console.error(e); failed(e, 'rebuilding the saved game'); return null; }
}
export function save() {
  if (online() || G.replay || UI.preview) return; // (a game not started yet is never saved)
  store('save', G.rec ? JSON.stringify(G.rec) : null);
}
/* finished local games are kept on this device (newest first, up to 20) to watch again from Replays */
export function myGames() { try { return JSON.parse(load('games') || '[]'); } catch (e) { /* expected: a list cut short (storage full while writing) */ return []; } }
export function keepLocalReplay() {
  const L = recFinal(G.rec, S); G.rec = null; L.created = Date.now();
  const list = [L, ...myGames()].slice(0, 20);
  while (!store('games', JSON.stringify(list)) && list.length > 1) list.pop(); // storage full: drop the oldest
  return L;
}
