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
for (const f of scan) readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (SILENT.test(l)) { silent++; console.log(`error ${path.relative(root, f)}:${i + 1} a catch that drops the error: name the failure it expects, or handle it`); } });
if (!ESLint) { console.log('lint: ESLint is not installed (npm i -g eslint): the module check could not run'); process.exit(1); }
const files = []; const walk = d => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.js$/.test(f.name) && !/^ui_/.test(f.name)) files.push(p); } }; walk(dir);
const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: [{ files: ['**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser, AI_NET: 'readonly', google: 'readonly' /* Google sign-in's script */ } },
  rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }], 'no-const-assign': 'error', 'no-import-assign': 'error', 'no-dupe-keys': 'error', 'no-redeclare': 'error' } }] });
const res = await eslint.lintFiles(files);
let errors = 0, warns = 0;
for (const r of res) for (const m of r.messages) {
  if (m.severity === 2) errors++; else warns++;
  console.log(`${m.severity === 2 ? 'error' : 'warn '} ${path.relative(root, r.filePath)}:${m.line} ${m.message}`);
}
errors += silent;
console.log(errors ? `lint: ${errors} errors, ${warns} warnings` : `lint ok${warns ? ` (${warns} warnings)` : ''}`);
process.exit(errors ? 1 : 0);
