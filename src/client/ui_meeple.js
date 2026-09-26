/* =========================================================
   MEEPLES — four explorer figures, one per player colour (crimson, ivory, violet, orange):
   0 man in a pith helmet, 1 woman in a wide-brim hat, 2 bearded man in a fedora,
   3 woman in a headscarf with a lantern. Three angular design languages (style):
     'carved' faceted low-poly wooden figurines, flat-shaded planes
     'standee' travel-poster cut-out silhouettes in a pose, on a slotted base
     'idol'   frontal stepped glyph figures with gold inlay, on a ziggurat base
   Board units (hex radius 34); feet/base centred near (0, 11), about 30 × 44 units.
   The whole figure is made of the player colour (shades mixed in JS); dark outline for every terrain.
   Plain polygons/paths only — no filters, no gradients.
   ========================================================= */
const MEEPLE_STYLE='standee';
const MEEPLE_INK='#0d110f';
const MEEPLE_GOLD='@l2';
function meepleMix(hex,to,t){
  const n=parseInt(hex.slice(1),16),m=parseInt(to.slice(1),16);
  const ch=s=>{const a=(n>>s)&255,b=(m>>s)&255;return Math.round(a+(b-a)*t);};
  return'#'+((1<<24)|(ch(16)<<16)|(ch(8)<<8)|ch(0)).toString(16).slice(1);
}
const mpE=(tag,a)=>'<'+tag+Object.entries(a).map(([k,v])=>` ${k}="${v}"`).join('')+'/>';
// polygon / path with a crisp mitred outline (sw 0 = no outline)
const mpG=(pts,fill,sw=1.2,x={})=>mpE('polygon',{points:pts,fill,stroke:sw?MEEPLE_INK:'none','stroke-width':sw,'stroke-linejoin':'miter','stroke-miterlimit':6,...x});
const mpA=(d,fill,sw=1.2,x={})=>mpE('path',{d,fill,stroke:sw?MEEPLE_INK:'none','stroke-width':sw,'stroke-linejoin':'miter','stroke-miterlimit':6,...x});
const mpLine=(d,col,w,x={})=>mpE('path',{d,fill:'none',stroke:col,'stroke-width':w,'stroke-linecap':'square','stroke-linejoin':'miter',...x});
function meepleBadge(num,lt,x,y){
  if(!num)return'';
  const r=4.8,p=[0,1,2,3,4,5].map(i=>{const a=Math.PI/3*i+Math.PI/6;return(x+r*Math.cos(a)).toFixed(2)+','+(y+r*Math.sin(a)).toFixed(2);}).join(' ');
  return mpG(p,MEEPLE_INK,1,{stroke:lt})+`<text x="${x}" y="${y+2.5}" text-anchor="middle" font-size="7" font-weight="800" fill="#fff" font-family="Figtree, sans-serif">${num}</text>`;
}

