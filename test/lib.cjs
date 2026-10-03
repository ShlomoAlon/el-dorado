// Shared helpers for the browser tests (Playwright; run with NODE_PATH=$(npm root -g), or through test/run.mjs):
//   serveStatic()      public/ over http (as on the site)
//   startServer()      the game server (wrangler dev) with developer sign-in and an empty database of its own; bugs(): its bug reports
//   openPage(browser)  a page that collects every page error and console error
//   settle(page)       wait until nothing on the page is animating (instead of fixed pauses)
//   report()           ok(name, pass, detail) lines and a final summary
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), net = require('net'), os = require('os');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json' };

function serveStatic() {
  const pub = path.join(ROOT, 'public');
  const srv = http.createServer((q, r) => {
    const f = path.join(pub, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(pub) || !fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
  });
  return new Promise(res => srv.listen(0, '127.0.0.1', () => res({ url: `http://127.0.0.1:${srv.address().port}/`, close: () => srv.close() })));
}

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
/* wrangler dev on a free port, DEV_AUTH=1 (name-only sign-in and debug mode), BUGS_KEY set (bug reports can be read: bugs(id)),
   its own temporary storage (a fresh D1 and Durable Objects) */
async function startServer() {
  const port = await freePort(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eldorado-srv-'));
  const p = spawn('npx', ['wrangler', 'dev', '--ip', '127.0.0.1', '--port', String(port), '--var', 'DEV_AUTH:1', '--var', 'BUGS_KEY:test-key', '--persist-to', dir],
    { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  const url = `http://127.0.0.1:${port}/`, bugs = async id => (await fetch(url + 'api/bugs' + (id ? '?id=' + id : ''), { headers: { 'x-bugs-key': 'test-key' } })).json();
  // sql(statement): run it on the server's own database (to set up a state no page can make, e.g. a retired AI's row)
  const sql = cmd => require('child_process').execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', dir, '--command', cmd], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const stop = () => { try { process.kill(-p.pid, 'SIGTERM'); } catch (e) { /* expected: the server has already exited */ } fs.rmSync(dir, { recursive: true, force: true }); };
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(url + 'api/config'); if (r.ok) return { url, stop, bugs, sql }; } catch (e) { /* expected: not listening yet */ }
    if (p.exitCode !== null) break; await new Promise(r => setTimeout(r, 500));
  }
  stop(); throw new Error('wrangler dev did not start:\n' + out.slice(-2000));
}

/* a test page. The first page error or failed assertion stops the whole test there and then (owner, 2026-10-03: a failure
   is reported the moment it happens; nothing runs on past it): it prints the error with its stack, the page's own log
   (debug.js), and saves a screenshot (test-results/<name>-failed.png), then exits failing. allow: errors a test causes on
   purpose (a regular expression), which only count as page.errors */
async function openPage(browser, name, opts = {}) {
  const { allow, ...ctxOpts } = opts;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...ctxOpts }), page = await ctx.newPage();
  page.errors = [];
  let stopping = false;
  const stop = async (msg, stack) => {
    if (stopping) return; stopping = true;
    const out = [`FAIL ${name}: the page failed, the test stops here`, '  ' + msg, ...String(stack || '').split('\n').slice(1, 12).map(l => '  ' + l.trim())];
    const log = await Promise.race([page.evaluate(() => window.__ED && window.__ED.diagLog ? window.__ED.diagLog().slice(-30) : []).catch(() => [] /* expected: the page is gone or busy; the log is a help, the failure is reported anyway */), new Promise(r => setTimeout(() => r([]), 2000))]);
    if (log.length) out.push('  the page\'s log (last lines):', ...log.map(l => '    ' + l));
    const shot = path.join(ROOT, 'test-results', name.replace(/[^\w.-]+/g, '_') + '-failed.png');
    fs.mkdirSync(path.dirname(shot), { recursive: true });
    if (await Promise.race([page.screenshot({ path: shot }).then(() => true, () => false), new Promise(r => setTimeout(() => r(false), 3000))])) out.push('  screenshot: ' + path.relative(ROOT, shot));
    console.log(out.join('\n'));
    process.exit(1);
  };
  const seen = (msg, stack) => { page.errors.push(`${name}: ${msg}`); if (!(allow && allow.test(msg))) stop(msg, stack); };
  page.on('pageerror', e => seen(e.message, e.stack));
  // (Google's sign-in script and the fonts can't load in the test sandbox: not the page's errors)
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_CERT|ERR_TUNNEL|gsi|fonts/.test(m.text())) seen('console: ' + m.text()); });
  return page;
}
/* nothing finite is animating (card flights, explorer moves, fades); infinite effects (a low clock's pulse) don't count */
// (two frames first: a change can start its animations a frame later, e.g. the hand after the game area was resized)
const settle = (page, ms = 4000) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  .then(() => page.waitForFunction(() => !document.getAnimations().some(a => a.playState === 'running' && a.effect && a.effect.getComputedTiming().endTime !== Infinity), null, { timeout: ms })).catch(() => { /* expected: something still animating after ms; each step's own check waits for what it needs */ });

function report(title) {
  let fails = 0;
  return {
    ok(name, pass, detail) { if (!pass) fails++; console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail !== undefined && detail !== '' ? ': ' + detail : ''}`); return pass; },
    done() { console.log(fails ? `${title}: ${fails} failing` : `${title} ok`); process.exitCode = fails ? 1 : 0; return fails; },
    get fails() { return fails; },
  };
}
/* the CPU a process and everything it started use from now on (Linux /proc, sampled every 200 ms): cpuMeter(pid) -> stop(),
   which returns core-seconds. For a browser: every process of it (the page's renderer, the GPU process, the AI's worker) */
function cpuMeter(rootPid) {
  const tck = 100, seen = new Map(), base = new Map();
  const stat = pid => { try { const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'), f = s.slice(s.lastIndexOf(')') + 2).split(' '); return { ppid: +f[1], cpu: +f[11] + +f[12] }; }
    catch (e) { return null; /* expected: the process exited between the listing and the read */ } };
  const tick = () => { const all = new Map(); for (const d of fs.readdirSync('/proc')) if (/^\d+$/.test(d)) { const s = stat(d); if (s) all.set(+d, s); }
    const mine = new Set([rootPid]); let grew = true; while (grew) { grew = false; for (const [p, s] of all) if (!mine.has(p) && mine.has(s.ppid)) { mine.add(p); grew = true; } }
    for (const p of mine) { const s = all.get(p); if (!s) continue; if (!base.has(p)) base.set(p, 0); seen.set(p, Math.max(seen.get(p) || 0, s.cpu)); } };
  tick(); for (const [p, c] of seen) base.set(p, c); // (what each process had used before: not counted; one started later from 0)
  const iv = setInterval(tick, 200);
  return () => { tick(); clearInterval(iv); let t = 0; for (const [p, c] of seen) t += c - (base.get(p) || 0); return t / tck; };
}
module.exports = { chromium, serveStatic, startServer, openPage, settle, report, cpuMeter, ROOT };
