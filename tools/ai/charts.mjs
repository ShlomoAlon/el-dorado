// Tiny static SVG line charts for the live progress pages (GitHub shows them as images; light + dark via prefers-color-scheme).
// Palette: validated categorical slots 1-2 (blue, orange), recessive grid and axes, legend + direct end labels for 2+ series.
const C = { light: { s: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'], surf: '#fcfcfb', ink: '#0b0b0b', ink2: '#52514e', mut: '#898781', grid: '#e1e0d9', base: '#c3c2b7' },
  dark: { s: ['#3987e5', '#d95926', '#199e70', '#c98500'], surf: '#1a1a19', ink: '#ffffff', ink2: '#c3c2b7', mut: '#898781', grid: '#2c2c2a', base: '#383835' } };
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
// opts: {title, sub, xLabel, yLabel, x:[min,max], y:[min,max], yTicks:[..], fmtY, series:[{name, pts:[[x,y]], dots:[[x,y]]}], refs:[{y,label}], marks:[{x,label}]}
export function lineChart(o) {
  const W = 760, H = 340, L = 56, R = 110, T = 74, B = 44, pw = W - L - R, ph = H - T - B;
  const sx = x => L + (x - o.x[0]) / ((o.x[1] - o.x[0]) || 1) * pw, sy = y => T + ph - (Math.min(o.y[1], Math.max(o.y[0], y)) - o.y[0]) / (o.y[1] - o.y[0]) * ph;
  const fmt = o.fmtY || (v => v);
  let css = '', g = '';
  for (const [m, c] of Object.entries(C)) {
    const sel = m === 'light' ? '' : '@media (prefers-color-scheme: dark){';
    css += `${sel}.bg{fill:${c.surf}}.t1{fill:${c.ink}}.t2{fill:${c.ink2}}.mu{fill:${c.mut}}.gr{stroke:${c.grid}}.ax{stroke:${c.base}}.rf{stroke:${c.ink2}}`
      + c.s.map((h, i) => `.s${i}{stroke:${h}}.f${i}{fill:${h}}`).join('') + (sel ? '}' : '');
  }
  g += `<rect class="bg" width="${W}" height="${H}" rx="8"/>`;
  g += `<text class="t1" x="${L}" y="24" font-size="15" font-weight="600">${esc(o.title)}</text>`;
  if (o.sub) g += `<text class="t2" x="${L}" y="42" font-size="12">${esc(o.sub)}</text>`;
  for (const v of o.yTicks) g += `<line class="gr" x1="${L}" x2="${L + pw}" y1="${sy(v)}" y2="${sy(v)}" stroke-width="1"/><text class="mu" x="${L - 8}" y="${sy(v) + 4}" font-size="11" text-anchor="end">${esc(fmt(v))}</text>`;
  g += `<line class="ax" x1="${L}" x2="${L + pw}" y1="${T + ph}" y2="${T + ph}" stroke-width="1"/>`;
  const xt = o.xTicks || (() => { const n = o.x[1] - o.x[0], st = [1, 2, 5, 10, 20, 25, 50, 100].find(s => n / s <= 8) || 200, a = []; for (let v = Math.ceil(o.x[0] / st) * st; v <= o.x[1]; v += st) a.push(v); return a; })();
  for (const v of xt) g += `<text class="mu" x="${sx(v)}" y="${T + ph + 16}" font-size="11" text-anchor="middle">${v}</text>`;
  if (o.xLabel) g += `<text class="mu" x="${L + pw / 2}" y="${H - 8}" font-size="11" text-anchor="middle">${esc(o.xLabel)}</text>`;
  let lastX = -1e9, lvl = 0; // marker labels: stack them when markers are close together
  for (const m of [...(o.marks || [])].sort((a, b) => a.x - b.x)) { const x = sx(m.x); lvl = x - lastX < 90 ? lvl + 1 : 0; lastX = x;
    g += `<line class="ax" x1="${x}" x2="${x}" y1="${T}" y2="${T + ph}" stroke-width="1" stroke-dasharray="2 3"/><text class="mu" x="${x + 3}" y="${T + 10 + lvl * 12}" font-size="10">${esc(m.label)}</text>`; }
  for (const r of o.refs || []) g += `<line class="rf" x1="${L}" x2="${L + pw}" y1="${sy(r.y)}" y2="${sy(r.y)}" stroke-width="1" stroke-dasharray="5 4" opacity=".7"/><text class="t2" x="${L + pw + 6}" y="${sy(r.y) + 4}" font-size="11">${esc(r.label)}</text>`;
  const ends = [];
  o.series.forEach((s, i) => {
    for (const [x, y] of s.dots || []) g += `<circle class="f${i}" cx="${sx(x).toFixed(1)}" cy="${sy(y).toFixed(1)}" r="2" opacity=".35"/>`;
    if (s.pts.length) { g += `<polyline class="s${i}" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${s.pts.map(([x, y]) => sx(x).toFixed(1) + ',' + sy(y).toFixed(1)).join(' ')}"/>`;
      const [x, y] = s.pts[s.pts.length - 1]; ends.push({ i, x: sx(x), y: sy(y), txt: `${s.name} ${fmt(y)}` }); }
  });
  ends.sort((a, b) => a.y - b.y); for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14; // no overlapping end labels
  for (const e of ends) g += `<text class="t1" x="${e.x + 6}" y="${e.y + 4}" font-size="11">${esc(e.txt)}</text>`;
  if (o.series.length > 1) { let lx = L; o.series.forEach((s, i) => { g += `<line class="s${i}" x1="${lx}" x2="${lx + 16}" y1="58" y2="58" stroke-width="2"/><text class="t2" x="${lx + 21}" y="62" font-size="11">${esc(s.name)}</text>`; lx += 30 + s.name.length * 6.5; }); }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui,-apple-system,Segoe UI,sans-serif"><style>${css}</style>${g}</svg>`;
}
export const rolling = (pts, k) => pts.map((p, i) => { const w = pts.slice(Math.max(0, i - k + 1), i + 1); return [p[0], w.reduce((a, q) => a + q[1], 0) / w.length]; });
