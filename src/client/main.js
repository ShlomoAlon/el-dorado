/* BOOT: wires the modules together, sets the order the view parts update in, and decides what opens first (a replay
   or room link, a game in progress, the Online screen, or the start screen). */
import { buildCourse, courseById, assert, buyOptions, coinVal, CT } from '../engine.gen.js';
import { $ } from './dom.js';
import { S, MAP, setMAP, UI, NET, G, canAct, online } from './state.js';
import { load } from './store.js';
import { addPart, render, flush, freshInit } from './frame.js';
import { watchGeometry, geo } from './geometry.js';
import { GAME_READY } from './ready.js';
import { buildBoard, relabel, boardLayers } from './board/terrain.js';
import { setupPanZoom, fit, fitCheck, cameraPart } from './board/camera.js';
import { overlaysPart } from './board/overlays.js';
import { piecesPart, walking } from './board/pieces.js';
import { layout } from './board/layout.js';
import { handPart } from './hand.js';
import { aimPart, aimInit } from './aim.js';
import { marketPart, buySlotPart, marketInit, openAll, allShown } from './market.js';
import { hudPart, hudInit } from './hud.js';
import { feedPart, histInit } from './feed.js';
import { showRules, showPile, closeModal, modalOpen, coverPart } from './dialogs.js';
import { AIX, aiThink } from './ai.js';
import { act, targets, playEvents, onHandCard, doMove, pickFromMarket, confirmBuy, startEndTurn, finishTurn, cancelMode, undo, resumeSaved, onPiece, onPlayCard, startDiscard, addDiscard, confirmTrash } from './actions.js';
import { MENU, menuInit, showMenu, showSetup, showHub, setupSync, prepareGame, startLocal, radio } from './menu.js';
import { netInit, joinRoom, netSend } from './online.js';
import { replayPart, replayKeys, openReplay, loadReplayId, exitReplay } from './replay.js';
import { soundInit } from './sound.js';
import { debugInit, checksInit, shifts, churn, diag, diagLog } from './debug.js';
import { boundaryInit } from './boundary.js';
import { cam } from './board/camera.js';
import { targetAt, spaceAt, setHot } from './board/overlays.js';
import { drag } from './hand.js';
import { checksPart } from './checks.js';

// the order parts update in each frame: first what the selection allows, then the view from back to front
for (const p of [coverPart, overlaysPart, piecesPart, cameraPart, hudPart, feedPart, marketPart, buySlotPart, handPart, aimPart, replayPart, checksPart]) addPart(p); // (checks: the page's invariants, last)
GAME_READY.then(() => { relabel(); document.documentElement.classList.add('gameready'); });

