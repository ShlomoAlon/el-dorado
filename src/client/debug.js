import { assert } from '../engine.gen.js';
/* On-device diagnostics. The page keeps a log of its last 200 notable events (fits, zoom bakes, layout changes, errors):
   a bug report carries it (boundary.js). With ?debug in the address (debug mode) the log is also shown over the game,
   with more in it (screen size changes, touches, slow frames, what changed on the page), a Mark button to tap right after
   something looks wrong and a Copy button for the log. For bugs that only a real phone shows. */
export const DEBUG = /[?&]debug\b/.test(location.search);
// the page's debug-tier checks (they may watch layout): on with ?debug, and in every automated test (navigator.webdriver);
// never in a player's browser, where they would cost something and report nothing anyone reads
export const CHECKS = DEBUG || navigator.webdriver === true;
const lines = []; let box = null, t0 = performance.now();
export function diag(msg) {
  lines.push(((performance.now() - t0) / 1000).toFixed(2) + ' ' + msg); if (lines.length > 200) lines.shift();
  if (box) { box.textContent = lines.slice(-22).join('\n'); }
}
export const diagLog = () => lines.slice();
export const shifts = [], churn = []; // (checks: every layout shift and every unchanged rebuild seen, for tests)
/* checks: what is "in play" comes from the page (main.js), so this module stays free of the game's state */
let inPlay = () => false, expectedAt = -1e9;
/* when play started and stopped (frameMark notes each change, timed at the start of the frame that shows it): the browser
   reports a layout shift later, in a batch, so a shift is judged by whether play was on at its own time, not at the report's */
const playLog = [[-Infinity, false]];
const playAt = t => { for (let i = playLog.length - 1; i >= 0; i--) if (playLog[i][0] <= t) return playLog[i][1]; return false; };
/* code that changes the layout on purpose (the game area resized, the market or history moved, a replay's dock opened)
   says so first: shifts in the next 600 ms are that change, not a jump */