/* ---------- A: carved, faceted wooden figurine ---------- */
function meepleCarved(v,K){
  const{c,lt,dk,dk2,skin,skinDk,hair}=K,woman=v===1||v===3;let s='';
  // hexagonal prism base: sides (3 shaded facets) + top (2 facets)
  s+=mpG('-12.5,10.5 -6.5,14.2 6.5,14.2 12.5,10.5 12.5,13.8 6.5,17.5 -6.5,17.5 -12.5,13.8',dk2,1.4);
  s+=mpG('-12.5,10.5 -6.5,14.2 -6.5,17.5 -12.5,13.8',meepleMix(c,'#000000',.18),0);
  s+=mpG('-6.5,14.2 6.5,14.2 6.5,17.5 -6.5,17.5',dk,0);
  s+=mpG('-12.5,10.5 -6.5,6.8 6.5,6.8 12.5,10.5 6.5,14.2 -6.5,14.2',c,1.2);
  s+=mpG('-12.5,10.5 -6.5,6.8 6.5,6.8 12.5,10.5',lt,0);
  // headscarf tails behind (v3)
  if(v===3)s+=mpG('5.6,-18 12,-14.8 9.4,-13.8 11.2,-10.4 6,-13.4','@d2',1.1);
  // legs + boots
  s+=mpA(woman?'M-4.4 6 L-0.8 6 L-1 10.2 L-4.2 10.2 Z M0.8 6 L4.4 6 L4.2 10.2 L1 10.2 Z':'M-5.2 3.6 L-0.8 3.6 L-1 10.2 L-4.6 10.2 Z M0.8 3.6 L5.2 3.6 L4.6 10.2 L1 10.2 Z','@d1',1.1);
  s+=mpA('M-5 8.2 L-0.8 8.2 L-0.8 11.6 L-6 11.6 Z M0.8 8.2 L5 8.2 L6 11.6 L0.8 11.6 Z','@d3',1.1);
  // arms (rolled sleeves on v2 show skin forearms)
  const aL='-7,-5.2 -10.4,3 -8,3.8 -5.4,-1.6',aR='7,-5.2 10.4,3 8,3.8 5.4,-1.6';
  if(v===2){s+=mpG(aL,skin,1.1)+mpG(aR,skinDk,1.1)+mpG('-7,-5.2 -8.8,-0.6 -6.2,0.2 -5.4,-1.6',lt,1.1)+mpG('7,-5.2 8.8,-0.6 6.2,0.2 5.4,-1.6',dk,1.1);}
  else s+=mpG(aL,lt,1.1)+mpG(aR,dk,1.1);
  s+=mpA('M-10.6 3 L-8.8 2 L-7.4 3.8 L-9.2 5.4 Z M10.6 3 L8.8 2 L7.4 3.8 L9.2 5.4 Z',skin,1);
  // torso: silhouette + light/dark planes
  if(woman){s+=mpG('-6,-5.2 -2.4,-6.4 2.4,-6.4 6,-5.2 5,-0.5 8.8,7.6 -8.8,7.6 -5,-0.5',c,1.4);
    s+=mpG('-6,-5.2 -2.4,-6.4 -1.8,-0.5 -3.2,7.6 -8.8,7.6 -5,-0.5',lt,0)+mpG('6,-5.2 2.4,-6.4 1.8,-0.5 3.2,7.6 8.8,7.6 5,-0.5',dk,0);
    s+=mpG('-5.3,-1.8 5.3,-1.8 5,0.4 -5,0.4','@d2',1);}
  else{s+=mpG('-7,-5.2 -2.6,-6.4 2.6,-6.4 7,-5.2 6,4.6 -6,4.6',c,1.4);
    s+=mpG('-7,-5.2 -2.6,-6.4 -1.8,4.6 -6,4.6',lt,0)+mpG('7,-5.2 2.6,-6.4 1.8,4.6 6,4.6',dk,0);
    s+=mpG('-6.3,1.4 6.3,1.4 6.1,3.4 -6.1,3.4','@d2',1);}
  // props
  if(v===0){s+=mpLine('M-5.2 -5 L6 1.2','@d2',1.4);s+=mpG('3.8,1 10.6,1 10.4,7.8 4,7.8','@d1',1.1)+mpG('3.8,1 10.6,1 10.2,4.2 7.2,5.2 4.2,4.2','@c',.9);}
  if(v===1)s+=mpG('4,-10.4 7.6,-8.4 6.6,-5.8 8.4,-3.6 7.2,-1 8.6,1.6 7.2,4 5.8,1.6 6.2,-1 5,-3.6 5.4,-6',hair,1)+mpG('5.8,1.8 8.4,1.8 8.2,3.2 6,3.2',c,.8);
  if(v===2)s+=mpG('-3.2,-6.4 3.2,-6.4 0,-2',lt,1);
  if(v===3){s+=mpG('9.2,-1.4 13.6,3.4 9.2,11.4 4.8,3.4','#ffd66b',0,{opacity:.35});
    s+=mpLine('M7.8 3 L9.2 1 L10.6 3',MEEPLE_INK,.9);
    s+=mpG('7.4,3.2 11,3.2 11.8,5 11.4,9.2 7,9.2 6.6,5','@d2',1.1)+mpG('8.4,4.6 10,4.6 10.5,6 10.1,8 8.3,8 7.9,6','#ffe38a',0);}
  // head: faceted skin block, dark right plane
  s+=mpG('-6.2,-17.5 -5.2,-20.5 5.2,-20.5 6.2,-17.5 5.4,-10.6 2.4,-7.2 -2.4,-7.2 -5.4,-10.6',skin,1.4);
  s+=mpG('1,-20.5 5.2,-20.5 6.2,-17.5 5.4,-10.6 2.4,-7.2 0.6,-7.2 1.6,-12.4',skinDk,0);
  if(v===0)s+=mpG('-6.2,-16 -6.6,-11.8 -5.4,-10.6 -5.2,-15',hair,0)+mpG('6.2,-16 6.6,-11.8 5.4,-10.6 5.2,-15',hair,0);
  if(v===1||v===3)s+=mpA('M-6.2,-16 L-7.6,-9.2 L-5.2,-10.4 L-5,-15 Z M6.2,-16 L7.6,-9.2 L5.2,-10.4 L5,-15 Z',hair,1);
  if(v===2)s+=mpG('-5.6,-11.4 -2.6,-9.4 -1.2,-10.4 1.2,-10.4 2.6,-9.4 5.6,-11.4 5.2,-10.2 2.4,-6.2 -2.4,-6.2 -5.2,-10.2','@d2',1.1);
  s+=mpA('M-3.8 -13.6 h2.2 v1.2 h-2.2 Z M1.6 -13.6 h2.2 v1.2 h-2.2 Z',MEEPLE_INK,0);
  // hats
  if(v===0){s+=mpG('-8,-17.2 -7,-22.4 -3,-26.2 3,-26.2 7,-22.4 8,-17.2','@l1',1.4);
    s+=mpG('-8,-17.2 -7,-22.4 -3,-26.2 -1.6,-17.2','@l2',0)+mpG('3,-26.2 7,-22.4 8,-17.2 2,-17.2','@c',0);
    s+=mpG('-8,-17.4 8,-17.4 7.8,-19.6 -7.8,-19.6',dk,.9);
    s+=mpG('-11.6,-17.2 11.6,-17.2 8.6,-14.8 -8.6,-14.8','@l1',1.2);}
  if(v===1){s+=mpG('-6.4,-17 -5.4,-23.6 5.4,-23.6 6.4,-17','@l1',1.3)+mpG('1.4,-23.6 5.4,-23.6 6.4,-17 1.6,-17','@c',0);
    s+=mpG('-6.3,-17.2 6.3,-17.2 6.1,-19.4 -6.1,-19.4',c,.9);
    s+=mpG('-14.6,-17.2 14.6,-17.2 11,-14.4 -11,-14.4','@l1',1.3)+mpG('0,-17.2 14.6,-17.2 11,-14.4 0,-14.4','@c',0);}
  if(v===2){s+=mpG('-6.6,-17.2 -5.8,-23.8 -1.6,-25 0,-23.4 1.6,-25 5.8,-23.8 6.6,-17.2','@d1',1.3)+mpG('0,-23.4 1.6,-25 5.8,-23.8 6.6,-17.2 0.6,-17.2','@d2',0);
    s+=mpG('-6.5,-17.2 6.5,-17.2 6.3,-19.2 -6.3,-19.2','@d3',0);
    s+=mpG('-12.4,-18.8 -9,-16.8 9,-16.8 12.4,-18.8 9.6,-15 -9.6,-15','@d1',1.3);}
  if(v===3){s+=mpG('-6.8,-15.4 -6.2,-21 -2.6,-23.6 3,-23.6 6.6,-21 7,-15.4 4.8,-18.2 -4.8,-18.2','@d1',1.3);
    s+=mpG('1,-23.6 3,-23.6 6.6,-21 7,-15.4 4.8,-18.2 1.6,-18.2','@d2',0)+mpG('-6.2,-21 -2.6,-23.6 -0.6,-23.6 -4.8,-18.2 -6.8,-15.4',c,0)+mpLine('M-5.4 -19.4 L0 -21.8 L5.4 -19.4','@l1',.9);
    s+=mpG('5.2,-19 8,-17.6 6.8,-15 4.6,-16.2',dk2,1);}
  return s+meepleBadge(K.num,lt,-10.6,12.6);
}

