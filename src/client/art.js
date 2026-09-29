import { CT } from '../engine.gen.js';
/* =========================================================
   CARD ART — one background scene per card type (viewBox 100×70).
   The scene sits behind the card's emblem, so it stays soft: the suit sets the palette
   (jungle green, river blue, village gold, parchment for jokers, dusk purple for actions),
   and each card adds its own subject near the edges (the emblem covers the middle).
   Pure SVG strings; gradients use shared ids, identical wherever they repeat.
   ========================================================= */
/* the scene of a card without its own art: one per suit */
const SCENE={
 g:`<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd19b"/><stop offset=".55" stop-color="#2f7a48"/><stop offset="1" stop-color="#123821"/></linearGradient></defs><rect width="100" height="70" fill="url(#sg)"/><path d="M0 40 Q20 30 40 38 T80 34 T100 36 V70 H0Z" fill="#1f5a35" opacity=".8"/><path d="M-5 70 Q5 30 22 18 Q14 40 18 70Z M105 70 Q95 26 76 14 Q86 40 82 70Z" fill="#0f3320"/><path d="M-4 16 Q14 12 26 26 Q10 26 -4 30Z M104 10 Q84 8 72 22 Q90 22 104 26Z" fill="#185c34"/><path d="M40 0 L52 0 L70 70 L30 70Z" fill="#fff" opacity=".07"/>`,
 b:`<defs><linearGradient id="sb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe3fb"/><stop offset=".45" stop-color="#4d9ad6"/><stop offset="1" stop-color="#143e66"/></linearGradient></defs><rect width="100" height="70" fill="url(#sb)"/><path d="M0 30 Q25 26 50 30 T100 30 V36 H0Z" fill="#2e6a3f" opacity=".85"/><path d="M0 44 Q12 40 25 44 T50 44 T75 44 T100 44" stroke="#fff" stroke-opacity=".35" stroke-width="1.6" fill="none"/><path d="M0 54 Q12 50 25 54 T50 54 T75 54 T100 54" stroke="#fff" stroke-opacity=".25" stroke-width="1.6" fill="none"/><path d="M0 63 Q12 59 25 63 T50 63 T75 63 T100 63" stroke="#fff" stroke-opacity=".18" stroke-width="1.6" fill="none"/>`,
 y:`<defs><linearGradient id="sy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a8"/><stop offset=".5" stop-color="#f0a948"/><stop offset="1" stop-color="#8f4f16"/></linearGradient></defs><rect width="100" height="70" fill="url(#sy)"/><circle cx="72" cy="24" r="12" fill="#fff4c9" opacity=".8"/><path d="M0 50 L10 50 L16 40 L22 50 L34 50 L42 38 L50 50 L64 50 L70 42 L76 50 L100 50 V70 H0Z" fill="#6b3a10" opacity=".85"/><path d="M0 58 Q50 52 100 58 V70 H0Z" fill="#4d290a"/>`,
 x:`<defs><radialGradient id="sx" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#c4b38b"/></radialGradient></defs><rect width="100" height="70" fill="url(#sx)"/><g stroke="#8a7a55" stroke-opacity=".35" fill="none"><circle cx="50" cy="35" r="26"/><circle cx="50" cy="35" r="18"/><path d="M50 3 V67 M18 35 H82 M27 12 L73 58 M73 12 L27 58"/></g>`,
 p:`<defs><linearGradient id="sp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#261646"/><stop offset=".7" stop-color="#5a3a91"/><stop offset="1" stop-color="#7d5bb8"/></linearGradient></defs><rect width="100" height="70" fill="url(#sp)"/><g fill="#fff"><circle cx="12" cy="10" r=".9"/><circle cx="30" cy="18" r=".7"/><circle cx="84" cy="12" r="1"/><circle cx="70" cy="28" r=".6"/><circle cx="20" cy="34" r=".6"/><circle cx="90" cy="38" r=".8"/><circle cx="45" cy="8" r=".6"/></g><circle cx="82" cy="18" r="7" fill="#f3ecff" opacity=".8"/><circle cx="85" cy="16" r="6" fill="#2b1a4d"/><path d="M0 58 Q30 50 60 56 T100 54 V70 H0Z" fill="#170d2c"/>`,
};
const ART_SKY={
  g:['#dff3c9','#7cbf82','#1d5233'],
  b:['#e6f5ff','#86c0ea','#1f5f96'],
  y:['#fff4d2','#f2bf5c','#a2601a'],
  x:['#fffaf0','#ece0bf','#bba577'],
  p:['#1a0f33','#3b2570','#6c4ca8'],
};
const artSky=c=>{const[a,b,d]=ART_SKY[c];return`<defs><linearGradient id="ask-${c}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${d}"/></linearGradient><radialGradient id="aglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="100" height="70" fill="url(#ask-${c})"/>`;};
const artSun=(x,y,r,col)=>`<circle cx="${x}" cy="${y}" r="${r*2.2}" fill="url(#aglow)"/><circle cx="${x}" cy="${y}" r="${r}" fill="${col}"/>`;
// rolling horizon; k = height 0..1, col fill
const artHills=(y,amp,col,op=1,ph=0)=>`<path d="M0 ${y} Q${12+ph} ${y-amp} ${25+ph} ${y} T${50+ph} ${y} T${75+ph} ${y} T${100+ph} ${y} V70 H0Z" fill="${col}" opacity="${op}"/>`;
// jungle canopy line of round crowns
const artCanopy=(y,col,op=1,seed=0)=>{let d=`M0 70 V${y}`;for(let x=0;x<=100;x+=9){const h=4+((x*7+seed*13)%5);d+=` Q${x+4.5} ${y-h} ${x+9} ${y}`;}return`<path d="${d} V70Z" fill="${col}" opacity="${op}"/>`;};
const artFern=(x,y,s,flip,col)=>`<g transform="translate(${x} ${y}) scale(${flip?-s:s} ${s})" fill="${col}"><path d="M0 0 Q4 -10 14 -16 Q8 -8 0 0Z"/><path d="M0 0 Q9 -4 18 -6 Q9 -1 0 0Z"/><path d="M0 0 Q1 -12 6 -22 Q4 -10 0 0Z"/></g>`;
const artPalm=(x,y,s,col)=>`<g transform="translate(${x} ${y}) scale(${s})" fill="${col}"><path d="M-.8 0 Q-1.5 -9 1 -18 L2 -18 Q.5 -9 .8 0Z"/><path d="M1.5 -18 Q-6 -21 -11 -16 Q-5 -18.5 1.5 -17Z M1.5 -18 Q8 -22 13 -16 Q7 -19 1.5 -17Z M1.5 -18 Q-2 -25 -7 -26 Q-2 -22 1 -17.5Z M1.5 -18 Q5 -25 10 -25 Q5 -22 2 -17.5Z"/></g>`;
const artHut=(x,y,s,col)=>`<g transform="translate(${x} ${y}) scale(${s})" fill="${col}"><path d="M-6 0 V-5 H6 V0Z"/><path d="M-8 -5 L0 -11 L8 -5Z"/></g>`;
const artBirds=(x,y,col)=>`<g fill="none" stroke="${col}" stroke-width=".7" stroke-linecap="round"><path d="M${x} ${y} q2 -1.6 4 0 q2 -1.6 4 0"/><path d="M${x+7} ${y-4} q1.5 -1.2 3 0 q1.5 -1.2 3 0"/></g>`;
const artStars=(pts)=>`<g fill="#fff">${pts.map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" opacity=".8"/>`).join('')}</g>`;
// standing figure, feet at (x,y); hat: helmet|fedora|cap|top|captain|none
const artHat={helmet:'<path d="M-3.4 -17.4 Q0 -22.2 3.4 -17.4Z"/><ellipse cy="-17.4" rx="4.4" ry=".9"/>',
  fedora:'<ellipse cy="-18.3" rx="4.6" ry=".9"/><path d="M-2.3 -18.3 L-1.9 -21.2 Q0 -22 1.9 -21.2 L2.3 -18.3Z"/>',
  cap:'<path d="M-2.5 -18.6 Q0 -21.4 2.5 -18.6 L4.6 -18.2 L-2.5 -18.2Z"/>',
  top:'<ellipse cy="-18.6" rx="3.6" ry=".8"/><rect x="-2" y="-24.2" width="4" height="5.8" rx=".4"/>',
  captain:'<path d="M-3 -18.5 Q0 -22 3 -18.5 L3.4 -18 H-3.4Z"/><rect x="-3.6" y="-18.5" width="7.2" height="1" rx=".4"/>',none:''};
const artPerson=(x,y,s,col,hat,extra='')=>`<g transform="translate(${x} ${y}) scale(${s})" fill="${col}" stroke="${col}"><path stroke="none" d="M-2.6 -14.2 Q0 -15.6 2.6 -14.2 L3.3 -6.4 L2.1 -6.4 L1.9 0 L.5 0 L.2 -5.6 L-.2 -5.6 L-.5 0 L-1.9 0 L-2.1 -6.4 L-3.3 -6.4Z"/><circle stroke="none" cy="-16.8" r="2.3"/><g stroke="none">${artHat[hat]||''}</g>${extra}</g>`;
const artWater=(y,col,line)=>`<rect y="${y}" width="100" height="${70-y}" fill="${col}"/><g stroke="${line}" stroke-width=".8" fill="none" stroke-linecap="round" opacity=".7"><path d="M6 ${y+6} q4 -1.5 8 0 M30 ${y+11} q5 -1.8 10 0 M62 ${y+5} q4 -1.5 8 0 M80 ${y+14} q5 -1.8 10 0 M14 ${y+18} q4 -1.5 8 0 M48 ${y+20} q5 -1.8 10 0"/></g>`;
const artSketch=(inner)=>`<g fill="none" stroke="#7a643a" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round" opacity=".55">${inner}</g>`;

