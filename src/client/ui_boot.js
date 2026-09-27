/* =========================================================
   BOOT
   ========================================================= */
function boot(){
  setupPanZoom();
  const pick=e=>{if(!S||UI.cover||S.over)return;if(e.target.closest('#allTile')){openAll(true);return;}const s=e.target.closest('[data-src]');if(!s)return;
    const inAll=!!e.target.closest('#allc');pickFromMarket(s.dataset.src,+s.dataset.i);if(inAll&&UI.mode==='pay')openAll(false);};
  for(const c of['#market','#allMarket','#reserve']){$(c).addEventListener('click',e=>{if(mdragJustEnded){mdragJustEnded=false;return;}pick(e);});$(c).addEventListener('pointerdown',marketDown);}
  $('#bsCancel').onclick=cancelMode;
  $('#allClose').onclick=()=>openAll(false);$('#allc').addEventListener('click',e=>{if(e.target.id==='allc'||e.target.classList.contains('allc-in'))openAll(false);});
  $('#deckPile').onclick=()=>showPile('deck');$('#discPile').onclick=()=>showPile('discard');
  $('#rulesBtn').onclick=showRules;
  // full screen (hidden where the browser can't do it, e.g. iPhone Safari — there, Add to Home Screen gives a full-screen app)
  const fsEl=document.documentElement,fsOn=()=>document.fullscreenElement||document.webkitFullscreenElement;
  if(fsEl.requestFullscreen||fsEl.webkitRequestFullscreen){const fb=$('#fsBtn');fb.hidden=false;
    fb.onclick=()=>{try{if(fsOn())(document.exitFullscreen||document.webkitExitFullscreen).call(document);else(fsEl.requestFullscreen||fsEl.webkitRequestFullscreen).call(fsEl,{navigationUI:'hide'});}catch(e){}};
    const sync=()=>{const on=!!fsOn();fb.classList.toggle('full',on);fb.title=fb.ariaLabel=on?'Exit full screen':'Full screen';};
    document.addEventListener('fullscreenchange',sync);document.addEventListener('webkitfullscreenchange',sync);}
  $('#menuBtn').onclick=()=>{if(REPLAY){exitReplay();return;}if(online()&&!S.over)resignOnline();else if(online()){exitOnline();showHub();}else showSetup();};
  $('#mktBtn').onclick=()=>{if($('#mkt').classList.contains('cramped')){openAll(true);return;}setMkt(!UI.mktOpen);};
  let so=null;try{so=localStorage.getItem('eldorado-mkt');}catch(e){}
  UI.mktOpen=so!=='0';$('#mkt').classList.toggle('hid',!UI.mktOpen);$('#mktBtn').classList.toggle('on',UI.mktOpen);
  window.addEventListener('keydown',e=>{if(replayKeys(e))return;if(e.target.tagName==='INPUT')return;
    if(e.key==='Escape'&&UI.allOpen){openAll(false);return;}
    if(e.key==='Escape'){const mo=document.querySelector('#overlay .modal');if(mo&&S&&!S.over&&!mo.classList.contains('roomlobby')&&!mo.classList.contains('hub')){closeModal();return;}if(S&&!mo)cancelMode();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}});
  netInit().then(()=>{
    let rid=null;try{rid=(new URLSearchParams(location.search).get('replay')||'').replace(/[^a-z0-9]/g,'')||null;}catch(e){}
    if(rid){loadReplayId(rid);return;}
    let room=null;try{room=(new URLSearchParams(location.search).get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'')||null;}catch(e){}
    if(room&&NET.available){if(NET.user){joinRoom(room);return;}NET.pendingRoom=room;showHub();return;}
    if(NET.user&&NET.active){showHub();return;}
    const saved=loadSave();
    if(saved&&!saved.over){
      try{aiReset();S=saved;MAP=mapFor(S);buildBoard();UI.piece=firstPiece();UI.cover=!!S.privacy;syncMode(false);render();requestAnimationFrame(()=>fit());
        if(!UI.cover)banner(cur().name,'Round '+S.round);return;}catch(e){console.error(e);S=null;}
    }
    showSetup();
  });
}
window.__ED={NET,UI,act,openReplay,applyAction,render,get S(){return S},get MAP(){return MAP},joinRoom,netSend,onHandCard,doMove,pickFromMarket,confirmBuy,startEndTurn,finishTurn,confirmDiscardFor,confirmTrash,cancelMode,reach,myId,canAct,view};
boot();
