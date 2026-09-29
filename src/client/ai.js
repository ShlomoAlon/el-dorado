/* Local AI seats (engine_ai.js). The AI decides with the shared engine in this page and plays through the same
   applyAction as everyone else, one action at a time with a short pause so the table can follow. */
import { S, aiUsesNet, aiNetDecode, aiSetNet, aiStep } from '../engine.gen.js';
import { UI, G, online, isAI, viewIdx, humanRacing } from './state.js';
import { reduceMotion } from './dom.js';
import { toast } from './dialogs.js';
import { playEvents, afterLocalChange } from './actions.js';
export const AIX={timer:0,mem:{},net:null,loading:null,failed:false,gen:0};
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
    const id=S&&S.players[seat]&&S.players[seat].ai;
    if(!id||S.over||online()||G.replay||S.cur!==seat||S.round!==round){AIX.timer=0;aiKick();return;}
    if(aiUsesNet(id)&&!AIX.net&&!AIX.failed)await aiNetLoad();
    if(gen!==AIX.gen)return;
    if(!S||S.over||online()||G.replay||S.cur!==seat){AIX.timer=0;return;}
    aiSetNet(AIX.net);
    const prevCur=S.cur,prevRound=S.round,mem=AIX.mem[seat]||(AIX.mem[seat]={});
    const r=aiStep(id,mem,G.rec);
    AIX.timer=0;
    playEvents(r.ev,viewIdx()); // the AI's purchases don't fly into the human's discard pile
    afterLocalChange(S.cur!==prevCur||S.round!==prevRound);
  };
  AIX.timer=setTimeout(go,!humanRacing()?60:reduceMotion?250:first?1000:750); // paced so the table can follow each card (no one left to follow: quick)
}
