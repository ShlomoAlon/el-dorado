/* =========================================================
   SOUND: tiny synthesized UI effects (Web Audio, no files).
   sfx(name[,n]) plays one; everything is short, soft and low-passed.
   The AudioContext is created on the first user gesture; any failure is silent.
   ========================================================= */
const SND={ctx:null,out:null,noise:null,muted:false,last:{},prevCur:null,moveEnd:0};
try{SND.muted=localStorage.getItem('eldorado-sound')==='0';}catch(e){}
const sndStill=(()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){return false;}})();
function sndInit(){
  if(SND.ctx){if(SND.ctx.state==='suspended')SND.ctx.resume().catch(()=>{});return;}
  try{
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    const c=new AC(),lp=c.createBiquadFilter(),g=c.createGain();
    lp.type='lowpass';lp.frequency.value=6000;g.gain.value=.5; // voices peak ≤ .12 → ≈ −24 dBFS at the output
    g.connect(lp);lp.connect(c.destination);
    const b=c.createBuffer(1,c.sampleRate>>1,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    SND.ctx=c;SND.out=g;SND.noise=b;
  }catch(e){SND.ctx=null;}
}
/* one enveloped oscillator: f → f2 over dur, soft attack, exponential decay */
function sndTone(t,f,dur,peak,type,f2,cut){
  const c=SND.ctx,o=c.createOscillator(),g=c.createGain();
  o.type=type||'sine';o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+dur);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  let n=o;if(cut){const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=cut;o.connect(lp);n=lp;}
  n.connect(g);g.connect(SND.out);o.start(t);o.stop(t+dur+.02);
}
/* one filtered noise burst; f2 sweeps the filter */
function sndNoise(t,dur,peak,type,f,q,f2,atk){
  const c=SND.ctx,s=c.createBufferSource(),bq=c.createBiquadFilter(),g=c.createGain();
  s.buffer=SND.noise;bq.type=type;bq.frequency.setValueAtTime(f,t);if(f2)bq.frequency.exponentialRampToValueAtTime(f2,t+dur);bq.Q.value=q||1;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+(atk||.003));g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  s.connect(bq);bq.connect(g);g.connect(SND.out);s.start(t,Math.random()*.3);s.stop(t+dur+.02);
}
const SFX={
  tap(t,r){sndTone(t,1150*r,.035,.05,'triangle',720*r,3000);sndNoise(t,.022,.035,'bandpass',2800*r,1.6);},
  pick(t,r){sndNoise(t,.09,.06,'bandpass',1500*r,1.2,3400*r,.012);},
  step(t,r){sndTone(t,170*r,.07,.09,'sine',105*r);sndNoise(t,.045,.04,'lowpass',650*r,.7);},
  buy(t,r){sndTone(t,1320*r,.16,.055);sndTone(t+.045,1980*r,.18,.04);},
  discard(t,r){sndNoise(t,.11,.065,'bandpass',1300*r,.9,560*r,.008);},
  trash(t,r){sndTone(t,112*r,.16,.12,'sine',68*r);sndNoise(t,.06,.05,'lowpass',380*r,.7);},
  block(t,r){sndTone(t,330*r,.08,.07,'triangle',180*r,1800);sndNoise(t,.035,.07,'bandpass',1500*r,3);sndTone(t,92*r,.13,.08);},
  tick(t,r){sndNoise(t,.018,.028,'bandpass',3800*r,1.5);sndTone(t,1750*r,.016,.012,'triangle',0,3000);},
  turn(t,r){[659,880].forEach((f,i)=>{sndTone(t+i*.11,f*r,.34,.045);sndTone(t+i*.11,2*f*r,.2,.006);});},
  arrive(t,r){[523,659,784].forEach((f,i)=>sndTone(t+i*.09,f*r,.36,.05,'triangle',0,2400));},
  win(t,r){[262,330,392,523].forEach((f,i)=>{sndTone(t+i*.07,f*r,.86-i*.07,.04,'triangle',0,2000);sndTone(t+i*.07,2*f*r,.3,.008);});},
  error(t,r){sndTone(t,220*r,.12,.07,'sine',165*r);sndTone(t,110*r,.1,.03,'triangle',0,600);},
  timer(t,r){sndNoise(t,.015,.03,'bandpass',2500*r,4);sndTone(t,1200*r,.02,.018);}
};
const SND_TUNED={turn:1,arrive:1,win:1};
/* sfx(name) plays a sound; for 'move' and 'draw', n is the number of steps / cards (staggered) */
function sfx(name,n){
  try{
    const c=SND.ctx;if(SND.muted||!c||c.state!=='running'||!SFX[name==='move'?'step':name==='draw'?'tick':name])return;
    const now=performance.now();if(now-(SND.last[name]||0)<40)return;SND.last[name]=now;
    const t0=c.currentTime+.005,rnd=()=>1+(Math.random()*2-1)*(SND_TUNED[name]?.01:.03);
    if(name==='move'){ // one soft knock as the explorer lands on each space (see animatePiece: 200 ms per step)
      const k=sndStill?1:Math.min(n||1,8);for(let i=0;i<k;i++)SFX.step(t0+(sndStill?0:i*.2+.17),rnd());return;}
    if(name==='draw'){const k=Math.min(n||1,5);for(let i=0;i<k;i++)SFX.tick(t0+i*.055,rnd());return;}
    SFX[name](t0,rnd());
  }catch(e){}
}
/* engine events → sounds (called from playEvents) */
function sfxEvent(e,viewer){
  const mine=pl=>!online()||(S.owners&&S.owners[pl]===myId());
  if(e.e==='move'){sfx('move',e.path.length-1);SND.moveEnd=performance.now()+(sndStill?0:e.path.length*200);}
  else if(e.e==='block')sfx('block');
  else if(e.e==='arrive')setTimeout(()=>sfx('arrive'),Math.max(0,(SND.moveEnd||0)-performance.now()));
  else if(e.e==='gain')sfx('buy');
  else if(e.e==='draw'&&(viewer===undefined||viewer===e.pl))sfx('draw',e.n);
  else if(e.e==='over')setTimeout(()=>sfx('win'),350);
  else if(e.e==='turn'&&!S.over){
    // the player whose turn just ended drew a fresh hand; the new player gets a chime
    const ended=online()?SND.prevCur:null;
    if(!online()||(ended!==null&&mine(ended)))sfx('draw',4);
    if(mine(e.pl))setTimeout(()=>sfx('turn'),online()?0:260);
  }
  if(e.e==='turn')SND.prevCur=e.pl;
}
function setSound(on){
  SND.muted=!on;try{localStorage.setItem('eldorado-sound',on?'1':'0');}catch(e){}
  const b=document.getElementById('sndBtn');if(b){b.classList.toggle('off',!on);b.title=b.ariaLabel=on?'Mute sounds':'Unmute sounds';}
}
(()=>{
  // first gesture unlocks audio; then a soft tick for every button, a paper swish for picking a card
  const down=e=>{
    sndInit();
    const tg=e.target&&e.target.closest?e.target:null;if(!tg)return;
    if(tg.closest('button:not(:disabled)')){if(!tg.closest('#sndBtn'))sfx('tap');return;}
    if(!S||S.over||UI.cover||UI.anim||!canAct())return;
    if(tg.closest('#cards .card')||tg.closest('#market [data-src],#reserve [data-src],#allMarket [data-src]'))sfx('pick');
  };
  document.addEventListener('pointerdown',down,true);
  document.addEventListener('keydown',()=>sndInit(),true);
  const b=document.getElementById('sndBtn');
  if(b){setSound(!SND.muted);b.onclick=()=>{setSound(SND.muted);if(!SND.muted)sfx('tap');};}
})();
