/* The page's own state: what the player has selected (UI), the online connection (NET), and the game record / replay
   (G). The game itself is the engine's S and MAP. Selectors answer "who am I, whose turn, may I act". */
import { S, isActive, recState, replayCheck, recFinal } from '../engine.gen.js';
export const UI = { mode: 'idle', card: null, piece: 0, picks: [], targets: new Map(), cover: false, hover: null, mktOpen: true, allOpen: false,
  buy: null, pending: null, max: 0, viewer: null, preview: false, anim: false, lastReplay: null };
/* NET.S: the online game the server last sent (the game on show is online while it is that one); NET.seat: my seat in it;
   NET.clockEnd: when the turn clock runs out (local time) */
export const NET = { available: false, cfg: null, user: null, token: null, ws: null, lobbyWs: null, room: null, S: null, seat: -1, connected: false, clockEnd: null,
  canUndo: false, busy: false, heard: 0, status: '', rooms: [], active: null, code: null, pendingRoom: null, viewUser: null };
/* rec: the local game's record (engine recNewGame; saved with the game, kept as a replay once it's over).
   replay: set while watching a replay (replay.js): nothing can be played then */
export const G = { rec: null, replay: null };
export const cur = () => S.players[S.cur];
export const myId = () => NET.user ? NET.user.id : null;
export const online = () => !!S && S === NET.S;
export const isAI = i => !!(S && S.players[i] && S.players[i].ai);
export const canAct = () => !G.replay && (!S || (online() ? S.cur === NET.seat && NET.connected && !S.over : !isAI(S.cur)));
// local games with AI seats: while an AI moves, the table shows the hand of the human who played last
export const viewIdx = () => {
  if (!online()) { if (!isAI(S.cur) || G.replay) return S.cur; const h = isAI(UI.viewer) || UI.viewer == null || UI.viewer >= S.players.length ? S.players.findIndex(p => !p.ai) : UI.viewer; return h < 0 ? S.cur : h; }
  return NET.seat < 0 ? S.cur : NET.seat; // (a watcher follows the player to move)
};
export const hp = () => S.players[viewIdx()];
export const humanRacing = () => S.players.some(p => !p.ai && isActive(p));
export const inGame = () => !!(S && !S.over && !G.replay && !UI.preview);

/* the local save is the game's record (the state is rebuilt from it): {rec, S, MAP} or null.
   (-v1 keys: games recorded under older rules, which can't be replayed; dropped) */
const SAVE_KEY = 'eldorado-game-v2';
try { localStorage.removeItem('eldorado-game-v1'); localStorage.removeItem('eldorado-games-v1'); } catch (e) { }
export function loadSave() { try { const rec = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (!rec || replayCheck(rec)) return null; return { rec, ...recState(rec) }; } catch (e) { return null; } }
export function save() {
  if (online() || G.replay || UI.preview) return; // (a game not started yet is never saved)
  try { if (G.rec) localStorage.setItem(SAVE_KEY, JSON.stringify(G.rec)); else localStorage.removeItem(SAVE_KEY); } catch (e) { }
}
/* finished local games are kept on this device (newest first, up to 20) to watch again from Replays */
const MYGAMES = 'eldorado-games-v2';
export function myGames() { try { return JSON.parse(localStorage.getItem(MYGAMES) || '[]'); } catch (e) { return []; } }
export function keepLocalReplay() {
  const L = recFinal(G.rec); G.rec = null; L.created = Date.now(); L.lid = L.created.toString(36);
  const list = [L, ...myGames()].slice(0, 20);
  for (; ;) { try { localStorage.setItem(MYGAMES, JSON.stringify(list)); break; } catch (e) { if (list.length <= 1) break; list.pop(); } } // storage full: drop the oldest
  return L;
}