const CARD_BG={
  /* ---- starting cards ---- */
  explorer:()=>artSky('g')+artSun(22,16,5,'#fffbe0')+artHills(38,6,'#5aa069',.8)+artCanopy(46,'#2f7a48',.9,1)+artCanopy(56,'#1d5233',1,3)
    +artPerson(84,60,1.15,'#0f2e1c','helmet','<path d="M3 -9 L6.5 0" stroke-width=".9"/>')+artFern(0,70,1.3,false,'#123821')+artFern(100,70,1.1,true,'#123821'),
  traveler:()=>artSky('y')+artSun(76,18,7,'#fffaf0')+artHills(44,4,'#d99a45',.8)
    +artHut(10,44,.8,'#8a4f16')+artHut(22,44,.6,'#8a4f16')+artPalm(30,44,.7,'#7a4412')
    +'<path d="M44 70 Q50 55 58 46 Q62 44 66 44" stroke="#f9e2a8" stroke-width="7" fill="none" opacity=".55"/>'
    +artPerson(82,64,1.2,'#5a300c','fedora','<path d="M3 -13 Q6 -12 5.6 -7 L3 -7.5Z" stroke="none"/><path d="M-3 -7 L-5 0" stroke-width=".8"/>'),
  sailor:()=>artSky('b')+artSun(20,14,4.5,'#ffffff')+artCanopy(34,'#2e6a3f',.85,2)+artWater(40,'#2e78b8','#d9efff')
    +`<g transform="translate(80 50)" fill="#0f2f4d"><path d="M-12 0 Q0 5 12 0 Q0 2.4 -12 0Z"/>${artPerson(0,-.5,.7,'#0f2f4d','cap','<path d="M4 -10 L-6 8" stroke-width="1.1"/>')}</g>`,
  /* ---- machete (green) ---- */
  scout:()=>artSky('g')+artBirds(62,14,'#1d5233')+artCanopy(48,'#3d8a55',.85,4)+artCanopy(58,'#1d5233',1,5)
    +'<path d="M0 70 V44 Q8 36 16 38 Q24 40 28 48 L30 70Z" fill="#123821"/>'
    +artPerson(15,39,1.05,'#0b2415','helmet','<path d="M2.4 -13.6 L9.5 -15.4" stroke-width="1.3" stroke-linecap="round"/>'),
  trailblazer:()=>artSky('g')+artCanopy(52,'#2f7a48',.9,6)
    +'<g stroke="#1d5233" stroke-width="1.4" fill="none" stroke-linecap="round"><path d="M8 0 Q10 18 6 34"/><path d="M20 0 Q23 14 18 28"/><path d="M88 0 Q84 20 90 40"/><path d="M96 0 Q98 12 94 22"/></g>'
    +'<g fill="#3d8a55"><path d="M6 34 q-3 3 0 6 q3 -3 0 -6Z"/><path d="M18 28 q3 3 0 6 q-3 -3 0 -6Z"/><path d="M90 40 q3 3 0 6 q-3 -3 0 -6Z"/><path d="M72 20 l3 -2 l1 3Z"/><path d="M66 26 l-2 -3 l3 -1Z"/></g>'
    +artPerson(80,64,1.2,'#0b2415','helmet','<path d="M2.4 -13.4 L7 -21" stroke-width="1.2" stroke-linecap="round"/><path d="M6.6 -21 Q12 -26 10 -30 Q8 -25 5.8 -21.6Z" stroke="none" fill="#e8f3ea"/>'),
  pioneer:()=>artSky('g')+'<g fill="#fff6c8" opacity=".25"><path d="M40 0 L52 0 L30 70 L18 70Z"/><path d="M60 0 L66 0 L54 70 L46 70Z"/></g>'
    +'<g fill="#1d5233"><rect x="4" y="0" width="6" height="70"/><rect x="90" y="0" width="7" height="70"/><rect x="74" y="0" width="3.5" height="70" opacity=".7"/></g>'
    +artCanopy(8,'#123821',.9,7).replace('M0 70 V8','M0 0 V8').replace(' V70Z',' V0Z')
    +'<g transform="translate(12 62) rotate(-8)"><rect x="0" y="-3" width="26" height="6" rx="3" fill="#5b3a1a"/><circle cx="26" cy="0" r="3" fill="#c79a5c"/></g>'
    +artPerson(62,66,1.2,'#0b2415','fedora','<path d="M-2.4 -13 L-8 -21" stroke-width="1.1"/><path d="M-9.6 -22.6 L-6.4 -20.6 L-7.8 -18.8 L-10.6 -20.8Z" stroke="none"/>'),
  giant:()=>artSky('g')+artCanopy(50,'#2f7a48',.85,8)
    +'<g transform="translate(50 34) rotate(-28)"><path d="M-46 -3 H30 Q44 -6 48 4 Q30 3 -46 3Z" fill="#e8f1ea" opacity=".35"/><rect x="-54" y="-3.5" width="10" height="7" rx="2" fill="#5b3a1a" opacity=".6"/></g>'
    +'<g fill="#3d8a55"><path d="M10 20 q6 -6 12 0 q-6 3 -12 0Z" transform="rotate(-20 16 20)"/><path d="M80 14 q6 -6 12 0 q-6 3 -12 0Z" transform="rotate(25 86 14)"/><path d="M84 46 q5 -5 10 0 q-5 2.5 -10 0Z"/></g>'
    +artFern(0,70,1.4,false,'#123821')+artFern(100,70,1.4,true,'#123821'),
  /* ---- paddle (blue) ---- */
  captain:()=>artSky('b')+'<g fill="#fff" opacity=".7"><circle cx="18" cy="10" r="3"/><circle cx="23" cy="7" r="4"/><circle cx="29" cy="9" r="3"/></g>'
    +artCanopy(32,'#2e6a3f',.8,9)+artWater(40,'#2e78b8','#d9efff')
    +'<g fill="#0f2f4d"><path d="M2 50 H38 L34 56 H6Z"/><rect x="8" y="42" width="22" height="8" rx="1"/><rect x="18" y="26" width="3.4" height="16"/><circle cx="34" cy="50" r="5" fill="none" stroke="#0f2f4d" stroke-width="1.6"/></g>'
    +artPerson(13,42,.6,'#0f2f4d','captain'),
  /* ---- coin (gold) ---- */
  photographer:()=>artSky('y')+'<g fill="#fffbe6" opacity=".7"><path d="M80 22 L84 8 L86 22 L98 18 L88 26 L98 34 L86 30 L84 44 L80 30 L68 34 L78 26 L68 18Z"/></g>'
    +'<path d="M4 50 L14 30 L24 50Z M10 50 L14 42 L18 50Z" fill="#8a4f16" opacity=".7"/>'+artHills(52,3,'#c98a38',.9)
    +'<g fill="#5a300c"><rect x="74" y="24" width="12" height="8" rx="1.2"/><rect x="78" y="21.6" width="4" height="2.6"/><circle cx="80" cy="28" r="2.4" fill="#f6d27a"/><path d="M80 32 L73 58 M80 32 L87 58 M80 32 V58" stroke="#5a300c" stroke-width="1.2" fill="none"/></g>',
  journalist:()=>artSky('y')+artHills(52,3,'#c98a38',.8)
    +'<g transform="translate(14 22) rotate(-12)"><rect width="22" height="16" fill="#fff6dc" opacity=".85"/><rect x="2" y="2" width="18" height="3" fill="#5a300c" opacity=".7"/><path d="M2 8 H12 M2 10.5 H12 M2 13 H10 M14 8 H20 M14 10.5 H20" stroke="#5a300c" stroke-width=".7" opacity=".6"/></g>'
    +'<g transform="translate(76 40) rotate(10)"><rect width="18" height="13" fill="#fff6dc" opacity=".75"/><rect x="2" y="2" width="14" height="2.4" fill="#5a300c" opacity=".6"/><path d="M2 7 H16 M2 9.5 H16" stroke="#5a300c" stroke-width=".7" opacity=".5"/></g>'
    +'<path d="M70 18 L90 6 L92 9 L72 20Z" fill="#5a300c" opacity=".7"/><path d="M70 18 L68 21 L72 20Z" fill="#2d1a06"/>',
  chest:()=>artSky('y')+'<g fill="#fff3c0" opacity=".35"><path d="M50 40 L20 0 H34Z M50 40 L46 0 H58Z M50 40 L72 0 H86Z M50 40 L96 14 V26Z M50 40 L4 14 V26Z"/></g>'
    +artHills(56,2,'#b8741f',.9)
    +'<g transform="translate(80 56)"><rect x="-10" y="-9" width="20" height="10" rx="1" fill="#6b3a0e"/><path d="M-10 -9 Q0 -17 10 -9Z" fill="#8a4f16"/><rect x="-10" y="-5" width="20" height="1.6" fill="#e9b24a"/><circle cy="-4" r="1.4" fill="#ffe08a"/></g>'
    +'<g fill="#ffd66b" stroke="#8a4f16" stroke-width=".4"><ellipse cx="66" cy="60" rx="2.4" ry="1.2"/><ellipse cx="70" cy="62" rx="2.4" ry="1.2"/><ellipse cx="92" cy="61" rx="2.4" ry="1.2"/><ellipse cx="14" cy="60" rx="2.4" ry="1.2"/><ellipse cx="18" cy="62.4" rx="2.4" ry="1.2"/></g>',
  millionaire:()=>artSky('y')+artSun(20,16,6,'#fffaf0')
    +'<g fill="#8a4f16" opacity=".75"><rect x="4" y="38" width="10" height="16"/><path d="M4 38 Q9 28 14 38Z"/><rect x="16" y="42" width="8" height="12"/><rect x="26" y="34" width="6" height="20"/><path d="M26 34 L29 28 L32 34Z"/></g>'
    +artHills(54,2,'#c98a38',1)
    +artPerson(82,64,1.25,'#4a2608','top','<path d="M3 -8 L6 0" stroke-width=".8"/><circle cx="6" cy="0" r=".7" stroke="none"/>')
    +'<g fill="#ffd66b" stroke="#8a4f16" stroke-width=".4"><rect x="60" y="56" width="7" height="2" rx="1"/><rect x="60" y="53.6" width="7" height="2" rx="1"/><rect x="60" y="51.2" width="7" height="2" rx="1"/></g>',
  /* ---- jokers (parchment) ---- */
  jack:()=>artSky('x')+artSketch('<path d="M8 58 L26 24" stroke-width="1.4"/><path d="M26 24 Q30 16 34 14 Q30 22 28 26Z"/><path d="M76 14 L92 52" stroke-width="1.2"/><ellipse cx="93" cy="55" rx="3" ry="5" transform="rotate(-22 93 55)"/><circle cx="18" cy="16" r="5"/><circle cx="18" cy="16" r="3"/><path d="M72 60 q6 -8 12 0"/><path d="M4 30 q4 -2 8 0"/>')
    +'<g fill="#7a643a" opacity=".18"><path d="M66 70 Q66 52 78 50 Q90 52 90 70Z"/></g>',
  adventurer:()=>artSky('x')+artSketch('<path d="M0 40 L14 34 L20 44 L30 38"/><path d="M70 38 L82 30 L90 40 L100 34"/><path d="M30 40 Q50 52 70 40" stroke-dasharray="1.6 1.4"/><path d="M34 42 V48 M42 45 V51 M50 46 V52 M58 45 V51 M66 42 V48"/><path d="M4 66 q10 -6 20 0 M76 66 q10 -6 20 0"/>')
    +artPerson(88,34,.9,'rgba(90,70,35,.55)','fedora','<path d="M-3 -9 Q-8 -4 -6 2" fill="none" stroke-width=".7"/>'),
  plane:()=>artSky('x')+artSketch('<path d="M4 60 Q30 40 50 44 T96 20" stroke-dasharray="2 1.6"/><path d="M6 20 H22 M14 12 V28"/><circle cx="14" cy="20" r="6"/><path d="M70 60 q4 -6 8 0 q4 -6 8 0"/>')
    +'<g transform="translate(80 18) rotate(-12)" fill="rgba(90,70,35,.55)"><path d="M-10 0 Q0 -2.6 9 -.6 L11 0 L9 .8 Q0 2 -10 1.2Z"/><rect x="-3" y="-7" width="3" height="14" rx="1"/><rect x="-10" y="-3" width="2" height="4" rx=".6"/><path d="M11 -3 V3" stroke="rgba(90,70,35,.55)" stroke-width=".7"/></g>',
  /* ---- actions (dusk) ---- */
  transmitter:()=>artSky('p')+artStars([[10,8,.6],[24,16,.5],[40,6,.7],[62,12,.5],[92,8,.6]])+artHills(56,3,'#25164a',1)
    +'<g stroke="#140b2b" stroke-width="1" fill="none"><path d="M82 56 L88 18 L94 56 M84 44 H92 M85.4 34 H90.6 M86.6 26 H89.4 M84 44 L90.6 34 M92 44 L85.4 34"/></g>'
    +'<g stroke="#d7c2ff" stroke-width=".7" fill="none" opacity=".6"><path d="M80 14 q-4 4 0 8 M96 14 q4 4 0 8 M76 10 q-7 8 0 16 M100 10 q7 8 0 16"/></g>',
  cartographer:()=>artSky('p')+'<g stroke="#d7c2ff" stroke-width=".4" opacity=".25"><path d="M0 14 H100 M0 28 H100 M0 42 H100 M0 56 H100 M16 0 V70 M32 0 V70 M48 0 V70 M64 0 V70 M80 0 V70"/></g>'
    +'<g transform="translate(14 54)" stroke="#d7c2ff" fill="none" opacity=".5"><circle r="9" stroke-width=".6"/><path d="M0 -12 L2 0 L0 12 L-2 0Z M-12 0 L0 2 L12 0 L0 -2Z" stroke-width=".6"/></g>'
    +'<path d="M70 60 Q76 44 86 40 T96 20" stroke="#ffd66b" stroke-width=".9" stroke-dasharray="1.6 1.4" fill="none" opacity=".7"/>',
  scientist:()=>artSky('p')+artStars([[8,10,.6],[20,20,.5],[88,10,.7],[94,26,.5]])+'<g stroke="#d7c2ff" stroke-width=".4" fill="none" opacity=".35"><path d="M8 10 L20 20 L14 30 M88 10 L94 26 L80 30"/></g>'
    +'<g fill="#8ef0c4" opacity=".45"><circle cx="16" cy="52" r="2"/><circle cx="22" cy="44" r="1.3"/><circle cx="84" cy="50" r="1.6"/><circle cx="90" cy="42" r="1"/><circle cx="12" cy="40" r="1"/></g>'
    +'<g fill="#140b2b"><path d="M76 66 L80 56 V50 H86 V56 L90 66Z"/><rect x="8" y="58" width="16" height="8" rx="1"/><path d="M12 58 L16 46 L20 48 L17 58Z"/></g>',
  compass:()=>artSky('p')+'<g transform="translate(50 36)" stroke="#d7c2ff" fill="none" opacity=".3"><circle r="30" stroke-width=".7"/><circle r="24" stroke-width=".4"/><path d="M0 -34 V34 M-34 0 H34 M-24 -24 L24 24 M24 -24 L-24 24" stroke-width=".4"/></g>'
    +artStars([[8,8,.6],[92,10,.7],[88,60,.5],[10,62,.6]]),
  travellog:()=>artSky('p')+'<g opacity=".3" fill="#f4e7c3"><path d="M4 60 Q12 56 22 58 V26 Q12 24 4 28Z"/><path d="M96 60 Q88 56 78 58 V26 Q88 24 96 28Z"/></g>'
    +'<g stroke="#f4e7c3" stroke-width=".5" opacity=".35"><path d="M7 34 H19 M7 38 H19 M7 42 H17 M81 34 H93 M81 38 H93 M81 42 H90"/></g>'
    +'<path d="M24 64 Q40 56 50 60 T78 54" stroke="#ffd66b" stroke-width=".9" stroke-dasharray="1.6 1.4" fill="none" opacity=".6"/>'+artStars([[30,8,.6],[70,6,.5],[50,14,.4]]),
  native:()=>artSky('p')+artSun(84,14,4,'#f4ecff')+artCanopy(46,'#25164a',1,10)+artPalm(12,56,1.1,'#140b2b')
    +'<path d="M30 70 Q44 60 58 58 T92 52" stroke="#d7c2ff" stroke-width="3" fill="none" opacity=".18"/>'
    +artPerson(86,66,1.15,'#140b2b','none','<path d="M-1 -19.4 L-.6 -23 M.6 -19.4 L1.4 -22.6" stroke-width=".8"/><path d="M3.4 -22 L3.4 1" stroke-width=".8"/><path d="M-2.4 -13 L-8 -15.6" stroke-width="1.1"/>'),
};
export function cardBg(t){const d=CT[t];const f=CARD_BG[t];return f?f():SCENE[d.c];}
