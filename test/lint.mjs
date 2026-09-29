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
  try { ({ ESLint } = await import(pathToFileURL(path.join(base, 'eslint/lib/api.js')))); break; } catch (e) { }
}
if (!ESLint) { console.log('lint: skipped (ESLint not installed)'); process.exit(0); }
const files = []; const walk = d => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.js$/.test(f.name) && !/^ui_/.test(f.name)) files.push(p); } }; walk(dir);
// names defined by some module (the engine's and every client module's top-level names): using one without importing it
// is the mistake to catch (browser globals like document are not in this list, so they need no declaring)
const known = new Set(readFileSync(path.join(root, 'src/engine.gen.js'), 'utf8').match(/export \{([^}]*)\}/)[1].split(','));
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/^(?:export\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) known.add(m[1]);
const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: [{ files: ['**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { AI_NET: 'readonly' } },
  rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { vars: 'all', args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }], 'no-const-assign': 'error', 'no-import-assign': 'error', 'no-dupe-keys': 'error', 'no-redeclare': 'error' } }] });
const res = await eslint.lintFiles(files);
let errors = 0, warns = 0;
for (const r of res) for (const m of r.messages) {
  if (m.ruleId === 'no-undef') { const n = (m.message.match(/'([^']+)'/) || [])[1]; if (!known.has(n)) continue; }
  if (m.severity === 2) errors++; else warns++;
  console.log(`${m.severity === 2 ? 'error' : 'warn '} ${path.relative(root, r.filePath)}:${m.line} ${m.message}`);
}
console.log(errors ? `lint: ${errors} errors, ${warns} warnings` : `lint ok${warns ? ` (${warns} warnings)` : ''}`);
process.exit(errors ? 1 : 0);
