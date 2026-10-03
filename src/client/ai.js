/* Local AI seats (engine_ai.js). The AI decides with the shared engine in a worker of its own (aiworker.js: its thinking
   never holds up a frame or a tap) and plays through the same applyAction as everyone else, one action at a time with a
   short pause so the table can follow. */
import { aiUsesNet, aiNetDecode, assert, AssertionError } from '../engine.gen.js';
import { DEBUG } from './debug.js';
import { S, UI, G, online, isAI, viewIdx, humanRacing } from './state.js';
import { reduceMotion } from './dom.js';
import { toast } from './dialogs.js';
import { failed } from './boundary.js';
import { applyLocal } from './actions.js';
import { walking } from './board/pieces.js';
// gen: which game is on show (aiReset: showGame); a move scheduled for an earlier one is dropped (the worker keeps each AI's
// memory for the game it was asked about)
// pace: the pauses' scale (1 in play; test/play.cjs plays whole games faster: the same moves, shorter pauses)
export const AIX={timer:0,net:null,bin:null,loading:null,failed:false,gen:0,pace:1};
/* the worker: started when the AI is first asked; every request is answered with its id, by a result or by the error it
   met there (an assertion stays an assertion: the page's boundary treats it as one) */
let W=null,seq=0;const waiting=new Map();
function worker(){
  if(W)return W;
  W=new Worker(AI_WORKER.url||URL.createObjectURL(new Blob([AI_WORKER.src],{type:'text/javascript'})));
  W.onmessage=e=>{const m=e.data,p=waiting.get(m.id);waiting.delete(m.id);
    if(!m.err){p.resolve(m);return;}
    const x=m.assertion?new AssertionError(m.err.replace(/^assertion failed: /,'')):new Error(m.err);x.stack=m.stack;p.reject(x);};
  // (its script failed to load, or it stopped: every request waiting fails, and the next one starts a new worker)
  W.onerror=e=>{const x=new Error('the AI worker stopped: '+(e.message||'its script did not load'));W=null;for(const[,p]of waiting)p.reject(x);waiting.clear();};
  W.postMessage({t:'init',debug:DEBUG});if(AIX.net)W.postMessage({t:'net',bin:AIX.bin});
  return W;
}
/* an AI's next action in the game on show (its memory of earlier turns is the worker's, kept per seat for this game) */
export const aiThink=(S,ai,seat,seed)=>aiAsk({t:'choose',S,ai,seat,gen:AIX.gen,seed}).then(r=>r.a); // (seed: tests only, the same choice every run)
export function aiAsk(m){return new Promise((resolve,reject)=>{const id=++seq;waiting.set(id,{resolve,reject,t:m.t,at:performance.now()});worker().postMessage({...m,id});});}
/* what the worker has still to answer (for checks' messages): each request's kind and how long it has waited */
export const aiWaiting=()=>[...waiting.values()].map(p=>p.t+' '+Math.round(performance.now()-p.at)+' ms').join(', ')||'nothing';
export function aiNetLoad(){ // the neural network (~340 KB) is only fetched once a network AI is about to play
  if(AIX.net)return Promise.resolve(AIX.net);
  if(!AIX.loading)AIX.loading=(async()=>{
    let bin;
    if(AI_NET.b64){const s=atob(AI_NET.b64);bin=new Uint8Array(s.length);for(let i=0;i<s.length;i++)bin[i]=s.charCodeAt(i);}
    else{const r=await fetch(AI_NET.url);if(!r.ok)throw new Error('HTTP '+r.status);bin=new Uint8Array(await r.arrayBuffer());
      // the network this page was built with (its name and its hash come from its contents, build.mjs): another one would
      // play with weights its code doesn't expect
      const h=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bin))].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,10);
      assert(h===AI_NET.hash,'ai: the network fetched is the one this page was built with ('+h+', built with '+AI_NET.hash+')');}
    AIX.net=aiNetDecode(bin);AIX.bin=bin;if(W)W.postMessage({t:'net',bin}); // (the page's copy scores replay positions; the worker's plays)
    return AIX.net;
  })().catch(e=>{AIX.failed=true;AIX.loading=null;console.warn('AI network unavailable:',e);
    if(!(e instanceof TypeError)&&!/^HTTP /.test(e.message)){console.error(e);failed(e,'loading the AI network');} // (no connection, or no such file: expected; anything else is a bug)
   toast('The AI network could not load; the AIs play with the route planner.',3200);return null;});
  return AIX.loading;
}
export function aiReset(){clearTimeout(AIX.timer);AIX.timer=0;AIX.gen++;} // a new game (or a loaded one) starts
/* after every change of a local game: if an AI is to move, schedule its next action */
export function aiKick(){
  if(AIX.timer||!S||S.over||online()||G.replay||UI.preview||!isAI(S.cur))return;
  const seat=S.cur,round=S.round,gen=AIX.gen,first=!S.turn.active&&!S.players[seat].play.length&&!S.turn.bought;
  const go=async()=>{
    if(gen!==AIX.gen)return;
    if(walking()){AIX.timer=setTimeout(go,120);return;} // let a moving explorer finish first (thinking can take a frame or two)
    if(S.over||S.cur!==seat||S.round!==round){AIX.timer=0;aiKick();return;} // (in the meantime someone resigned, or the game was ended)
    const id=S.players[seat].ai;
    if(aiUsesNet(id)&&!AIX.net&&!AIX.failed)await aiNetLoad();
    if(gen!==AIX.gen)return;
    if(S.over||S.cur!==seat){AIX.timer=0;return;}
    const n=S.log.length,a=await aiThink(S,id,seat);
    if(gen!==AIX.gen)return;
    if(S.over||S.cur!==seat||S.log.length!==n){AIX.timer=0;aiKick();return;} // (the game moved on while it thought: think again)
    AIX.timer=0; // (before applying: the change schedules the next AI move)
    assert(applyLocal(seat,a,viewIdx()).ok,'the AI chooses a legal action');
  };
  AIX.timer=setTimeout(go,AIX.pace*(!humanRacing()?60:reduceMotion?250:first?1000:750)); // paced so the table can follow each card (no one left to follow: quick)
}
