/* Card faces: the same markup for the hand, the market, the piles and other players' turn feed. */
import { CT, SYMNAME, plural } from '../engine.gen.js';
import { esc } from './dom.js';
import { cardBg } from './art.js';
export function icon(sym,cls){return `<svg class="${cls||''}" viewBox="-10 -10 20 20"><use href="#i-${sym==='*'?'x':sym}" x="-10" y="-10" width="20" height="20"/></svg>`;}
const GLYPH={
 transmitter:`<g stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"><path d="M0 -4 L-6 10 M0 -4 L6 10 M-3.6 4 H3.6 M-4.8 7 H4.8"/><path d="M-4.5 -8 Q-7 -4 -4.5 0 M4.5 -8 Q7 -4 4.5 0 M-8 -10.5 Q-12 -4 -8 2.5 M8 -10.5 Q12 -4 8 2.5"/></g><circle cy="-4" r="1.8" fill="#fff"/>`,
 cartographer:`<path d="M-10 -7 L-3.5 -9.5 L3.5 -7 L10 -9.5 V7 L3.5 9.5 L-3.5 7 L-10 9.5Z" fill="#f4e7c3" stroke="#6b4c1a" stroke-width=".8"/><path d="M-3.5 -9.5 V7 M3.5 -7 V9.5" stroke="#6b4c1a" stroke-width=".7"/><path d="M-7 3 Q-4 -3 0 0 T7 -4" stroke="#b33" stroke-width="1.1" fill="none" stroke-dasharray="1.6 1.2"/><path d="M5.5 -5.5 l2.4 2.4 M7.9 -5.5 l-2.4 2.4" stroke="#b33" stroke-width="1.1"/>`,
 scientist:`<path d="M-3 -10 H3 M-2 -10 V-3 L-8 8 Q-8.6 10 -6.4 10 H6.4 Q8.6 10 8 8 L2 -3 V-10" fill="#e8f4ff" fill-opacity=".25" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/><path d="M-5.6 4 H5.6 L7.4 8.2 Q7.6 9 6.6 9 H-6.6 Q-7.6 9 -7.4 8.2Z" fill="#8ef0c4"/><circle cx="-1" cy="1" r="1" fill="#8ef0c4"/><circle cx="1.5" cy="-2" r=".7" fill="#8ef0c4"/>`,
 compass:`<circle r="10" fill="#e9c46a" stroke="#6b4c1a" stroke-width="1"/><circle r="7.6" fill="#fff8e6"/><path d="M0 -7 L2 0 L0 7 L-2 0Z" fill="#b33"/><path d="M0 0 L2 0 L0 7 L-2 0Z" fill="#334"/><circle r="1.1" fill="#6b4c1a"/>`,
 travellog:`<path d="M-9 -8 Q-4.5 -9.6 0 -7.4 Q4.5 -9.6 9 -8 V8 Q4.5 6.4 0 8.6 Q-4.5 6.4 -9 8Z" fill="#f4e7c3" stroke="#6b4c1a" stroke-width=".9"/><path d="M0 -7.4 V8.6" stroke="#6b4c1a" stroke-width=".8"/><path d="M-7 -4 H-2 M-7 -1 H-2 M-7 2 H-3 M2 -4 H7 M2 -1 H7" stroke="#7d6a45" stroke-width=".7"/><path d="M3.5 1 L7 1 L7 7.5 L5.25 6 L3.5 7.5Z" fill="#b33"/>`,
 native:`<path d="M-6 10 Q-8 0 -2 -6 Q3 -11 8 -10 Q8 -4 3 2 Q-2 7 -6 10Z" fill="#f2e6c9" stroke="#6b4c1a" stroke-width=".8"/><path d="M-6 10 Q0 0 7 -9" stroke="#6b4c1a" stroke-width=".9" fill="none"/><path d="M-3.5 1 L-7 -1 M-1 -2.5 L-4.5 -5 M1.5 -5 L-1.5 -8.4 M1 1 L4.6 2 M3.4 -2 L7 -1" stroke="#b5553a" stroke-width="1"/>`,
};
function cardArt(t){
  const d=CT[t];let emb;
  if(d.c==='p')emb=`<g transform="translate(50 35) scale(2.1)">${GLYPH[t]}</g>`;
  else{const sym=d.s==='*'?'x':d.s;const col={j:'#f2fff5',w:'#f2f9ff',v:'#ffe08a',x:'#8a6a1f'}[sym];
    emb=`<g transform="translate(50 36)"><ellipse cx="0" cy="22" rx="18" ry="3.5" fill="rgba(0,0,0,.25)"/><g filter="none" style="color:${col}"><use href="#i-${sym}" x="-19" y="-19" width="38" height="38" style="color:rgba(0,0,0,.35)" transform="translate(1.5 2)"/><use href="#i-${sym}" x="-19" y="-19" width="38" height="38"/></g></g>`;}
  return `<svg viewBox="0 0 100 70" preserveAspectRatio="xMidYMid slice">${cardBg(t)}${emb}</svg>`;
}
export function cardHTML(t){
  const d=CT[t];let body;
  if(d.c==='p'){const f=d.face||d.txt;body=`<div class="c-txt${f.length>16?' long':''}">${esc(f)}</div>`;}
  else{const sym=d.s==='*'?'*':d.s;body=`<div class="c-icons${d.p>=5?' many':''}">${icon(sym).repeat(d.p)}</div><div class="c-sub">${d.s==='*'?'Any one symbol':plural(d.p,SYMNAME[d.s])}</div>`;}
  const pow=d.c!=='p'?`<div class="c-pow"><b>${d.p}</b>${icon(d.s)}</div>`:'';
  const foot=`<div class="c-foot">${d.cost!=null?`<span class="c-cost">${d.cost}</span>`:'<span></span>'}${d.once?'<span class="c-once">Single use</span>':''}</div>`;
  return `<div class="cface k-${d.c}"><div class="c-art">${cardArt(t)}</div>${pow}<div class="c-title">${esc(d.n)}</div><div class="c-body">${body}</div>${foot}</div>`;
}
export function cardTitle(t){const d=CT[t];let s=d.n;if(d.c!=='p')s+=` — ${d.p} ${d.s==='*'?'joker (machete, paddle or coin)':SYMNAME[d.s]}`;else s+=' — '+d.txt;if(d.once)s+=' Single use: removed from the game after its effect.';if(d.cost!=null)s+=` Cost ${d.cost}.`;return s;}
/* the compact face (design option D3-B): the market column's row. Strength and symbol (or the action's glyph), the name
   at a legible size, the price; no scene art. The full card shows beside it on hover, in All cards, and in the buy slot. */
export function cardCompactHTML(t){
  const d=CT[t];
  const pow=d.c==='p'?`<div class="cc-pow"><svg viewBox="-11 -11 22 22">${GLYPH[t]}</svg></div>`:`<div class="cc-pow"><b>${d.p}</b>${icon(d.s)}</div>`;
  return `<div class="ccard k-${d.c}">${pow}<div class="cc-name">${esc(d.n)}</div><span class="cc-cost">${d.cost}</span></div>`;
}