/* ---------- B: travel-poster silhouette standee ---------- */
const MEEPLE_STANDEE=[
  { // 0 pith helmet, pointing the way, satchel
    body:'M-2.8 -3 L2.8 -3 L5 9 L2.4 9 L0 1.6 L-2.2 9 L-4.8 9 Z M-3.4 -13 L3.2 -13 L3 -2.6 L-3 -2.6 Z M-1 -19.8 L1.8 -19.8 L3.6 -18 L3.6 -15.2 L1.8 -13.4 L-1 -13.4 L-2.8 -15.2 L-2.8 -18 Z M2 -13 L11.8 -15.8 L12.3 -14.2 L3.4 -10.4 Z M-3.4 -13 L-5 -5.6 L-3.4 -5.2 L-2 -10 Z M-4 -18.4 L-2.8 -21.6 L0.4 -23 L3.6 -21.6 L4.8 -18.4 Z M-5.8 -18.6 L6.6 -18.6 L5.8 -17.2 L-5 -17.2 Z',
    face:'M-1 -17.2 L1.8 -17.2 L3.6 -17.2 L3.6 -15.2 L1.8 -13.4 L-1 -13.4 L-2.8 -15.2 L-2.8 -17.2 Z',
    hat:['M-4 -18.4 L-2.8 -21.6 L0.4 -23 L3.6 -21.6 L4.8 -18.4 Z M-5.8 -18.6 L6.6 -18.6 L5.8 -17.2 L-5 -17.2 Z','@l1'],
    extra:K=>mpLine('M2.6 -12.6 L-4.4 -5.6','@d2',1)+mpG('-7,-6.4 -2.8,-6.4 -3,-1.8 -6.8,-1.8','@d1',1)+mpG('-3.4,-19.2 5.2,-19.2 5.2,-18.4 -4,-18.4',K.dk,0)},
  { // 1 wide-brim hat, braid, reading a map
    body:'M-2.8 -13 L2.8 -13 L2.4 -5.6 L5.8 9 L-5.8 9 L-2.4 -5.6 Z M-1.4 -19.8 L1.4 -19.8 L3.2 -18 L3.2 -15.2 L1.4 -13.4 L-1.4 -13.4 L-3.2 -15.2 L-3.2 -18 Z M-2.4 -16.4 L-4.4 -14.4 L-3.6 -12.4 L-5 -10.2 L-4 -8.2 L-4.8 -6 L-3 -8 L-2.4 -10.2 L-1.8 -12.4 Z M-2.8 -12.6 L-5.8 -8.4 L-4 -6.6 L-2 -9.8 Z M2.8 -12.6 L6.4 -8.8 L4.8 -6.8 L2 -9.8 Z M-9.4 -18.8 L9.4 -18.8 L7.6 -17.2 L-7.6 -17.2 Z M-3.4 -18.8 L-2.8 -22.6 L2.8 -22.6 L3.4 -18.8 Z',
    face:'M-3.2 -17.2 L3.2 -17.2 L3.2 -15.2 L1.4 -13.4 L-1.4 -13.4 L-3.2 -15.2 Z',
    hat:['M-9.4 -18.8 L9.4 -18.8 L7.6 -17.2 L-7.6 -17.2 Z M-3.4 -18.8 L-2.8 -22.6 L2.8 -22.6 L3.4 -18.8 Z','@l1'],
    extra:K=>mpG('-3.3,-18.8 3.3,-18.8 3.1,-20.2 -3.1,-20.2',K.c,0)+mpG('-6.6,-10 0,-11 6.8,-10 6.2,-5.2 0,-6.2 -6,-5.2','@l2',1)+mpLine('M0 -11 L0 -6.2',MEEPLE_INK,.6)+mpLine('M-4.6 -6.8 L-2.2 -8.8 L2 -7.6 L4.6 -9',K.dk,.9,{'stroke-dasharray':'1.4 1'})},
  { // 2 fedora, beard, machete raised
    body:'M-2.8 -3 L2.8 -3 L5.8 9 L3.2 9 L0 1 L-3.2 9 L-5.8 9 Z M-3.4 -13 L3.4 -13 L3 -2.6 L-3 -2.6 Z M-1.4 -19.8 L1.4 -19.8 L3.2 -18 L3.2 -15.2 L2.2 -12.4 L0 -11.6 L-2.2 -12.4 L-3.2 -15.2 L-3.2 -18 Z M2.2 -13 L7.4 -20.6 L8.9 -19.6 L3.8 -10.8 Z M-3.4 -13 L-6.8 -8.6 L-3.2 -5.2 L-2.6 -6.8 L-4.4 -8.6 L-2.6 -10.8 Z M-6 -18.4 L6 -18.4 L5.2 -17.2 L-5.2 -17.2 Z M-3.2 -18.4 L-2.8 -22 L-0.8 -22.8 L0 -22 L0.8 -22.8 L2.8 -22 L3.2 -18.4 Z',
    face:'M-3.2 -17.2 L3.2 -17.2 L3.2 -15.2 L2.2 -12.4 L0 -11.6 L-2.2 -12.4 L-3.2 -15.2 Z',
    hat:['M-6 -18.4 L6 -18.4 L5.2 -17.2 L-5.2 -17.2 Z M-3.2 -18.4 L-2.8 -22 L-0.8 -22.8 L0 -22 L0.8 -22.8 L2.8 -22 L3.2 -18.4 Z','@d1'],
    extra:K=>mpG('-3.2,-14.8 -1.4,-13.6 1.4,-13.6 3.2,-14.8 2.2,-12.4 0,-11.6 -2.2,-12.4','@d2',0)+mpG('-3.1,-18.4 3.1,-18.4 3,-19.4 -3,-19.4','@d3',0)
      +mpG('8.2,-20.8 9.2,-21.6 12.2,-26.8 13.6,-26 11.6,-22 9.8,-19.8','@l2',1)+mpG('7.2,-19.6 8.4,-21 9.8,-19.8 8.6,-18.4','@d2',.8)},
  { // 3 headscarf, lantern held high
    body:'M-2.6 -2.6 L2.6 -2.6 L3.2 9 L0.8 9 L0 1 L-0.8 9 L-3.2 9 Z M-3 -13 L3 -13 L4.2 -1.6 L-4.2 -1.6 Z M-1.4 -19.8 L1.4 -19.8 L3.2 -18 L3.2 -15.2 L1.4 -13.4 L-1.4 -13.4 L-3.2 -15.2 L-3.2 -18 Z M-2.6 -13 L-8.2 -18.2 L-7.2 -19.4 L-1 -11.8 Z M3 -13 L5 -5.4 L3.6 -5 L2 -10.4 Z M-3.8 -16.2 L-3.4 -19.8 L-1 -21.6 L1.6 -21.6 L3.8 -19.8 L4.2 -16.6 L8.4 -14.4 L6.6 -13.8 L7.8 -11.2 L3.4 -14.8 Z',
    face:'M-3.2 -17.4 L3.2 -17.4 L3.2 -15.2 L1.4 -13.4 L-1.4 -13.4 L-3.2 -15.2 Z',
    hat:['M-3.8 -16.2 L-3.4 -19.8 L-1 -21.6 L1.6 -21.6 L3.8 -19.8 L4.2 -16.6 L8.4 -14.4 L6.6 -13.8 L7.8 -11.2 L3.4 -14.8 L3.2 -17.4 L-3.2 -17.4 Z','dk'],
    extra:K=>mpG('-7.8,-19.6 -3.6,-14.8 -7.8,-10 -12,-14.8','#ffd66b',0,{opacity:.45})+mpG('-9.9,-17.2 -5.7,-17.2 -7.8,-19.2','@d2',1)+mpG('-9.6,-17.2 -6,-17.2 -5.6,-15.4 -6,-12.2 -9.6,-12.2 -10,-15.4','@d2',1)
      +mpG('-8.7,-16.2 -6.9,-16.2 -6.7,-15.2 -6.9,-13.2 -8.7,-13.2 -8.9,-15.2','#ffe38a',0)},
];
function meepleStandee(v,K){
  const{c,lt,dk,dk2,skin}=K,P=MEEPLE_STANDEE[v];let s='';
  // slotted slab base
  s+=mpG('-13.6,12 13.6,12 13.6,15.6 -13.6,15.6',dk,1.4);
  s+=mpG('-11.6,8.4 11.6,8.4 13.6,12 -13.6,12',c,1.2);
  s+=mpG('-11.6,8.4 11.6,8.4 12.2,9.6 -12.2,9.6',lt,0);
  s+=mpLine('M-7 10.6 L7 10.6',MEEPLE_INK,1.3);
  // figure: card thickness, outline, colour face, then painted details
  let f=mpA(P.body,dk2,2.2,{transform:'translate(1.3 .5)','stroke-linejoin':'round'});
  f+=mpA(P.body,MEEPLE_INK,2.2);
  f+=mpA(P.body,c,0);
  f+=mpA(P.face,skin,0);
  f+=mpA(P.hat[0],P.hat[1]==='dk'?dk:P.hat[1],0);
  f+=P.extra(K);
  s+=`<g transform="translate(0 10.6) scale(1.24) translate(0 -9)">${f}</g>`;
  return s+meepleBadge(K.num,lt,-10.2,13.6);
}

