// Module check for the page's code (src/client): every name a module uses from another module must be imported, and
// imports must be used. Uses ESLint if it is installed (globally is fine: `npm root -g`); prints what it finds.
//   node test/lint.mjs
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
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
for (const f of scan) readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (SILENT.test(l)) { silent++; console.log(`error ${path.relative(root, f)}:${i + 1} a catch that drops the error: name the failure it expects, or handle it`); } });
if (!ESLint) { console.log('lint: ESLint is not installed (npm i -g eslint): the module check could not run'); process.exit(1); }
const files = []; const walk = d => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.js$/.test(f.name) && !/^ui_/.test(f.name)) files.push(p); } }; walk(dir);
// names defined by some module (the engine's and every client module's top-level names): using one without importing it
// is the mistake to catch (browser globals like document are not in this list, so they need no declaring)
const known = new Set(readFileSync(path.join(root, 'src/engine.gen.js'), 'utf8').match(/export \{([^}]*)\}/)[1].split(','));
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/^(?:export\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) known.add(m[1]);
const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: [{ files: ['**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { AI_NET: 'readonly' } },
  rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }], 'no-const-assign': 'error', 'no-import-assign': 'error', 'no-dupe-keys': 'error', 'no-redeclare': 'error' } }] });
const res = await eslint.lintFiles(files);
let errors = 0, warns = 0;
for (const r of res) for (const m of r.messages) {
  if (m.ruleId === 'no-undef') { const n = (m.message.match(/'([^']+)'/) || [])[1]; if (!known.has(n)) continue; }
  if (m.severity === 2) errors++; else warns++;
  console.log(`${m.severity === 2 ? 'error' : 'warn '} ${path.relative(root, r.filePath)}:${m.line} ${m.message}`);
}
errors += silent;
console.log(errors ? `lint: ${errors} errors, ${warns} warnings` : `lint ok${warns ? ` (${warns} warnings)` : ''}`);
process.exit(errors ? 1 : 0);
