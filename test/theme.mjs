// The theme check: every colour, font, font size, corner, shadow and motion of the interface comes from the theme (the
// first :root block of src/client/shell.html), never a value written in place (owner, 2026-10-04: "nothing may be styled
// outside the theme"). The board, the explorers and the cards are not themed yet (owner: "eventually"): their rules are
// listed below, by selector, and only theirs may hold raw values. Also checked: style attributes in the markup and in the
// HTML the page's modules build.
//   node test/theme.mjs
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const shell = readFileSync(path.join(root, 'src/client/shell.html'), 'utf8');
// not themed yet: the board, the explorers, the cards (their faces, backs and flights), the aim arrow
const EXEMPT = new RegExp([
  /#vp\b|#grab\b|#stage\b|#bscale\b|#tlevels\b|\.tlevel\b|#board2?\b|#blabels2?\b|\.blabel\b|\.tgt\b|\.bl-|#arrow\b/,
  /#pieces\b|#bfx\b|\.piece\b|\.psel\b|\.pglow\b|\.pmark\b|\.pshadow\b|\.pin\b|\.dpips\b/,
  /\.mcard\b|\.card\b|\.cface\b|\.k-[gbyxp]\b|\.c-[a-z]+\b|\.back\b|\.empty-slot\b|\.pstack\b|#discStack\b|#cards\b|#cardhits\b|\.shuf\b|\.chit\b|\.mghost\b/,
  /\.fc\b|\.fg\.new\b|\.deckgrid\b|\.pback\b|\.bs-card\b|^\.mslot(\.\w+)*(>\.face)?$|\.mslot:hover>\.face|\.mslot>\.face|\.mslot\.(dimc|can|chosen) \.(mcard|cface)|#mkt \.mslot$|\.agrid \.mslot/,
  /^@keyframes (pulse|fgIn)\b/,
].map(r => r.source).join('|'));
const css = [...shell.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
// the rules, with @media / @container unwrapped (a keyframes block is one rule)
const rules = [];
const walk = t => { let i = 0;
  while (i < t.length) { const j = t.indexOf('{', i); if (j < 0) break; const sel = t.slice(i, j).trim();
    const close = () => { let d = 1, k = j + 1; while (d) { if (t[k] === '{') d++; else if (t[k] === '}') d--; k++; } return k; };
    if (sel.startsWith('@') && !sel.startsWith('@keyframes') && !sel.startsWith('@property')) { const k = close(); walk(t.slice(j + 1, k - 1)); i = k; continue; }
    if (sel.startsWith('@keyframes')) { const k = close(); rules.push({ sel, body: t.slice(j + 1, k - 1) }); i = k; continue; }
    const k = t.indexOf('}', j); rules.push({ sel, body: t.slice(j + 1, k) }); i = k + 1; } };
walk(css);
const theme = rules.findIndex(r => r.sel === ':root');
if (theme < 0) { console.log('FAIL the theme (:root) is missing from shell.html'); process.exit(1); }
// what a value may not hold outside the theme: a colour, a duration, a curve; and what some properties must take from it
const RAW = [
  [/#[0-9a-f]{3,8}\b|%23[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black)\b/i, 'a colour'], // (%23: a colour inside a data URI)
  [/(^|[\s,(])[0-9.]+m?s\b/, 'a duration'],
  [/cubic-bezier\(/, 'an easing curve'],
];
const MUST = { 'font-size': /^var\(--fs-[\w-]+\)$|^inherit$/, 'border-radius': /^(var\(--r-[\w-]+\)\s*)+$|^0$/, 'font-family': /^var\(--(ui|display)\)$|^inherit$/ };
// the controls take the theme's heights (--h-*: small, compact, normal, big), or one derived from them
const CONTROL = /\.btn\b|\.tbtn\b|\.prow input|select\.who|#rdock\b.*button|\.zoomctl button|\.sclose\b|\.bs-x\b|\.rmai\b|\.hx\b|#allClose\b|#hud\b|#acct\b|\.gsiSm\b|#gsiBtn\b|\.seatrow(\.\w+)*$/;
const bad = [];
const judge = (where, prop, val) => {
  if (prop.startsWith('--')) { if (RAW[0][0].test(val)) bad.push(`${where}: ${prop} holds ${RAW[0][1]} (${val.trim()}): give it a theme token`); return; }
  for (const [re, what] of RAW) if (re.test(val)) bad.push(`${where}: ${prop}:${val.trim()} holds ${what}: use the theme's`);
  if (MUST[prop] && !MUST[prop].test(val.trim())) bad.push(`${where}: ${prop}:${val.trim()} is not one of the theme's (${prop === 'font-size' ? '--fs-*' : prop === 'border-radius' ? '--r-*' : '--ui, --display'})`);
  if (prop === 'font' && !/var\(--fs-[\w-]+\)/.test(val) && !/^inherit$/.test(val.trim())) bad.push(`${where}: font:${val.trim()} has no theme size (--fs-*)`);
  if (CONTROL.test(where) && /^(min-)?height$|^--hudH$/.test(prop) && !/^(var\(--(h-[a-z]+|hudH)\)|calc\(var\(--h-[a-z]+\)[^)]*\))$/.test(val.trim())) bad.push(`${where}: ${prop}:${val.trim()} is not one of the theme's heights (--h-*)`);
  if (prop === 'font' && /['"]|serif|sans/.test(val)) bad.push(`${where}: font:${val.trim()} names a font: use --ui or --display`);
};
rules.forEach((r, i) => { if (i === theme || r.sel.split(',').every(s => EXEMPT.test(s.trim()))) return;
  if (r.sel.startsWith('@keyframes')) return; // (a keyframe holds positions and opacities only: checked as the rules that run it)
  for (const d of r.body.split(';')) { const c = d.indexOf(':'); if (c < 0) continue; judge(r.sel, d.slice(0, c).trim().toLowerCase(), d.slice(c + 1)); } });
// style attributes: the markup's, and those in the HTML the page's modules build (players' colours come from the engine:
// a ${…} holding no literal passes); the files that draw the cards, the explorers and the aim arrow are not themed yet
const NOT_YET = new Set(['art.js', 'cards.js', 'meeple.js', 'aim.js', 'debug.js']);
const srcs = [['src/client/shell.html', shell.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '')]];
for (const f of readdirSync(path.join(root, 'src/client'))) if (f.endsWith('.js') && !NOT_YET.has(f)) srcs.push(['src/client/' + f, readFileSync(path.join(root, 'src/client', f), 'utf8')]);
for (const [f, t] of srcs) t.split('\n').forEach((l, n) => { for (const m of l.matchAll(/style="([^"]*)"|style='([^']*)'/g)) for (const d of (m[1] ?? m[2]).split(';')) { const c = d.indexOf(':'); if (c > 0) judge(`${f}:${n + 1} style`, d.slice(0, c).trim().toLowerCase(), d.slice(c + 1)); } });
for (const b of bad) console.log('FAIL ' + b);
console.log(bad.length ? `theme: ${bad.length} values outside the theme` : 'theme ok');
process.exit(bad.length ? 1 : 0);
