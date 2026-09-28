const { chromium } = require('playwright');
const BASE=process.env.BASE||'http://127.0.0.1:8787/'; // run against `npm run dev` (DEV_AUTH=1)
(async()=>{
  const b=await chromium.launch();const errs=[];
  const mk=async(name)=>{const c=await b.newContext({viewport:{width:1280,height:800}});const p=await c.newPage();p.on('pageerror',e=>errs.push(name+': '+e.message+'\n'+e.stack));p.on('console',m=>{if(m.type()==='error'&&!/fonts|ERR_TUNNEL|gsi/.test(m.text()))errs.push(name+' console: '+m.text())});return p;};
  const A=await mk('A'),B=await mk('B'),C=await mk('C');
  const signin=async(P,name)=>{await P.goto(BASE);await P.waitForTimeout(800);await P.click('#sMode button[data-m="online"]');await P.waitForTimeout(400);await P.fill('#devName',name);await P.click('#devGo');await P.waitForTimeout(800);};
  await signin(A,'Alice');await signin(B,'Bob');await signin(C,'Cara');
  await A.screenshot({path:'/tmp/e_hub.png'});
  // create a room with 3 players and a short dev timer via API from page context
  const code=await A.evaluate(async()=>{const r=await fetch('/api/rooms',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+__ED.NET.token},body:JSON.stringify({max:3,turn:8,course:'first'})});const j=await r.json();__ED.joinRoom(j.code);return j.code;});
  await A.waitForTimeout(1200);
  console.log('room',code);
  await B.waitForTimeout(500);await B.screenshot({path:'/tmp/e_hub_b.png'});
  await B.fill('#jCode',code);await B.click('#jGo');await B.waitForTimeout(1000);
  await C.goto(BASE+'?room='+code);await C.waitForTimeout(2000);
  await A.screenshot({path:'/tmp/e_room.png'});
  console.log('seats',await A.evaluate(()=>__ED.NET.room.seats.map(s=>s.name+(s.online?'':'(away)'))));
  await A.click('#rlStart');await A.waitForTimeout(2000);
  const st=P=>P.evaluate(()=>({cur:__ED.S&&__ED.S.cur,seat:__ED.NET.seat,can:__ED.canAct(),hand:__ED.S&&__ED.S.players.map(p=>p.hand.length),mineVisible:__ED.S&&__ED.S.players.map((p,i)=>p.hand.every(id=>!!__ED.S.cards[id]))}));
  console.log('A',await st(A));console.log('B',await st(B));console.log('C',await st(C));
  // current player moves via UI helpers
  const who=async()=>{for(const P of [A,B,C]){if(await P.evaluate(()=>__ED.canAct()))return P;}return null;};
  const moveOnce=async(P)=>P.evaluate(async()=>{const E=__ED,S=E.S,pl=S.players[S.cur];for(const id of pl.hand){if(!S.cards[id])continue;E.onHandCard(id);for(const [k] of E.UI.targets){if(k[0]!=='B'){E.doMove(k);return k;}}E.cancelMode();}return null;});
  for(let t=0;t<4;t++){
    const P=await who();if(!P){console.log('nobody can act');break;}
    const name=await P.evaluate(()=>__ED.NET.user.name);
    const mv=await moveOnce(P);await P.waitForTimeout(600);
    // buy attempt: scout with 2 cards
    await P.evaluate(()=>{const E=__ED,S=E.S;if(S.turn.bought)return;const pl=S.players[S.cur];E.pickFromMarket('m',0);E.UI.picks=pl.hand.slice(0,2);E.confirmBuy();});
    await P.waitForTimeout(600);
    const log=await P.evaluate(()=>__ED.S.log.slice(-2).map(l=>l.t));
    console.log('turn',t,name,'moved',mv,log);
    await P.evaluate(()=>{__ED.startEndTurn();if(__ED.UI.mode==='endTurn')__ED.finishTurn();});await P.waitForTimeout(800);
  }
  await B.screenshot({path:'/tmp/e_game_b.png'});
  // timer: wait for timeout (8s) and check auto-advance
  const before=await A.evaluate(()=>__ED.S.cur);await A.waitForTimeout(10000);
  const after=await A.evaluate(()=>({cur:__ED.S.cur,log:__ED.S.log.slice(-3).map(l=>l.t)}));
  console.log('timer: cur',before,'->',after.cur,after.log);
  // resign two players -> game ends
  await B.evaluate(()=>__ED.netSend({t:'act',a:{t:'resign'}}));await B.waitForTimeout(800);
  await C.evaluate(()=>__ED.netSend({t:'act',a:{t:'resign'}}));await C.waitForTimeout(1500);
  console.log('over',await A.evaluate(()=>({over:__ED.S.over,places:__ED.S.places,res:__ED.NET.room.results})));
  await A.screenshot({path:'/tmp/e_over.png'});
  const lb=await A.evaluate(async()=>(await (await fetch('/api/leaderboard')).json()).players.map(p=>p.name+':'+p.rating+':'+p.games));
  console.log('leaderboard',lb);
  console.log('errors',errs.slice(0,6));await b.close();
})();