/* ---------- C: stepped glyph idol with gold inlay ---------- */
function meepleIdol(v,K){
  const{c,lt,dk,dk2,skin,skinDk,hair}=K,G=MEEPLE_GOLD,woman=v===1||v===3;let s='';
  // ziggurat base: lower step dark, upper step player colour, gold lip
  s+=mpG('-13.4,12.4 13.4,12.4 13.4,16.6 -13.4,16.6',dk,1.4);
  s+=mpG('-10,8.2 10,8.2 10,12.4 -10,12.4',c,1.3);
  s+=mpG('-10,8.2 10,8.2 10,9.4 -10,9.4',G,0)+mpG('-13.4,12.4 13.4,12.4 13.4,13.4 -13.4,13.4','@l1',0);
  // tails / braids behind the head
  if(v===1)s+=mpA('M-8.6 -15 h2.6 v2.6 h-2.6 Z M-8.6 -11.6 h2.6 v2.6 h-2.6 Z M-8.6 -8.2 h2.6 v2.6 h-2.6 Z M6 -15 h2.6 v2.6 h-2.6 Z M6 -11.6 h2.6 v2.6 h-2.6 Z M6 -8.2 h2.6 v2.6 h-2.6 Z',hair,1);
  // legs
  s+=mpA('M-4.4 4 h3.4 v4.4 h-3.4 Z M1 4 h3.4 v4.4 h-3.4 Z','@d3',1.1);
  // arms: blocks at the sides, hands square
  s+=mpA('M-10.2 -5.4 h2.8 v8 h-2.8 Z M7.4 -5.4 h2.8 v8 h-2.8 Z',dk,1.1);
  s+=mpA('M-10.2 2.6 h2.8 v2.6 h-2.8 Z M7.4 2.6 h2.8 v2.6 h-2.8 Z',v===2?skin:skin,1);
  if(v===2)s+=mpA('M-10.2 -1.4 h2.8 v4 h-2.8 Z M7.4 -1.4 h2.8 v4 h-2.8 Z',skin,1);
  // body: stepped shoulders, tunic flares for women
  s+=mpG(woman?'-7.6,-6.4 7.6,-6.4 7.6,-3.6 6,-3.6 7.6,5.4 -7.6,5.4 -6,-3.6 -7.6,-3.6':'-7.6,-6.4 7.6,-6.4 7.6,-3.6 6,-3.6 5.6,4.4 -5.6,4.4 -6,-3.6 -7.6,-3.6',c,1.4);
  s+=mpG(woman?'2.4,-6.4 7.6,-6.4 7.6,-3.6 6,-3.6 7.6,5.4 3.4,5.4':'2.4,-6.4 7.6,-6.4 7.6,-3.6 6,-3.6 5.6,4.4 2.6,4.4',dk,0);
  // gold inlay: chevron band on the chest + belt
  s+=mpLine('M-5.6 -3.2 L-2.8 -0.8 L0 -3.2 L2.8 -0.8 L5.6 -3.2',G,1.3,{'stroke-linecap':'butt'});
  s+=mpG('-6,1 6,1 6,2.6 -6,2.6',G,.8);
  // props
  if(v===0)s+=mpG('-4,-6.4 -2,-6.4 5.4,1 3.4,1','@d2',0)+mpG('3.2,0 8.6,0 8.6,5.2 3.2,5.2','@d1',1)+mpG('3.2,0 8.6,0 8.6,2 5.9,3 3.2,2','@c',.8);
  if(v===2)s+=mpG('-3.4,-6.4 3.4,-6.4 0,-2.6',lt,1);
  if(v===3){s+=mpG('12.2,-1.4 16.4,3.6 12.2,8.6 8,3.6','#ffd66b',0,{opacity:.4});
    s+=mpG('10.4,0.4 14,0.4 14,6.6 10.4,6.6','@d2',1)+mpG('11.3,1.6 13.1,1.6 13.1,5.4 11.3,5.4',G,0)+mpLine('M10.8 0.4 L12.2 -1.2 L13.6 0.4',MEEPLE_INK,.9);}
  // head: chamfered square, dark right half, bar eyes
  s+=mpG('-6.2,-17.4 6.2,-17.4 6.2,-10 4,-7.2 -4,-7.2 -6.2,-10',skin,1.4);
  s+=mpG('0,-17.4 6.2,-17.4 6.2,-10 4,-7.2 0,-7.2',skinDk,0);
  if(v===2)s+=mpA('M-6.2 -11 L-3 -11 L-3 -9.2 L3 -9.2 L3 -11 L6.2 -11 L6.2 -10 L4 -6.4 L-4 -6.4 L-6.2 -10 Z','@d2',1.1);
  s+=mpA('M-4.4 -13.8 h2.8 v1.3 h-2.8 Z M1.6 -13.8 h2.8 v1.3 h-2.8 Z',MEEPLE_INK,0);
  if(v!==2)s+=mpLine('M-1.4 -9.8 L1.4 -9.8',skinDk,.9);
  // headgear
  if(v===0){s+=mpG('-4.2,-26.4 4.2,-26.4 4.2,-23.6 6.8,-23.6 6.8,-19.8 9.6,-19.8 9.6,-16.8 -9.6,-16.8 -9.6,-19.8 -6.8,-19.8 -6.8,-23.6 -4.2,-23.6','@l1',1.3);
    s+=mpG('0,-26.4 4.2,-26.4 4.2,-23.6 6.8,-23.6 6.8,-19.8 9.6,-19.8 9.6,-16.8 0,-16.8','@c',0)+mpG('-6.8,-19.8 6.8,-19.8 6.8,-18.4 -6.8,-18.4',c,0);}
  if(v===1){s+=mpG('-5,-18.4 -4,-24.2 4,-24.2 5,-18.4','@l1',1.3)+mpG('-4.9,-18.6 4.9,-18.6 4.7,-20.2 -4.7,-20.2',c,0);
    s+=mpG('-13.6,-18.6 13.6,-18.6 13.6,-16.4 -13.6,-16.4','@l1',1.3)+mpG('0,-18.6 13.6,-18.6 13.6,-16.4 0,-16.4','@c',0);}
  if(v===2){s+=mpG('-5.4,-18 -5,-24.6 -1.4,-24.6 0,-23 1.4,-24.6 5,-24.6 5.4,-18','@d1',1.3)+mpG('0,-23 1.4,-24.6 5,-24.6 5.4,-18 0,-18','@d2',0);
    s+=mpG('-10.6,-18.8 10.6,-18.8 10.6,-16.6 -10.6,-16.6','@d1',1.3)+mpG('-5.3,-18.8 5.3,-18.8 5.3,-20.4 -5.3,-20.4','@d3',0);}
  if(v===3){s+=mpG('-7.4,-8 -7.4,-18.6 -3.6,-23 3.6,-23 7.4,-18.6 7.4,-8 5.4,-8 5.4,-15.6 -5.4,-15.6 -5.4,-8',c,1.3);
    s+=mpG('0,-23 3.6,-23 7.4,-18.6 7.4,-8 5.4,-8 5.4,-15.6 0,-15.6',dk,0)+mpLine('M-6.2 -17.2 L0 -21 L6.2 -17.2',G,1.1,{'stroke-linecap':'butt'});}
  return s+meepleBadge(K.num,lt,-10.4,14.2);
}