export function expectLayout() { expectedAt = performance.now(); }
export function checksInit(during) {
  if (!CHECKS) return; inPlay = during;
  // layout shifts: an element already on screen moving because something else changed (the owner's rule: nothing moves
  // without an animation or a direct action; animations move by transform, which never counts as a shift). Every shift
  // is kept, including those just after an input (the browser's own score leaves those out)
  if (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes.includes('layout-shift'))
    new PerformanceObserver(list => { for (const e of list.getEntries()) for (const s of e.sources || []) {
      const n = s.node, who = !n ? '?' : n.id ? '#' + n.id : n.nodeType === 1 ? n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.split(' ')[0] : '') : (n.parentElement && n.parentElement.id ? '#' + n.parentElement.id + ' text' : 'text');
      const d = `${Math.round(s.currentRect.x - s.previousRect.x)},${Math.round(s.currentRect.y - s.previousRect.y)} size ${Math.round(s.currentRect.width - s.previousRect.width)}×${Math.round(s.currentRect.height - s.previousRect.height)}`;
      shifts.push({ who, d, input: e.hadRecentInput, play: playAt(e.startTime) }); diag(`shift ${who} by ${d}${e.hadRecentInput ? ' (after input)' : ''}`);
      if (playAt(e.startTime) && !e.hadRecentInput && Math.abs(e.startTime - expectedAt) > 600) assert(false, 'view: nothing moves without an animation or a direct action (layout shift: ' + who + ' by ' + d + '; ' + Math.round(e.startTime - expectedAt) + ' ms after the last expected change; log: ' + lines.filter(l => / (layout|market|fit)/.test(l)).slice(-5).join(' / ') + ')'); } })
      .observe({ type: 'layout-shift', buffered: true });
  // churn: a frame that removes an element and adds an identical new one rebuilt what hadn't changed (CLAUDE.md: a view
  // part writes only what changed). An element moved (removed and put back) is not a rebuild; identical means the same
  // markup, keys (data-*) included, apart from what an entry animation sets (the "new" class, a fading opacity)
  const sig = n => n.outerHTML.replace(/ class="([^"]*)"/g, (m, c) => ' class="' + c.split(' ').filter(x => x !== 'new').join(' ') + '"').replace(/opacity: [\d.]+;\s*/g, '').replace(/ style=""/g, '');
  const judge = churnJudge = list => {
    const moved = new Set(), gone = new Map();
    // (a rebuild puts the same thing back in the same place: an element removed from one box and an identical one added
    // to another are two changes, e.g. one step's caption changed while a new step got the old words)
    for (const m of list) for (const n of m.removedNodes) if (n.nodeType === 1) { if (n.isConnected) moved.add(n); else if (n.childElementCount) { const k = sig(n); (gone.get(k) || gone.set(k, new Set()).get(k)).add(m.target); } }
    if (!gone.size) return;
    for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1 && n.isConnected && !moved.has(n) && (gone.get(sig(n)) || new Set()).has(m.target)) {
      const cls = n.getAttribute('class'), pc = n.parentNode && n.parentNode.getAttribute && n.parentNode.getAttribute('class'), who = ((n.closest('[id]') || {}).id || '?') + ' ' + (pc ? '.' + pc.split(' ')[0] + ' > ' : '') + n.tagName.toLowerCase() + (cls ? '.' + cls.split(' ')[0] : '');
      const play = inPlay(); churn.push({ who, play, html: sig(n).slice(0, 160), parent: n.parentNode && n.parentNode.outerHTML.slice(0, 80) }); diag('churn: rebuilt unchanged ' + who);
      if (play) assert(false, 'view: a frame writes only what changed (rebuilt unchanged content in ' + who + ': ' + sig(n).slice(0, 100) + ')');
    }
  };
  // words never run together: text written beside an element in a flex or grid box is its own item there, and the space
  // between them is dropped ("1space") unless a margin or a gap keeps them apart. Measured on what was written, once the
  // frame that wrote it is drawn (a timer after it: never while the views update)
  const wq = new Set(); let wt = 0;
  const words = () => { wt = 0; const rg = document.createRange();
    for (const t of wq) { const p = t.parentElement, x = t.data; if (!p || !t.isConnected || !x.trim() || !/^(inline-)?(flex|grid)$/.test(getComputedStyle(p).display)) continue;
      rg.selectNodeContents(t); const tr = rg.getBoundingClientRect(); if (!tr.width) continue; // (not shown)
      const touch = (n, before) => { if (!n || n.nodeType !== 1) return false; const r = n.getBoundingClientRect(); return r.width > 0 && (before ? tr.left - r.right < 2 : r.left - tr.right < 2); };
      if ((/^\s/.test(x) && touch(t.previousSibling, true)) || (/\s$/.test(x) && touch(t.nextSibling, false))) assert(false, 'view: words never run together ("' + p.textContent.trim().slice(0, 40) + '": text beside an element in a ' + getComputedStyle(p).display + ' box)'); }
    wq.clear(); };
  const texts = n => { if (n.nodeType === 3) wq.add(n); else if (n.nodeType === 1) { const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT); for (let t = w.nextNode(); t; t = w.nextNode()) wq.add(t); } };
  new MutationObserver(list => { for (const m of list) { if (m.type === 'characterData') wq.add(m.target); else m.addedNodes.forEach(texts); } if (wq.size && !wt) wt = setTimeout(words, 50); })
    .observe(document.body, { subtree: true, childList: true, characterData: true });
  churnMO = new MutationObserver(judge);
  churnMO.observe(document.getElementById('app'), { subtree: true, childList: true });
}
/* the frame loop marks each frame (frame.js flush): when play starts or stops, and what one frame wrote, judged on its own */
let churnMO = null, churnJudge = null;
export function frameMark() {
  if (!CHECKS) return;
  const p = inPlay(); if (p !== playLog[playLog.length - 1][1]) { playLog.push([performance.now(), p]); if (playLog.length > 64) playLog.shift(); }
  if (churnMO) { const r = churnMO.takeRecords(); if (r.length) churnJudge(r); }
}
export function debugInit() {
  if (!DEBUG) return;
  const wrap = document.createElement('div'); wrap.style.cssText = 'position:fixed;left:0;top:0;z-index:100;pointer-events:none;max-width:70vw';
  box = document.createElement('pre'); box.style.cssText = 'margin:0;padding:3px 5px;font:9px/1.25 ui-monospace,monospace;color:#b8f7c4;background:rgba(0,0,0,.72);white-space:pre-wrap;pointer-events:none';
  const bar = document.createElement('div'); bar.style.cssText = 'display:flex;gap:6px;padding:3px;pointer-events:auto';
  const btn = (t, f) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = 'font:11px system-ui;padding:3px 8px;border-radius:6px;border:1px solid #6a6;background:#132;color:#cfc'; b.onclick = f; bar.appendChild(b); };
  btn('Mark', () => diag('==== MARK ===='));
  btn('Copy log', () => { const t = navigator.userAgent + '\n' + lines.join('\n'); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => diag('(copied)'), () => diag('(copy failed)')); });
  wrap.append(bar, box); document.body.appendChild(wrap);
  const vv = window.visualViewport, sz = () => `${innerWidth}×${innerHeight}` + (vv ? ` vv ${Math.round(vv.width)}×${Math.round(vv.height)} top ${Math.round(vv.offsetTop)} s ${vv.scale.toFixed(2)}` : '');
  diag('start ' + sz() + ' dpr ' + devicePixelRatio);
  addEventListener('resize', () => diag('resize ' + sz()));
  if (vv) { vv.addEventListener('resize', () => diag('vv resize ' + sz())); vv.addEventListener('scroll', () => diag('vv scroll ' + sz())); }
  addEventListener('scroll', () => diag('window scroll ' + scrollX + ',' + scrollY), true);
  document.addEventListener('visibilitychange', () => diag('visibility ' + document.visibilityState));
  for (const t of ['pointerdown', 'pointerup', 'pointercancel']) addEventListener(t, e => diag(`${t.slice(7)} #${e.pointerId} ${e.pointerType} on ${e.target.id || e.target.className && String(e.target.className.baseVal ?? e.target.className).slice(0, 14) || e.target.tagName}`), true);
  for (const t of ['gesturestart', 'gestureend']) document.addEventListener(t, e => diag(t + ' scale ' + (e.scale || 0).toFixed(2)), true);
  // every change the page makes to itself, summed per frame by area (a redraw nobody expected shows up here)
  const area = n => { for (let e = n.nodeType === 1 ? n : n.parentElement; e; e = e.parentElement) { if (e === wrap) return null; if (e.id) return e.id; } return '?'; };
  let pend = null;
  new MutationObserver(list => { for (const m of list) { const a = area(m.target); if (!a) continue; pend = pend || {}; const k = a + (m.type === 'attributes' ? '.' + m.attributeName : m.type === 'childList' ? '+-' : '~'); pend[k] = (pend[k] || 0) + 1; }
    if (pend && !pend.__q) { pend.__q = 1; requestAnimationFrame(() => { const p = pend; pend = null; delete p.__q; const ks = Object.keys(p).filter(k => !/^(stage\.style|diag)/.test(k));
      if (ks.length) diag('dom ' + ks.map(k => k + (p[k] > 1 ? '×' + p[k] : '')).join(' ')); }); } })
    .observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  // slow frames: any gap between animation frames over 50 ms
  let last = performance.now(); const tick = t => { if (t - last > 50) diag(`slow frame ${Math.round(t - last)} ms`); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
}
