// Posts the current training run's progress to the site every few seconds (shown live at /train.html).
//   node tools/ai/live.mjs [config=/tmp/claude-0/run.env] [site=https://el-dorado.shlomoalon9.workers.dev]
// Reads the run from the config line (RUN=<name> …) and its log (tools/ai/data/first-<run>.log); the secret token is in
// /tmp/claude-0/train-token (the site only knows its SHA-256). Kept running by supervise.sh.
import { readFileSync, statSync } from 'node:fs';
const [, , CFG = '/tmp/claude-0/run.env', SITE = 'https://el-dorado.shlomoalon9.workers.dev'] = process.argv;
const TOKEN = readFileSync('/tmp/claude-0/train-token', 'utf8').trim();
const BASE = { first: 14.1, hills: 15.3, winding: 16.3, witch: 16.4 }; // arrival of first-multi4-33, the reference
const ONCE = ['giant', 'plane', 'chest'];
const json = s => { try { return JSON.parse(s); } catch (e) { return null; } };

function status() {
  const env = readFileSync(CFG, 'utf8').trim(), run = (env.match(/RUN=(\S+)/) || [])[1];
  if (!run) return { run: 'none', env, phase: { name: 'paused' } };
  const logf = `tools/ai/data/first-${run}.log`; let lines = [];
  try { lines = readFileSync(logf, 'utf8').split('\n').filter(Boolean); } catch (e) { }
  // log times are HH:MM:SS (UTC); turn them into epoch ms, counting forward across midnight
  const end = (() => { try { return statSync(logf).mtimeMs; } catch (e) { return Date.now(); } })();
  const day = new Date(end); day.setUTCHours(0, 0, 0, 0);
  const secs = lines.map(l => { const m = l.match(/^\[(\d\d):(\d\d):(\d\d)\]/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null; });
  const times = new Array(lines.length); let add = 0;
  for (let i = lines.length - 1, next = null; i >= 0; i--) { const s = secs[i]; if (s == null) continue; if (next != null && s > next) add -= 86400; times[i] = day.getTime() + (s + add) * 1000; next = s; }
  const iters = [], events = []; let cur = null, phase = { name: 'starting', since: times[0] || Date.now() };
  lines.forEach((l, i) => {
    const t = times[i], body = l.replace(/^\[[^\]]*\] /, ''), kind = body.split(' ')[0], rest = body.slice(kind.length + 1);
    if (kind === 'STAGE') { const it = +(body.match(/iter (\d+)/) || [])[1]; if (cur && cur.it === it) { cur.start = t; cur.restarted = true; } else { cur = { it, start: t, warn: [] }; iters.push(cur); } phase = { name: 'self-play', since: t, it }; }
    else if (kind === 'GEN' && cur) { const j = json(rest); cur.genEnd = t; if (j) { cur.gen_s = j.secs; cur.capped = j.capped; const b = j.buysNet || {}, tot = Object.values(b).reduce((a, x) => a + x, 0) || 1; cur.buys = Object.fromEntries(ONCE.map(k => [k, +((b[k] || 0) / tot * 100).toFixed(1)])); cur.buysPerGame = +(tot / (j.games || 1)).toFixed(1); } phase = { name: 'training', since: t, it: cur.it }; }
    else if (kind === 'TRAIN' && cur) { const j = json(rest); cur.trainEnd = t; if (j) Object.assign(cur, { train_s: j.secs, dead1: j.dead1, dead2: j.dead2, sat: j.saturated, bias: j.bias, rmse: j.val_rmse, base_rmse: j.predict_mean_rmse }); phase = { name: 'testing', since: t, it: cur.it }; }
    else if (kind === 'WARN') { if (cur) cur.warn.push(rest); events.push({ t, kind, text: rest }); }
    else if (kind === 'HALT') { events.push({ t, kind, text: rest }); phase = { name: 'halted', since: t, text: rest }; }
    else if (kind === 'EVAL' && cur) { const j = json(rest); cur.end = t; if (j && j.arrival) { cur.arrival = Object.fromEntries(Object.entries(j.arrival).map(([k, v]) => [k, v.mean])); cur.test_capped = j.capped; } phase = { name: 'between iterations', since: t }; }
    else if (kind === 'STALL' || kind === 'ERROR') events.push({ t, kind, text: rest });
  });
  const med = a => { a = a.filter(x => x > 0).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
  const done = iters.filter(x => x.end);
  const typical = { 'self-play': med(done.map(x => (x.genEnd - x.start) / 1000)), training: med(done.map(x => (x.trainEnd - x.genEnd) / 1000)), testing: med(done.map(x => (x.end - x.trainEnd) / 1000)) };
  return { run, env, started: times[0] || null, phase, typical, iters: iters.slice(-80), events: events.slice(-30), baseline: BASE };
}

let last = '', lastSent = 0;
async function tick() {
  let st; try { st = status(); } catch (e) { st = { run: 'error', phase: { name: 'error', text: String(e.message || e) } }; }
  const body = JSON.stringify(st);
  if (body === last && Date.now() - lastSent < 60000) return; // unchanged: still send a heartbeat every minute
  try {
    const r = await fetch(SITE + '/api/train', { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ ...st, posted: Date.now() }) });
    if (r.ok) { last = body; lastSent = Date.now(); } else console.error(new Date().toISOString(), 'post failed', r.status, await r.text());
  } catch (e) { console.error(new Date().toISOString(), 'post failed', e.message); }
}
if (process.env.DRY) { console.log(JSON.stringify(status(), null, 1)); process.exit(0); } // DRY=1: print the status once, post nothing
await tick(); setInterval(tick, 5000);
