// Module check for the page's code (src/client): every name a module uses must be declared, imported or a browser global
// (a name left over from a rename is an error, not a silent global), and imports must be used. Uses ESLint if it is
// installed (globally is fine: `npm root -g`); prints what it finds.
//   node test/lint.mjs
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import globals from 'globals'; // the browser's own names (window, document, …): every other name a module uses must be declared or imported
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), dir = path.join(root, 'src/client');
let ESLint;
for (const base of [path.join(root, 'node_modules'), execSync('npm root -g').toString().trim()]) {
  try { ({ ESLint } = await import(pathToFileURL(path.join(base, 'eslint/lib/api.js')))); break; } catch (e) { /* expected: not installed here; try the next place */ }
}
// no silent failures (CLAUDE.md): an empty catch, or a promise catch that drops the error, must name the failure it
// expects in a comment inside it (or handle it). Checked in every source, test and tool file.
const SILENT = /catch\s*(\(\s*[\w$]*\s*\))?\s*\{\s*\}|\.catch\(\s*\(\s*[\w$]*\s*\)\s*=>\s*(\{\s*\}|null|undefined|false|0|\[\]|\{\s*\})\s*\)/;
const scan = [], walkAll = d => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name);
  if (f.isDirectory()) { if (!/node_modules|data|models/.test(f.name)) walkAll(p); } else if (/\.(m|c)?js$/.test(f.name) && f.name !== 'engine.gen.js') scan.push(p); } };
for (const d of ['src', 'test', 'tools']) walkAll(path.join(root, d));
let silent = 0;
// no test skips its own check (CLAUDE.md "No silent failures"): a test whose setup can't be reached fails; it never prints
// a skip and passes (docs/POSTMORTEMS.md U1)
const SKIP = /console\.log\([^)]*\b(skip|skipped|skipping|not checked|not tested)\b/i;
// every test page is opened by test/lib.cjs openPage, which counts failed assertions (the page's boundary reports them to
// the console) as well as uncaught errors: a page opened by hand saw only the latter, so its assertions never failed a test
const BYHAND = /\.(newPage|newContext)\(/;
for (const f of scan) if (f.includes(path.sep + 'test' + path.sep) && !f.endsWith(path.sep + 'lib.cjs')) readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (BYHAND.test(l)) { silent++; console.log(`error ${path.relative(root, f)}:${i + 1} a test page opened by hand: use openPage (test/lib.cjs), or its failed assertions go unseen`); } });
for (const f of scan) if (f.includes(path.sep + 'test' + path.sep)) readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (SKIP.test(l)) { silent++; console.log(`error ${path.relative(root, f)}:${i + 1} a test that skips its own check: make the setup it needs, or fail`); } });
// no modal dialogs in the page: showModal makes the whole page inert, so every element (the board's thousands) is restyled
// each time one opens and closes, a 15-20 ms frame (docs/POSTMORTEMS: the menu's slow entrance); open with show()
const MODAL = /\.showModal\(/;
for (const f of scan) if (f.includes(path.sep + 'client' + path.sep)) readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (MODAL.test(l)) { silent++; console.log(`error ${path.relative(root, f)}:${i + 1} a modal dialog restyles the whole page: open it with show()`); } });
for (const f of scan) readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (SILENT.test(l)) { silent++; console.log(`error ${path.relative(root, f)}:${i + 1} a catch that drops the error: name the failure it expects, or handle it`); } });
if (!ESLint) { console.log('lint: ESLint is not installed (npm i -g eslint): the module check could not run'); process.exit(1); }
const files = []; const walk = d => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.js$/.test(f.name) && !/^ui_/.test(f.name)) files.push(p); } }; walk(dir);
const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: [{ files: ['**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser, AI_NET: 'readonly', AI_WORKER: 'readonly', ED_URL: 'readonly', google: 'readonly' /* Google sign-in's script */ } },
  rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }], 'no-const-assign': 'error', 'no-import-assign': 'error', 'no-dupe-keys': 'error', 'no-redeclare': 'error' } }] });
const res = await eslint.lintFiles(files);
let errors = 0, warns = 0;
for (const r of res) for (const m of r.messages) {
  if (m.severity === 2) errors++; else warns++;
  console.log(`${m.severity === 2 ? 'error' : 'warn '} ${path.relative(root, r.filePath)}:${m.line} ${m.message}`);
}
// every export is imported by another module: ESLint's unused check stops at an export, so a function written to be called
// from elsewhere (an init, a reset) that nobody calls passed silently (storage cleanup, 2026-10-01). A name used only in
// its own module isn't exported.
const srcOf = Object.fromEntries(files.map(f => [f, readFileSync(f, 'utf8')]));
const imported = new Set(Object.values(srcOf).flatMap(t => [...t.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.{1,2}\//g)].flatMap(m => m[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]))));
for (const f of files) srcOf[f].split('\n').forEach((l, i) => { for (const m of l.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([\w$]+)/g)) if (!imported.has(m[1])) { silent++; console.log(`error ${path.relative(root, f)}:${i + 1} '${m[1]}' is exported but no module imports it: call it where it's needed, or don't export it`); } });
// the AI thinks only in its worker (src/client/aiworker.js): a page module importing the engine's thinking would hold up
// frames and taps while an AI weighs its turn (2026-10-02: the replay advisor blocked the page 130-400 ms)
const THINK = /\b(aiChoose|aiPlan|aiStep|aiNextSteps|botValue|botChoose|botPlanTurn|botPlanChoose|botPlanTurnChoose)\b/;
for (const f of files) if (!f.endsWith(path.sep + 'aiworker.js')) srcOf[f].split('\n').forEach((l, i) => { const m = l.match(/^import\s*\{([^}]*)\}\s*from\s*'\.\.\/(\.\.\/)?engine\.gen\.js'/); if (m && THINK.test(m[1])) { silent++; console.log(`error ${path.relative(root, f)}:${i + 1} the AI's thinking (${m[1].match(THINK)[1]}) runs only in its worker: ask it through ai.js (aiThink, aiAsk)`); } });
errors += silent;
console.log(errors ? `lint: ${errors} errors, ${warns} warnings` : `lint ok${warns ? ` (${warns} warnings)` : ''}`);
process.exit(errors ? 1 : 0);
