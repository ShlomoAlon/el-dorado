/* BOOT: wires the modules together, sets the order the view parts update in, and decides what opens first (a replay
   or room link, a game in progress, the Online screen, or the start screen). */
import { S, MAP, buildCourse, courseById, setMAP, assert } from '../engine.gen.js';
import { $ } from './dom.js';
import { UI, NET, G, canAct, online } from './state.js';
import { addPart, render, flush } from './frame.js';
import { watchGeometry } from './geometry.js';
import { GAME_READY } from './ready.js';
import { buildBoard, relabel } from './board/terrain.js';
import { setupPanZoom, fit } from './board/camera.js';
import { overlaysPart } from './board/overlays.js';
import { piecesPart } from './board/pieces.js';
import { handPart } from './hand.js';
import { aimPart, aimInit } from './aim.js';
import { marketPart, buySlotPart, marketInit, openAll } from './market.js';
import { hudPart, hudInit } from './hud.js';
import { feedPart, histInit } from './feed.js';
import { showRules, showPile, closeModal, modalOpen } from './dialogs.js';
import { derivePart, act, playEvents, onHandCard, doMove, pickFromMarket, confirmBuy, startEndTurn, finishTurn, cancelMode, undo, resumeSaved } from './actions.js';
import { MENU, menuInit, showMenu, showSetup, showHub, setupSync, prepareGame, startLocal, radio } from './menu.js';
import { netInit, joinRoom, netSend } from './online.js';
import { replayPart, replayKeys, openReplay, loadReplayId, exitReplay } from './replay.js';
import { soundInit } from './sound.js';
import { debugInit } from './debug.js';
import { boundaryInit } from './boundary.js';
import { cam } from './board/camera.js';
import { showHover, hideHover } from './board/overlays.js';
import { drag } from './hand.js';

// the order parts update in each frame: first what the selection allows, then the view from back to front
for (const p of [derivePart, overlaysPart, piecesPart, hudPart, feedPart, marketPart, buySlotPart, handPart, aimPart, replayPart]) addPart(p);
GAME_READY.then(() => { relabel(); document.documentElement.classList.add('gameready'); });

function boot() {
  boundaryInit(); debugInit(); soundInit(); aimInit(); marketInit(); hudInit(); histInit(); setupPanZoom(); watchGeometry(); menuInit();
  if (!document.documentElement.classList.contains('resume')) { setupSync(); prepareGame(); } // the start screen's game, at once (not after the server check)
  $('#deckPile').onclick = () => showPile('deck'); $('#discPile').onclick = () => showPile('discard');
  $('#rulesBtn').onclick = showRules;
  $('#stage').addEventListener('click', onBoardClick); $('#stage').addEventListener('pointerover', onBoardHover); $('#stage').addEventListener('pointerout', onBoardOut);
  // full screen (hidden where the browser can't do it, e.g. iPhone Safari — there, Add to Home Screen gives a full-screen app)
  const fsEl = document.documentElement, fsOn = () => document.fullscreenElement || document.webkitFullscreenElement;
  if (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen) {
    const fb = $('#fsBtn'); fb.hidden = false;
    // (the browser may refuse: it throws, or rejects the promise, in older and newer versions)
    fb.onclick = () => { try { Promise.resolve(fsOn() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document) : (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl, { navigationUI: 'hide' })).catch(() => { }); } catch (e) { } };
    const sync = () => { const on = !!fsOn(); fb.classList.toggle('full', on); fb.title = fb.ariaLabel = on ? 'Exit full screen' : 'Full screen'; };
    document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync);
  }
  // Menu: the start screen, without ending the game in progress (it offers Back to game and Resign)
  $('#menuBtn').onclick = () => { if (G.replay) exitReplay(); else showMenu(); };
  window.addEventListener('keydown', e => {
    if (replayKeys(e)) return; if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape' && UI.allOpen) { openAll(false); return; }
    if (e.key === 'Escape') { const mo = modalOpen(); if (mo && S && !S.over) { closeModal(); return; } if (S && !mo && !MENU.dlg.open) cancelMode(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  });
  netInit().then(() => {
    const q = new URLSearchParams(location.search), rid = (q.get('replay') || '').replace(/[^a-z0-9]/g, '');
    if (rid) { loadReplayId(rid); return; }
    const room = (q.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (room && NET.available) { if (NET.user) { joinRoom(room); return; } NET.pendingRoom = room; showHub(); return; }
    if (NET.user && NET.active) { showHub(); return; }
    if (resumeSaved()) { showSetup(); return; } // a saved game: behind the title screen, Continue first
    if (radio('mode') === 'online') { showHub(); return; } // picked before the script had loaded
    showSetup(); if ($('#sGo').dataset.q || $('#tPlay').dataset.q) { delete $('#sGo').dataset.q; delete $('#tPlay').dataset.q; startLocal(); } // Start pressed before the script had loaded
  });
}

/* clicks and hovers on the board's targets (explorers handle their own clicks: board/pieces.js) */
function onBoardClick(e) {
  if (!canAct() || cam.dragMoved || drag || UI.anim) return;
  const t = e.target.closest('[data-t]'); if (t && t.dataset.t) doMove(t.dataset.t);
}
function onBoardHover(e) {
  if (drag) return; const t = e.target.closest('[data-t]'); if (!t || !t.dataset.t) return;
  const tg = UI.targets.get(t.dataset.t); if (tg) showHover(t.dataset.t, tg);
}
function onBoardOut(e) { if (drag) return; if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-t]')) hideHover(); }

// for tests and debugging: the game, the page's state and its main entry points (each call leaves the page updated, as
// a frame would after a click)
const now = f => (...a) => { const r = f(...a); flush(); return r; };
window.__ED = { NET, UI, G, get S() { return S }, get MAP() { return MAP }, canAct, online, joinRoom, netSend, assert,
  render() { render(); flush(); },
  showCourse(C, seed) { setMAP(buildCourse(typeof C === 'string' ? courseById(C) : C, seed || 1)); buildBoard(); fit(); return MAP; },
  ...Object.fromEntries(Object.entries({ act, playEvents, openReplay, onHandCard, doMove, pickFromMarket, confirmBuy, startEndTurn, finishTurn, cancelMode }).map(([k, f]) => [k, now(f)])) };
boot();
