/* =========================================================
   BOOT
   ========================================================= */
function boot(){
  setupPanZoom();
  $('#market').addEventListener('click',e=>{const s=e.target.closest('[data-src]');if(!s||!S||UI.cover||S.over)return;pickFromMarket('m',+s.dataset.i);});
  $('#reserve').addEventListener('click',e=>{const s=e.target.closest('[data-src]');if(!s||!S||UI.cover||S.over)return;pickFromMarket('r',+s.dataset.i);});
  $('#deckPile').onclick=()=>showPile('deck');$('#discPile').onclick=()=>showPile('discard');
  $('#rulesBtn').onclick=showRules;
  $('#menuBtn').onclick=()=>{if(online()&&!S.over)resignOnline();else if(online()){exitOnline();showHub();}else showSetup();};
  $('#sideToggle').onclick=()=>setSide(!UI.sideOpen);$('#sideClose').onclick=()=>setSide(false);
  let so=null;try{so=localStorage.getItem('eldorado-side');}catch(e){}
  UI.sideOpen=so===null?innerWidth>1100:so==='1';
  $('#side').classList.toggle('closed',!UI.sideOpen);$('#sideToggle').classList.toggle('on',UI.sideOpen);
  window.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;
    if(e.key==='Escape'){const mo=document.querySelector('#overlay .modal');if(mo&&S&&!S.over&&!mo.classList.contains('roomlobby')&&!mo.classList.contains('hub')){closeModal();return;}if(S&&!mo)cancelMode();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}});
  netInit().then(()=>{
    let room=null;try{room=(new URLSearchParams(location.search).get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'')||null;}catch(e){}
    if(room&&NET.available){if(NET.user){joinRoom(room);return;}NET.pendingRoom=room;showHub();return;}
    if(NET.user&&NET.active){showHub();return;}
    let saved=null;try{saved=JSON.parse(localStorage.getItem('eldorado-save-v4')||'null');}catch(e){}
    if(saved&&!saved.over&&saved.v===4&&!saved.owners){
      try{S=saved;MAP=mapFor(S);buildBoard();UI.piece=firstPiece();UI.cover=!!S.privacy;syncMode(false);render();requestAnimationFrame(()=>fit());
        if(!UI.cover)banner(cur().name,'Round '+S.round);return;}catch(e){console.error(e);S=null;}
    }
    showSetup();
  });
}
window.__ED={NET,UI,act,applyAction,render,get S(){return S},get MAP(){return MAP},joinRoom,netSend,onHandCard,doMove,pickFromMarket,confirmBuy,startEndTurn,finishTurn,confirmDiscardFor,confirmTrash,cancelMode,reach,myId,canAct,view};
boot();