// one explorer per colour; an unknown colour hashes to one of the four
const MEEPLE_BY_COLOR={'#e5484d':0,'#efe9dc':1,'#9d7df7':2,'#ff9636':3};
function meepleVariant(color){
  const k=String(color).toLowerCase();if(k in MEEPLE_BY_COLOR)return MEEPLE_BY_COLOR[k];
  let h=0;for(const ch of k)h=(h*31+ch.charCodeAt(0))>>>0;return h%4;
}
// The art is drawn in roles; every role is a shade of the player colour, so the whole
// figure is made of its colour (like a miniature cast in one resin). Roles: l2 l1 c d1 d2 d3.
function meepleSVG(color,num,style,variant){
  const c=/^#[0-9a-f]{6}$/i.test(color)?color:'#9aa39c',v=variant==null?meepleVariant(c):((variant|0)%4+4)%4;
  const P={l2:meepleMix(c,'#ffffff',.55),l1:meepleMix(c,'#ffffff',.28),c,d1:meepleMix(c,'#000000',.3),d2:meepleMix(c,'#000000',.5),d3:meepleMix(c,'#000000',.68)};
  const K={c,num,lt:P.l1,dk:P.d1,dk2:P.d2,skin:P.l2,skinDk:P.l1,hair:P.d2};
  const st=style||MEEPLE_STYLE;
  const s=st==='carved'?meepleCarved(v,K):st==='idol'?meepleIdol(v,K):meepleStandee(v,K);
  return s.replace(/@(l2|l1|c|d1|d2|d3)\b/g,(_,k)=>P[k]);
}
