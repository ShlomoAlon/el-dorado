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
  const stop = () => { try { process.kill(-p.pid, 'SIGTERM'); } catch (e) { /* expected: the server has already exited */ } fs.rmSync(dir, { recursive: true, force: true }); };
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(url + 'api/config'); if (r.ok) return { url, stop, bugs }; } catch (e) { /* expected: not listening yet */ }
    if (p.exitCode !== null) break; await new Promise(r => setTimeout(r, 500));
  }
  stop(); throw new Error('wrangler dev did not start:\n' + out.slice(-2000));
}

async function openPage(browser, name, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts }), page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(`${name}: ${e.message}` + (process.env.STACK ? '\n' + e.stack : '')));
  // (Google's sign-in script and the fonts can't load in the test sandbox: not the page's errors)
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_CERT|ERR_TUNNEL|gsi|fonts/.test(m.text())) page.errors.push(`${name} console: ${m.text()}`); });
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
module.exports = { chromium, serveStatic, startServer, openPage, settle, report, ROOT };
