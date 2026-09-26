/* =========================================================
   MEEPLES — four chibi explorer miniatures, one per seat (variant = seat % 4).
   Board units (hex radius 34); the figure stands on a round base centred near (0, 11)
   and fits in about x -15..15, y -28..17. Clothing and base are the player colour
   (with shades mixed in JS); skin, hats and leather stay neutral; a dark outline
   keeps every colour readable on every terrain. Plain paths only (no filters/gradients).
   ========================================================= */
const MEEPLE_INK='#0d110f';
function meepleMix(hex,to,t){
  const n=parseInt(hex.slice(1),16),m=parseInt(to.slice(1),16);
  const ch=s=>{const a=(n>>s)&255,b=(m>>s)&255;return Math.round(a+(b-a)*t);};
  return'#'+((1<<24)|(ch(16)<<16)|(ch(8)<<8)|ch(0)).toString(16).slice(1);
}
const mpE=(tag,a)=>'<'+tag+Object.entries(a).map(([k,v])=>` ${k}="${v}"`).join('')+'/>';
const mpP=(d,fill,sw=1.3,extra={})=>mpE('path',{d,fill,stroke:sw?MEEPLE_INK:'none','stroke-width':sw,'stroke-linejoin':'round',...extra});
const mpDots=(pts,r)=>pts.map(([x,y])=>`M${x-r} ${y}a${r} ${r} 0 1 0 ${2*r} 0a${r} ${r} 0 1 0 ${-2*r} 0`).join('');
// arms as an outlined stroke: dark underlay + colour on top
const mpStroke=(d,col,w)=>mpE('path',{d,fill:'none',stroke:MEEPLE_INK,'stroke-width':w+2.4,'stroke-linecap':'round','stroke-linejoin':'round'})+
  mpE('path',{d,fill:'none',stroke:col,'stroke-width':w,'stroke-linecap':'round','stroke-linejoin':'round'});
const MEEPLE_SKIN=['#f3cba5','#c68a5e','#8a5638','#e7b98f'];
const MEEPLE_HAIR=['#6b4424','#3b2314','#1f1510','#241a17'];

