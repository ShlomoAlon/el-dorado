/* Local AI seats (engine_ai.js). The AI decides with the shared engine in this page and plays through the same
   applyAction as everyone else, one action at a time with a short pause so the table can follow. */
import { aiUsesNet, aiNetDecode, aiSetNet, aiChoose, assert } from '../engine.gen.js';
import { S, UI, G, online, isAI, viewIdx, humanRacing } from './state.js';
import { reduceMotion } from './dom.js';
import { toast } from './dialogs.js';
import { applyLocal } from './actions.js';
// gen: which game is on show (aiReset: showGame); a move scheduled for an earlier one is dropped
// pace: the pauses' scale (1 in play; test/play.cjs plays whole games faster: the same moves, shorter pauses)
export const AIX={timer:0,mem:{},net:null,loading:null,failed:false,gen:0,pace:1};
export function aiNetLoad(){ // the neural network (~340 KB) is only fetched once a network AI is about to play
  if(AIX.net)return Promise.resolve(AIX.net);
  if(!AIX.loading)AIX.loading=(async()=>{
    let bin;
    if(AI_NET.b64){const s=atob(AI_NET.b64);bin=new Uint8Array(s.length);for(let i=0;i<s.length;i++)bin[i]=s.charCodeAt(i);}
    else{const r=await fetch(AI_NET.url);if(!r.ok)throw new Error('HTTP '+r.status);bin=new Uint8Array(await r.arrayBuffer());}
    AIX.net=aiNetDecode(bin);return AIX.net;
  })().catch(e=>{AIX.failed=true;AIX.loading=null;console.warn('AI network unavailable:',e);toast('The AI network could not load; the AIs play with the route planner.',3200);return null;});
  return AIX.loading;
}
export function aiReset(){clearTimeout(AIX.timer);AIX.timer=0;AIX.mem={};AIX.gen++;} // a new game (or a loaded one) starts
/* after every change of a local game: if an AI is to move, schedule its next action */
export function aiKick(){
  if(AIX.timer||!S||S.over||online()||G.replay||UI.preview||!isAI(S.cur))return;
  const seat=S.cur,round=S.round,gen=AIX.gen,first=!S.turn.active&&!S.players[seat].play.length&&!S.turn.bought;
  const go=async()=>{
    if(gen!==AIX.gen)return;
    if(UI.anim){AIX.timer=setTimeout(go,120);return;} // let a moving explorer finish first (thinking can take a frame or two)
    if(S.over||S.cur!==seat||S.round!==round){AIX.timer=0;aiKick();return;} // (in the meantime someone resigned, or the game was ended)
    const id=S.players[seat].ai;
    if(aiUsesNet(id)&&!AIX.net&&!AIX.failed)await aiNetLoad();
    if(gen!==AIX.gen)return;
    if(S.over||S.cur!==seat){AIX.timer=0;return;}
    aiSetNet(AIX.net);
    const a=aiChoose(S,id,AIX.mem[seat]||(AIX.mem[seat]={}),Math.random);
    AIX.timer=0; // (before applying: the change schedules the next AI move)
    assert(applyLocal(seat,a,viewIdx()).ok,'the AI chooses a legal action');
  };
  AIX.timer=setTimeout(go,AIX.pace*(!humanRacing()?60:reduceMotion?250:first?1000:750)); // paced so the table can follow each card (no one left to follow: quick)
}
