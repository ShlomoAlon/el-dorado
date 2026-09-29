/* On-device diagnostics. The page keeps a log of its last 200 notable events (fits, zoom bakes, layout changes, errors):
   a bug report carries it (boundary.js). With ?debug in the address (debug mode) the log is also shown over the game,
   with more in it (screen size changes, touches, slow frames, what changed on the page), a Mark button to tap right after
   something looks wrong and a Copy button for the log. For bugs that only a real phone shows. */
export const DEBUG = /[?&]debug\b/.test(location.search);
const lines = []; let box = null, t0 = performance.now();
export function diag(msg) {
  lines.push(((performance.now() - t0) / 1000).toFixed(2) + ' ' + msg); if (lines.length > 200) lines.shift();
  if (box) { box.textContent = lines.slice(-22).join('\n'); }
}
export const diagLog = () => lines.slice();
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