function meepleSVG(color,variant,num){
  const v=((variant|0)%4+4)%4,c=color,dk=meepleMix(c,'#000000',.38),lt=meepleMix(c,'#ffffff',.4);
  const skin=MEEPLE_SKIN[v],hair=MEEPLE_HAIR[v],skinDk=meepleMix(skin,'#5a2a14',.3);
  const woman=v===1||v===3;
  let s='';
  // round base: side band (dark) + top (player colour) + rim highlight
  s+=mpE('ellipse',{cx:0,cy:12.6,rx:12.8,ry:4.9,fill:dk,stroke:MEEPLE_INK,'stroke-width':1.5});
  s+=mpE('ellipse',{cx:0,cy:10.6,rx:12.8,ry:4.5,fill:c,stroke:MEEPLE_INK,'stroke-width':1.3});
  s+=mpE('path',{d:'M-10.2 8.6 Q-4 6.4 3 6.5',fill:'none',stroke:lt,'stroke-width':1.2,'stroke-linecap':'round',opacity:.8});
  // hair behind the head (ponytail / braid, headscarf tails)
  if(v===1)s+=mpP('M-4 -20 Q-10.4 -19 -10.6 -12.6 Q-10.2 -9 -8.2 -7.8 L-6 -13 Z',hair,1.2);
  if(v===3)s+=mpP('M6.5 -17 Q12 -15.5 12.2 -10 Q10.6 -11.2 9.2 -10.6 Q10.5 -8 9.8 -5.6 Q7.4 -8.4 6 -12.5 Z',dk,1.2);
  // legs + boots
  s+=mpP(woman?'M-4.2 5 L-4.1 9.8 L-0.9 9.8 L-0.9 5 Z M0.9 5 L0.9 9.8 L4.1 9.8 L4.2 5 Z':'M-4.8 2 L-4.5 9.8 L-0.9 9.8 L-0.8 2 Z M0.8 2 L0.9 9.8 L4.5 9.8 L4.8 2 Z',woman?'#6d5a45':'#8a7456',1.2);
  s+=mpP('M-5.4 8 Q-5.6 11.4 -3.2 11.4 L-0.6 11.4 L-0.6 8 Z M0.6 8 L0.6 11.4 L3.2 11.4 Q5.6 11.4 5.4 8 Z','#4a3020',1.2);
  // torso in the player colour: shirt (men) / tunic-skirt (women)
  const torso=woman?'M-5.6 -4.8 Q-7.2 1 -8.6 6.4 Q0 8.4 8.6 6.4 Q7.2 1 5.6 -4.8 Q0 -7 -5.6 -4.8 Z'
                   :'M-6.6 -4.6 Q-7.6 0 -6.2 4.4 L6.2 4.4 Q7.6 0 6.6 -4.6 Q0 -7 -6.6 -4.6 Z';
  s+=mpP(torso,c,1.5);
  s+=mpP(woman?'M2.6 -5.6 Q5.6 -5.4 5.6 -4.8 Q7.2 1 8.6 6.4 Q6.4 6.9 4.4 7.1 Q5.4 0 2.6 -5.6 Z':'M2.8 -5.8 Q6 -5.2 6.6 -4.6 Q7.6 0 6.2 4.4 L3.8 4.4 Q5 -1 2.8 -5.8 Z',dk,0);
  // belt / sash
  s+=mpP(woman?'M-6.8 0.4 Q0 2 6.8 0.4 L7.2 2.4 Q0 4 -7.2 2.4 Z':'M-7 1.4 L7 1.4 L6.8 3.6 L-6.8 3.6 Z','#5b3a22',1);
  // arms (sleeves in player colour; rolled sleeves show forearms) + hands
  const armL='M-6 -3.6 Q-9.2 -1 -9.2 3.2',armR=v===3?'M6 -3.6 Q9.6 -1.6 10.2 1.6':'M6 -3.6 Q9.2 -1 9.2 3.2';
  if(v===2){s+=mpStroke(armL+armR,skin,3.3);s+=mpStroke('M-6 -3.6 Q-8.2 -2.2 -8.8 -0.6 M6 -3.6 Q8.2 -2.2 8.8 -0.6',c,3.6);
    s+=mpP('M-10.6 -1.6 L-7 -1 L-7.4 0.6 L-10.9 0 Z M10.6 -1.6 L7 -1 L7.4 0.6 L10.9 0 Z',lt,.9);}
  else s+=mpStroke(armL+armR,c,3.4);
  s+=mpP(mpDots(v===3?[[-9.2,3.6],[10.2,2]]:[[-9.2,3.6],[9.2,3.6]],1.9),skin,1.1);
  // satchel (v0) with strap; lantern (v3); coiled rope (v3)
  if(v===0){s+=mpE('path',{d:'M-5.2 -4.6 L6 2.6',stroke:'#5b3a22','stroke-width':1.5,'stroke-linecap':'round'});
    s+=mpP('M3.6 1.6 L10.4 1.6 L10.4 7 Q10.4 7.8 9.6 7.8 L4.4 7.8 Q3.6 7.8 3.6 7 Z','#9a6636',1.2);
    s+=mpP('M3.6 1.6 L10.4 1.6 L10.2 4.2 Q7 5.2 3.8 4.2 Z','#b88048',1);}
  if(v===3){s+=mpE('circle',{cx:11.8,cy:5.4,r:6,fill:'#ffd66b',opacity:.28});
    s+=mpE('path',{d:'M10.2 2.2 Q10.2 -0.8 11.8 -0.8 Q13.4 -0.8 13.4 2.2',fill:'none',stroke:MEEPLE_INK,'stroke-width':1.1});
    s+=mpP('M9.4 2.2 L14.2 2.2 L13.8 3.4 L13.8 7.6 L14.4 8.8 L9.2 8.8 L9.8 7.6 L9.8 3.4 Z','#5b3a22',1.1);
    s+=mpE('rect',{x:10.6,y:3.6,width:2.4,height:3.8,rx:.8,fill:'#ffe38a'});}
  // neckerchief (v2) / collar
  if(v===2)s+=mpP('M-3.6 -5.8 Q0 -3.4 3.6 -5.8 L1.8 -2.6 L0 -0.6 L-1.8 -2.6 Z',lt,1);
  if(v===1)s+=mpP('M5 -11 Q9.4 -8.6 8.2 -4.6 Q9.6 -2.8 8.4 -0.6 Q9.4 1.4 7.6 3.2 Q6.2 1.4 6.8 -0.6 Q5.4 -2.8 6.4 -4.6 Q4.6 -6.6 4 -8.6 Z M7.6 3.2 L6.6 5.6 M7.6 3.2 L8.8 5.4',hair,1.1)+mpE('path',{d:'M6.4 2.2 L8.8 2.4',stroke:c,'stroke-width':1.6,'stroke-linecap':'round'});
  // head
  s+=mpE('circle',{cx:0,cy:-13,r:8.6,fill:skin,stroke:MEEPLE_INK,'stroke-width':1.5});
  // hair framing the face
  if(v===0)s+=mpP('M-8.2 -15.4 Q-8.6 -11.4 -7 -9.6 L-6.6 -14.6 Z M8.2 -15.4 Q8.6 -11.4 7 -9.6 L6.6 -14.6 Z',hair,0);
  if(v===1)s+=mpP('M-8.2 -16 Q-5 -12.6 -1 -15 Q2.4 -12.8 8.4 -15.6 Q7.6 -19.6 0 -20 Q-7.6 -19.6 -8.2 -16 Z',hair,1);
  if(v===3)s+=mpP('M-8.4 -15 Q-9.4 -9 -6.8 -7 Q-6.4 -11 -5.6 -14 Z M8.4 -15 Q9.4 -9 6.8 -7 Q6.4 -11 5.6 -14 Z',hair,1);
  // face: eyes, blush, smile (beard for v2)
  if(v===2)s+=mpP('M-8.4 -12.6 Q-7.8 -4.4 0 -4 Q7.8 -4.4 8.4 -12.6 Q7 -9.2 4.4 -8.8 Q2.6 -10 0 -9.4 Q-2.6 -10 -4.4 -8.8 Q-7 -9.2 -8.4 -12.6 Z M-1.6 -7.8 Q0 -6.6 1.6 -7.8','#4a2e1c',1.1);
  s+=mpE('path',{d:mpDots([[-3.1,-12.6],[3.1,-12.6]],1.25),fill:MEEPLE_INK});
  s+=mpE('path',{d:mpDots([[-2.7,-13.1],[3.5,-13.1]],.42),fill:'#ffffff'});
  if(v!==2){s+=mpE('path',{d:mpDots([[-5.2,-10.2],[5.2,-10.2]],1.4),fill:'#ff7a7a',opacity:.4});
    s+=mpE('path',{d:'M-1.6 -9.6 Q0 -8.2 1.6 -9.6',fill:'none',stroke:skinDk,'stroke-width':1,'stroke-linecap':'round'});}
  // hats
  if(v===0){ // pith helmet
    s+=mpE('ellipse',{cx:0,cy:-16.6,rx:12,ry:2.8,fill:'#d6c49a',stroke:MEEPLE_INK,'stroke-width':1.3});
    s+=mpP('M-8.4 -17 Q-8.8 -27 0 -27.2 Q8.8 -27 8.4 -17 Q0 -15.6 -8.4 -17 Z','#eadfbf',1.4);
    s+=mpP('M-8.5 -18.2 Q0 -16.6 8.5 -18.2 L8.2 -20.4 Q0 -19 -8.2 -20.4 Z',dk,.9);
    s+=mpE('path',{d:'M-5 -24.4 Q-2.6 -26.2 0.6 -26.2',fill:'none',stroke:'#ffffff','stroke-width':1.3,'stroke-linecap':'round',opacity:.75});}
  if(v===1){ // wide straw hat with a colour band
    s+=mpP('M-14 -17.2 Q-13 -21.4 0 -21.2 Q13 -21.4 14 -17.2 Q13 -14.4 0 -14.8 Q-13 -14.4 -14 -17.2 Z','#dcb46a',1.4);
    s+=mpP('M-6.8 -19 Q-6.6 -26 0 -26.2 Q6.6 -26 6.8 -19 Q0 -17.6 -6.8 -19 Z','#caa052',1.4);
    s+=mpP('M-6.9 -19.2 Q0 -17.8 6.9 -19.2 L6.8 -21.4 Q0 -20 -6.8 -21.4 Z',c,.9);}
  if(v===2){ // fedora
    s+=mpP('M-12 -17.2 Q-12.4 -19.8 0 -19.6 Q12.4 -19.8 12 -17.2 Q11 -15.6 0 -16 Q-11 -15.6 -12 -17.2 Z','#6e4a2c',1.4);
    s+=mpP('M-7 -18.6 L-6.2 -25 Q-3 -26.8 0 -24.6 Q3 -26.8 6.2 -25 L7 -18.6 Q0 -17.4 -7 -18.6 Z','#86603b',1.4);
    s+=mpP('M-7 -18.8 Q0 -17.6 7 -18.8 L6.8 -20.8 Q0 -19.6 -6.8 -20.8 Z','#2b1d12',0);}
  if(v===3){ // headscarf in the player colour, knotted at the side
    s+=mpP('M-9 -13.8 Q-10 -23.6 0 -23.8 Q10 -23.6 9 -13.8 Q8 -17.6 0 -18 Q-8 -17.6 -9 -13.8 Z',c,1.4);
    s+=mpP('M-6 -21.2 Q0 -23.4 6 -21.2',lt,0,{fill:'none',stroke:lt,'stroke-width':1.2,'stroke-linecap':'round',opacity:.8});
    s+=mpP(mpDots([[7.6,-17]],2),dk,1.1);}
  if(num){s+=mpE('circle',{cx:-9.6,cy:12.2,r:4.6,fill:MEEPLE_INK,stroke:lt,'stroke-width':1});
    s+=`<text x="-9.6" y="14.6" text-anchor="middle" font-size="7" font-weight="800" fill="#fff" font-family="Figtree, sans-serif">${num}</text>`;}
  return s;
}