function boot() {
  boundaryInit(); debugInit(); { const inPlay = () => !!S && !UI.preview && !document.getElementById('menu').open; checksInit(inPlay); freshInit(inPlay); } /* (in play: a game on show, no menu over it) */ boardLayers(); soundInit(); aimInit(); marketInit(); hudInit(); setupPanZoom(); watchGeometry(); menuInit();
  if (!document.documentElement.classList.contains('resume')) { setupSync(); prepareGame(); } // the start screen's game, at once (not after the server check)
  $('#deckPile').onclick = () => showPile('deck'); $('#discPile').onclick = () => showPile('discard');
  $('#rulesBtn').onclick = showRules; histInit();
  $('#vp').addEventListener('click', onBoardClick); $('#vp').addEventListener('pointermove', onBoardHover); $('#vp').addEventListener('pointerleave', () => { if (!drag) setHot(null); });
  // full screen (hidden where the browser can't do it, e.g. iPhone Safari — there, Add to Home Screen gives a full-screen app)
  const fsEl = document.documentElement, fsOn = () => document.fullscreenElement || document.webkitFullscreenElement;
  if (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen) {
    const fb = $('#fsBtn'); fb.hidden = false;
    // (the browser may refuse: it throws, or rejects the promise, in older and newer versions)
    fb.onclick = () => { const refused = e => diag('full screen refused: ' + (e && e.message)); // (expected: some browsers and app views refuse)
      try { Promise.resolve(fsOn() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document) : (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl, { navigationUI: 'hide' })).catch(refused); } catch (e) { refused(e); } };
    const sync = () => { const on = !!fsOn(); fb.classList.toggle('full', on); fb.title = fb.ariaLabel = on ? 'Exit full screen' : 'Full screen'; };
    document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync);
  }
  // Menu: the start screen, without ending the game in progress (S,it offers Back to game and Resign)
  $('#menuBtn').onclick = () => { if (G.replay) exitReplay(); else showMenu(); };
  window.addEventListener('keydown', e => {
    if (replayKeys(e)) return; if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape' && allShown()) { openAll(false); return; }
    if (e.key === 'Escape') { const mo = modalOpen(); if (mo && S && !S.over) { closeModal(); return; } if (S && !mo && !MENU.dlg.open) cancelMode(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  });
  // the first screen is chosen as soon as what decides it is known (CLAUDE.md: local first): a room or replay link needs
  // the server, and so does a signed-in player (an online game of theirs may be running); anyone else's screen is decided
  // here, from this device, at once, and the server check only adds to it
  const q = new URLSearchParams(location.search), rid = (q.get('replay') || '').replace(/[^a-z0-9]/g, ''), room = (q.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const local = () => {
    if (resumeSaved()) return;
    showSetup(); if ($('#sGo').dataset.q) { delete $('#sGo').dataset.q; startLocal(); } // Start pressed before the script had loaded
  };
  const known = !rid && !room && !load('token') && radio('mode') !== 'online'; // (Online picked before the script had loaded: its screen needs the server)
  if (known) local();
  netInit().then(() => {
    if (known) return;
    if (rid) { loadReplayId(rid); return; }
    if (room && NET.available) { if (NET.user) { joinRoom(room); return; } NET.pendingRoom = room; showHub(); return; }
    if (NET.user && NET.active) { showHub(); return; }
    if (radio('mode') === 'online') { showHub(); return; }
    local();
  });
}

/* taps and hover find the space under the pointer from the board's geometry, as card drags do (never from which element
   is on top: a figure stands up into the space above its own). A target: move there; else your explorer there: select it;
   anywhere else puts the chosen card down (how a player stops moving with a card that has strength left) */
function onBoardClick(e) {
  if (!canAct() || cam.dragMoved || drag) return;
  const k = targetAt(e.clientX, e.clientY); if (k) { doMove(k); return; }
  const i = S.players[S.cur].pieces.indexOf(spaceAt(e.clientX, e.clientY));
  if (i >= 0) onPiece(S.cur, i); else if (UI.mode === 'card') cancelMode();
}
function onBoardHover(e) { if (!drag && !e.buttons && e.pointerType === 'mouse') setHot(targetAt(e.clientX, e.clientY)); }

// for tests and debugging: the game, the page's state and its main entry points (each call leaves the page updated, as
// a frame would after a click)
const now = f => (...a) => { const r = f(...a); flush(); return r; };
window.__ED = { NET, UI, G, targets, walking, diagLog, geo, get S() { return S }, get MAP() { return MAP }, layout, canAct, online, joinRoom, netSend, assert, shifts, churn, aiThink, buyOptions, coinVal, CT, // (aiThink: test/playstep.cjs lets an AI choose the person's moves, in the AI's worker, played through the calls below; the rest let it choose a purchase of its own)
  render() { render(); flush(); },
  aiPace(k) { AIX.pace = k; }, fitCheck, // (test/play.cjs: the board check, judged at once on a settled page) // (test/play.cjs: shorter pauses between the AIs' moves)
  showCourse(C, seed) { setMAP(buildCourse(typeof C === 'string' ? courseById(C) : C, seed || 1)); buildBoard(); fit(); return MAP; },
  ...Object.fromEntries(Object.entries({ act, playEvents, openReplay, onHandCard, doMove, pickFromMarket, confirmBuy, startEndTurn, finishTurn, cancelMode, onPiece, onPlayCard, startDiscard, addDiscard, confirmTrash }).map(([k, f]) => [k, now(f)])) };
boot();
