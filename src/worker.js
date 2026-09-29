/* El Dorado Expedition — Cloudflare Worker.
   - Serves the game page (public/) as static assets.
   - /api/*: Google sign-in, profile, leaderboard, rooms.
   - Room Durable Object: one per game; holds the real game state, checks every
     move with the shared rules engine, sends each player only what they may see,
     runs the turn timer, and records Elo ratings when the game ends.
   - Lobby Durable Object: the live list of open rooms.
   Tables are created automatically on first use; no migrations to run. */
import { DurableObject } from 'cloudflare:workers';
import { E } from './engine.gen.js';
import NET_BIN from './ai/first.bin'; // the AI's neural network as half floats (tools/ai/pack.mjs); wrangler imports .bin as an ArrayBuffer

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const bad = (msg, status = 400) => json({ error: msg }, status);
const CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({ length: 5 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join('');
const TURN_CHOICES = [60, 90, 120, 180, 300];

/* ---------------- abuse limits ----------------
   Enough to keep a lazy flood from taking the site down, not a defence against a real attack.
   Request rates use Cloudflare's rate limiting bindings (ratelimits in wrangler.jsonc; counted per Cloudflare location):
   RL_API every /api request per IP, RL_WRITE sign-ins and room/name changes (per player, or per IP before sign-in),
   RL_UPLOAD replay uploads per IP. A missing binding or a limiter error lets the request through. */
class HttpError extends Error { constructor(msg, status) { super(msg); this.status = status; } }
const clientIp = req => req.headers.get('cf-connecting-ip') || 'local';
async function limited(limiter, key) {
  if (!limiter) return false;
  try { return !(await limiter.limit({ key })).success; } catch (e) { return false; }
}
const tooMany = () => new Response(JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }),
  { status: 429, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'retry-after': '60' } });
const BODY_MAX = 16 * 1024; // JSON bodies other than replay uploads are tiny
async function readBody(req, max = BODY_MAX) {
  if (+(req.headers.get('content-length') || 0) > max) throw new HttpError('Request too large.', 413);
  const text = await req.text(); if (text.length > max) throw new HttpError('Request too large.', 413);
  return text;
}
async function readJSON(req, max) {
  const text = await readBody(req, max); if (!text) return {};
  try { return JSON.parse(text); } catch (e) { throw new HttpError('Bad request.', 400); }
}
/* WebSockets: each person may hold a few connections to a room or the lobby (several tabs), and each connection may send
   a steady few messages a second (bursts allowed). Past that, messages are dropped; a connection that keeps flooding is closed. */
const WS_MSG_MAX = 4096, WS_RATE = 8, WS_BURST = 40, WS_KICK = 200;
const wsBuckets = new WeakMap(); // (in memory: a hibernated Durable Object starts every connection afresh, which is fine)
function wsFlooding(ws, raw) {
  const now = Date.now(); let b = wsBuckets.get(ws);
  if (!b) wsBuckets.set(ws, b = { tokens: WS_BURST, at: now, dropped: 0 });
  b.tokens = Math.min(WS_BURST, b.tokens + (now - b.at) / 1000 * WS_RATE); b.at = now;
  if (typeof raw === 'string' && raw.length <= WS_MSG_MAX && b.tokens >= 1) { b.tokens--; return false; }
  if (++b.dropped >= WS_KICK) try { ws.close(1008, 'Too many messages'); } catch (e) { }
  return true;
}
// past WS_PER_USER connections from one person (tabs, or dead connections not yet noticed), their oldest are closed
const WS_PER_USER = 5;
function dropOldest(ctx, uid, keep) {
  const mine = ctx.getWebSockets(uid).filter(w => w !== keep);
  for (const w of mine.slice(0, Math.max(0, mine.length - (WS_PER_USER - 1)))) try { w.close(1008, 'Too many connections'); } catch (e) { }
}

/* ---------------- database ---------------- */
let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) schemaReady = createSchema(env).catch(e => { schemaReady = null; throw e; });
  return schemaReady;
}
const aiUid = id => 'ai-' + id; // the named AIs are players in the users table (bot = AI id, no Google account)
async function createSchema(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, google_sub TEXT UNIQUE, name TEXT NOT NULL UNIQUE COLLATE NOCASE, rating REAL NOT NULL DEFAULT 1200, games INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS users_rating ON users(rating DESC)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY, room TEXT, finished INTEGER, data TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS replays(id TEXT PRIMARY KEY, created INTEGER NOT NULL, title TEXT, players TEXT, actions INTEGER, body TEXT NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS replays_created ON replays(created DESC)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS train(run TEXT PRIMARY KEY, updated INTEGER NOT NULL, body TEXT NOT NULL)`),
  ]);
  try { await env.DB.prepare(`ALTER TABLE users ADD COLUMN bot TEXT`).run(); } catch (e) { } // already there
  // replays of online games (game=1) are kept for good; uids = ',uid1,uid2,' (who played); listed=0: a private room's game
  // places: JSON array of finishing places, in the order of uids
  for (const c of ['game INTEGER NOT NULL DEFAULT 0', 'uids TEXT', 'listed INTEGER NOT NULL DEFAULT 1', 'places TEXT'])
    try { await env.DB.prepare(`ALTER TABLE replays ADD COLUMN ${c}`).run(); } catch (e) { }
  // game logs from before log v3 were played under older rules and can't be replayed: deleted, once (ratings stay).
  // (a failure only means it runs again on the next start)
  try {
    if (!(await env.DB.prepare(`SELECT v FROM settings WHERE k='logs_v3'`).first()))
      await env.DB.batch([env.DB.prepare(`DELETE FROM replays WHERE CASE WHEN json_valid(body) THEN json_extract(body,'$.v') IS NOT 3 ELSE 1 END`),
        env.DB.prepare(`INSERT OR IGNORE INTO settings(k,v) VALUES('logs_v3','1')`)]);
  } catch (e) { }
  for (const A of E.AIS) { // one rated player per named AI; if a person already has the name, the AI gets "(AI)" after it
    const id = aiUid(A.id);
    if (await env.DB.prepare(`SELECT id FROM users WHERE id=?`).bind(id).first()) continue;
    for (const name of [A.name, A.name + ' (AI)', A.name + ' (AI) ' + id.slice(-4)]) {
      const r = await env.DB.prepare(`INSERT OR IGNORE INTO users(id,google_sub,name,created,bot) VALUES(?,NULL,?,?,?)`).bind(id, name, Date.now(), A.id).run();
      if (r.meta && r.meta.changes) break;
    }
  }
  // The AIs start from the ratings measured in AI-vs-AI games (AIS[].rating, tools/ai/calibrate_ais.mjs) instead of the
  // default 1200, applied as a shift (rating += calibrated - applied), so an AI that already played rated games keeps what it
  // won or lost, and a new calibration later moves it by the difference. settings 'ai_rating:<id>' holds the rating applied
  // (before these keys existed, the first calibration was recorded in 'ai_calibration_v1'). Each shift and its key are
  // written in one transaction, conditional on the key still holding the old value: it applies exactly once, whichever
  // isolate gets here first.
  const v1 = await env.DB.prepare(`SELECT v FROM settings WHERE k='ai_calibration_v1'`).first();
  const first = v1 ? (JSON.parse(v1.v).ratings || {}) : {};
  for (const A of E.AIS.filter(A => Number.isFinite(A.rating))) {
    const k = 'ai_rating:' + A.id, row = await env.DB.prepare(`SELECT v FROM settings WHERE k=?`).bind(k).first();
    const applied = row ? +row.v : Number.isFinite(first[A.id]) ? first[A.id] : 1200;
    if (row && applied === A.rating) continue;
    await env.DB.batch([
      env.DB.prepare(`UPDATE users SET rating = rating + ? WHERE id = ? AND COALESCE((SELECT v FROM settings WHERE k = ?), ?) = ?`).bind(A.rating - applied, aiUid(A.id), k, String(applied), String(applied)),
      env.DB.prepare(`INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v WHERE settings.v = ?`).bind(k, String(A.rating), String(applied)),
    ]);
  }
}
let NET = null;
function useNet() { if (!NET) NET = E.aiNetDecode(NET_BIN); E.aiSetNet(NET); }
let secretCache = null;
async function sessionSecret(env) {
  if (secretCache) return secretCache;
  const fresh = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare(`INSERT OR IGNORE INTO settings(k,v) VALUES('session_secret',?)`).bind(fresh).run();
  const row = await env.DB.prepare(`SELECT v FROM settings WHERE k='session_secret'`).first();
  secretCache = row.v; return secretCache;
}

/* ---------------- tokens ---------------- */
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uDecode = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
async function hmac(env, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(await sessionSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
async function makeToken(env, uid) { const exp = Date.now() + 60 * 24 * 3600e3; const body = uid + '.' + exp; return body + '.' + await hmac(env, body); }
async function readToken(env, tok) {
  if (!tok || typeof tok !== 'string') return null;
  const parts = tok.split('.'); if (parts.length !== 3) return null;
  const [uid, exp, sig] = parts; if (+exp < Date.now()) return null;
  const want = await hmac(env, uid + '.' + exp);
  if (want.length !== sig.length) return null;
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? uid : null;
}
async function authUser(req, env) {
  const url = new URL(req.url);
  const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('t');
  const uid = await readToken(env, tok); if (!uid) return null;
  return await env.DB.prepare(`SELECT id,name,rating,games,wins FROM users WHERE id=?`).bind(uid).first();
}

/* ---------------- Google sign-in ---------------- */
let jwksCache = { at: 0, keys: [] };
async function googleKeys() {
  if (Date.now() - jwksCache.at < 3600e3 && jwksCache.keys.length) return jwksCache.keys;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs'); const j = await r.json();
  jwksCache = { at: Date.now(), keys: j.keys || [] }; return jwksCache.keys;
}
export async function verifyGoogleToken(cred, clientId, keysFn = googleKeys) {
  const [h, p, s] = String(cred || '').split('.'); if (!s) throw new Error('bad token');
  const header = JSON.parse(new TextDecoder().decode(b64uDecode(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64uDecode(p)));
  if (payload.aud !== clientId) throw new Error('token not for this app');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw new Error('bad issuer');
  if (payload.exp * 1000 < Date.now()) throw new Error('token expired');
  const jwk = (await keysFn()).find(k => k.kid === header.kid); if (!jwk) throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uDecode(s), enc.encode(h + '.' + p));
  if (!ok) throw new Error('bad signature');
  return payload;
}
const cleanName = n => String(n || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 16) || 'Explorer';
async function uniqueName(env, base, exceptId = '') {
  base = cleanName(base);
  for (let i = 0; i < 50; i++) {
    const n = i ? (base.slice(0, 13) + (i + 1)) : base;
    const row = await env.DB.prepare(`SELECT id FROM users WHERE name=? COLLATE NOCASE`).bind(n).first();
    if (!row || row.id === exceptId) return n;
  }
  return base.slice(0, 10) + Math.floor(Math.random() * 1e5);
}
async function upsertUser(env, sub, displayName) {
  let u = await env.DB.prepare(`SELECT id,name,rating,games,wins FROM users WHERE google_sub=?`).bind(sub).first();
  if (u) return { user: u, isNew: false };
  const id = 'u' + [...crypto.getRandomValues(new Uint8Array(9))].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
  const name = await uniqueName(env, displayName);
  await env.DB.prepare(`INSERT INTO users(id,google_sub,name,created) VALUES(?,?,?,?)`).bind(id, sub, name, Date.now()).run();
  u = await env.DB.prepare(`SELECT id,name,rating,games,wins FROM users WHERE id=?`).bind(id).first();
  return { user: u, isNew: true };
}

async function createRoom(env, uid, opts) {
  for (let i = 0; i < 8; i++) {
    const code = genCode();
    const room = env.ROOMS.get(env.ROOMS.idFromName(code));
    const r = await (await room.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code, uid, opts }) })).json();
    if (r.ok) return code;
  }
  return null;
}
const REPLAY_MAX_BYTES = 1.9e6, // D1 rows hold at most 2 MB
      REPLAY_KEEP = 1000, // uploaded logs
      REPLAYS_PER_PLAYER = 10; // online games: each player's latest are kept
const MATCH_SIZE = 3; // quick-match rooms start by themselves once this many have joined,
                      // or earlier (with 2+) when everyone in the room asks to start now

/* ---------------- worker entry ---------------- */
export default {
  async fetch(req, env) {
    const url = new URL(req.url); const p = url.pathname;
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(req);
    let m0;
    const ip = clientIp(req), write = req.method !== 'GET' && req.method !== 'HEAD';
    if (await limited(env.RL_API, ip)) return tooMany();
    try {
      if (p === '/api/replays' && write && await limited(env.RL_UPLOAD, ip)) return tooMany();
      if (p.startsWith('/api/auth/') && await limited(env.RL_WRITE, 'ip:' + ip)) return tooMany();
      await ensureSchema(env);
      // AI training progress (/train.html polls it): the training machine posts its run's status with a secret token
      // whose SHA-256 is TRAIN_TOKEN_HASH (wrangler.jsonc); anyone may read it
      if (p === '/api/train' && req.method === 'POST') {
        const tok = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
        const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tok)))].map(b => b.toString(16).padStart(2, '0')).join('');
        if (!env.TRAIN_TOKEN_HASH || h !== env.TRAIN_TOKEN_HASH) return bad('Not allowed', 403);
        const text = await readBody(req, 300000);
        let st; try { st = JSON.parse(text); } catch (e) { return bad('Not JSON', 400); }
        await env.DB.prepare(`INSERT INTO train(run,updated,body) VALUES(?,?,?) ON CONFLICT(run) DO UPDATE SET updated=excluded.updated, body=excluded.body`).bind(String(st.run || 'run').slice(0, 40), Date.now(), text).run();
        return json({ ok: true });
      }
      if (p === '/api/train') {
        const r = await env.DB.prepare(`SELECT updated, body FROM train ORDER BY updated DESC LIMIT 1`).first();
        return r ? new Response(`{"updated":${r.updated},"now":${Date.now()},"status":${r.body}}`, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }) : json({ updated: null, now: Date.now(), status: null });
      }
      if (p === '/api/config') return json({ google: env.GOOGLE_CLIENT_ID || null, dev: env.DEV_AUTH === '1' });
      if (p === '/api/auth/google' && req.method === 'POST') {
        if (!env.GOOGLE_CLIENT_ID) return bad('Google sign-in is not set up yet (GOOGLE_CLIENT_ID).', 500);
        const { credential } = await readJSON(req);
        let g; try { g = await verifyGoogleToken(credential, env.GOOGLE_CLIENT_ID); } catch (e) { return bad('Google sign-in failed: ' + e.message, 401); }
        const { user, isNew } = await upsertUser(env, 'g:' + g.sub, g.given_name || g.name || 'Explorer');
        return json({ token: await makeToken(env, user.id), user, isNew });
      }
      if (p === '/api/auth/dev' && req.method === 'POST') { // local testing only (DEV_AUTH=1 in .dev.vars)
        if (env.DEV_AUTH !== '1') return bad('Not found', 404);
        const { name } = await readJSON(req);
        const { user, isNew } = await upsertUser(env, 'dev:' + cleanName(name).toLowerCase(), name);
        return json({ token: await makeToken(env, user.id), user, isNew });
      }
      // game logs anyone can upload and watch step by step (/?replay=<id>); the page rebuilds the game from the log
      if (p === '/api/replays' && req.method === 'POST') {
        const text = await readBody(req, REPLAY_MAX_BYTES).catch(e => { if (e.status === 413) throw new HttpError('That game log is too large.', 413); throw e; });
        let log; try { log = JSON.parse(text); } catch (e) { return bad('That file is not valid JSON.', 400); }
        const err = E.replayCheck(log); if (err) return bad(err, 400);
        const id = [...crypto.getRandomValues(new Uint8Array(8))].map(b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
        const title = String(log.title || '').slice(0, 120), players = log.players.map(x => String(x.name || '').slice(0, 24)).join(', ');
        await env.DB.prepare(`INSERT INTO replays(id,created,title,players,actions,body) VALUES(?,?,?,?,?,?)`).bind(id, Date.now(), title, players, log.actions.length, text).run();
        await env.DB.prepare(`DELETE FROM replays WHERE game=0 AND id NOT IN (SELECT id FROM replays WHERE game=0 ORDER BY created DESC LIMIT ${REPLAY_KEEP})`).run();
        return json({ id });
      }
      if (p === '/api/replays' && req.method === 'GET') {
        const r = await env.DB.prepare(`SELECT id,created,title,players,actions FROM replays WHERE listed=1 ORDER BY created DESC LIMIT 50`).all();
        return json({ replays: r.results });
      }
      if ((m0 = p.match(/^\/api\/replays\/([a-z0-9]{6,12})$/)) && req.method === 'GET') {
        const r = await env.DB.prepare(`SELECT body FROM replays WHERE id=?`).bind(m0[1]).first();
        return r ? new Response(r.body, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' } }) : bad('No replay with that id.', 404);
      }
      // a player's profile: stats and their most recent games (each with its replay). Private rooms' games only for the player.
      if ((m0 = p.match(/^\/api\/users\/([A-Za-z0-9_-]{1,40})$/)) && req.method === 'GET') {
        const u = await env.DB.prepare(`SELECT id,name,rating,games,wins,bot FROM users WHERE id=?`).bind(m0[1]).first();
        if (!u) return bad('No such player.', 404);
        const me = await authUser(req, env).catch(() => null), own = !!me && me.id === u.id;
        const rank = await env.DB.prepare(`SELECT COUNT(*)+1 AS r FROM users WHERE (games>0 OR bot IS NOT NULL) AND rating>?`).bind(u.rating).first();
        const g = await env.DB.prepare(`SELECT id,created,title,actions,uids,places FROM replays WHERE game=1 AND uids LIKE ?${own ? '' : ' AND listed=1'} ORDER BY created DESC LIMIT ${REPLAYS_PER_PLAYER}`).bind('%,' + u.id + ',%').all();
        const games = g.results.map(r => { const i = r.uids.split(',').filter(Boolean).indexOf(u.id), pl = r.places ? JSON.parse(r.places) : null;
          return { id: r.id, created: r.created, title: r.title, actions: r.actions, place: pl ? pl[i] : null, of: pl ? pl.length : null }; });
        return json({ user: { ...u, rank: rank.r }, games });
      }
      if (p === '/api/leaderboard') {
        const r = await env.DB.prepare(`SELECT id,name,rating,games,wins,bot FROM users WHERE games>0 OR bot IS NOT NULL ORDER BY rating DESC LIMIT 100`).all();
        return json({ players: r.results.filter(p => !p.bot || E.aiById(p.bot)) }); // retired AIs leave the list
      }
      const user = await authUser(req, env);
      if (!user) return bad('Please sign in.', 401);
      if (write && await limited(env.RL_WRITE, 'u:' + user.id)) return tooMany();
      const lobby = env.LOBBY.get(env.LOBBY.idFromName('main'));
      if (p === '/api/me' && req.method === 'GET') {
        const active = await (await lobby.fetch('https://lobby/find?uid=' + encodeURIComponent(user.id))).json();
        return json({ user, active: active.code || null });
      }
      if (p === '/api/me' && req.method === 'PATCH') {
        const { name } = await readJSON(req);
        const n = await uniqueName(env, name, user.id);
        await env.DB.prepare(`UPDATE users SET name=? WHERE id=?`).bind(n, user.id).run();
        return json({ user: { ...user, name: n } });
      }
      if (p === '/api/rooms' && req.method === 'POST') {
        const b = await readJSON(req).catch(e => { if (e.status === 413) throw e; return {}; });
        const opts = { max: Math.min(4, Math.max(2, +b.max || 3)), course: b.course === 'random' || E.courseById(b.course) ? b.course : E.COURSES[0].id, turn: TURN_CHOICES.includes(+b.turn) || (env.DEV_AUTH === '1' && +b.turn >= 5) ? +b.turn : 90, pub: b.pub !== false, rated: b.rated !== false, auto: false };
        const busy = await (await lobby.fetch('https://lobby/find?busy=1&uid=' + encodeURIComponent(user.id))).json();
        if (busy.code) return bad(`You're already in a game (${busy.code}). Rejoin it, or leave it, before opening another.`, 409);
        const code = await createRoom(env, user.id, opts);
        return code ? json({ code }) : bad('Could not create a room, try again.', 500);
      }
      if (p === '/api/match' && req.method === 'POST') { // quick match: join the fullest waiting public match room, or open one
        const r = await (await lobby.fetch('https://lobby/match', { method: 'POST', body: JSON.stringify({ uid: user.id, dev: env.DEV_AUTH === '1' }) })).json();
        return r.code ? json({ code: r.code }) : bad('Could not find or open a match, try again.', 500);
      }
      let m;
      if ((m = p.match(/^\/api\/rooms\/([A-Z0-9]{4,6})\/ws$/))) {
        if (req.headers.get('upgrade') !== 'websocket') return bad('Expected a WebSocket', 426);
        const room = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
        const busy = await (await lobby.fetch('https://lobby/find?busy=1&uid=' + encodeURIComponent(user.id))).json();
        const h = new Headers(req.headers); h.set('x-uid', user.id); h.set('x-name', user.name); h.set('x-busy', busy.code || '');
        return room.fetch(new Request('https://room/ws', { headers: h }));
      }
      if (p === '/api/lobby/ws') {
        if (req.headers.get('upgrade') !== 'websocket') return bad('Expected a WebSocket', 426);
        const h = new Headers(req.headers); h.set('x-uid', user.id);
        return lobby.fetch(new Request('https://lobby/ws', { headers: h }));
      }
      return bad('Not found', 404);
    } catch (e) {
      if (e instanceof HttpError) return bad(e.message, e.status);
      console.error(e); // (in the dashboard's logs; the page gets no internals)
      return bad('Server error, please try again.', 500);
    }
  }
};

/* ---------------- Lobby: live list of rooms ---------------- */
const LOBBY_WS_MAX = 2000, LOBBY_ROOMS = 500;
export class Lobby extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.rooms = null; ctx.blockConcurrencyWhile(async () => { this.rooms = (await ctx.storage.get('rooms')) || {}; }); }
  prune() { const now = Date.now(); for (const c in this.rooms) { const r = this.rooms[c]; if (now - r.updated > (r.status === 'playing' ? 12 : 2) * 3600e3) delete this.rooms[c]; } }
  // at most LOBBY_ROOMS rooms are kept (the least recently updated go first), so a flood of new rooms can't grow it without end
  cap() { const cs = Object.keys(this.rooms); if (cs.length <= LOBBY_ROOMS) return; cs.sort((a, b) => this.rooms[a].updated - this.rooms[b].updated).slice(0, cs.length - LOBBY_ROOMS).forEach(c => delete this.rooms[c]); }
  list() { return Object.values(this.rooms).filter(r => r.pub !== false && (r.status === 'lobby' || r.status === 'playing')).map(r => ({ code: r.code, host: r.host, names: r.names, count: r.names.length, max: r.max, status: r.status, course: r.course, turn: r.turn, rated: r.rated !== false, ai: (r.uids || []).filter(u => u.startsWith('ai-')).length, auto: !!r.auto })); }
  broadcast() { const msg = JSON.stringify({ t: 'rooms', rooms: this.list() }); for (const ws of this.ctx.getWebSockets()) { try { ws.send(msg); } catch (e) { } } }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const uid = req.headers.get('x-uid') || '';
      if (this.ctx.getWebSockets().length >= LOBBY_WS_MAX) return tooMany();
      const pair = new WebSocketPair(); this.ctx.acceptWebSocket(pair[1], [uid]); dropOldest(this.ctx, uid, pair[1]); pair[1].send(JSON.stringify({ t: 'rooms', rooms: this.list() })); return new Response(null, { status: 101, webSocket: pair[0] }); }
    if (url.pathname === '/update') {
      const r = await req.json();
      if (r.status === 'closed' || r.status === 'over') delete this.rooms[r.code]; else this.rooms[r.code] = { ...r, updated: Date.now() };
      this.prune(); this.cap(); await this.ctx.storage.put('rooms', this.rooms); this.broadcast(); return json({ ok: true });
    }
    if (url.pathname === '/match') {
      const { uid, dev } = await req.json(); const now = Date.now();
      const mine = Object.values(this.rooms).find(x => (x.busy || x.uids || []).includes(uid) && (x.status === 'lobby' || x.status === 'playing'));
      if (mine) return json({ code: mine.code });
      const open = Object.values(this.rooms).filter(x => x.auto && x.status === 'lobby' && x.names.length < x.max && now - x.updated < 15 * 60e3).sort((a, b) => b.names.length - a.names.length);
      if (open.length) return json({ code: open[0].code });
      const opts = { max: MATCH_SIZE, course: 'random', turn: dev ? 20 : 90, pub: true, rated: true, auto: true };
      const code = await createRoom(this.env, uid, opts); if (!code) return json({ code: null });
      // listed right away so a second quick-matcher lands in the same room
      this.rooms[code] = { code, host: '', names: [], uids: [], max: MATCH_SIZE, status: 'lobby', course: 'random', turn: opts.turn, pub: true, auto: true, updated: now };
      await this.ctx.storage.put('rooms', this.rooms); this.broadcast(); return json({ code });
    }
    // the room a person is in; busy=1: only a room they are still playing in (waiting to start, or racing: not resigned or finished)
    if (url.pathname === '/find') {
      const uid = url.searchParams.get('uid'), busy = url.searchParams.get('busy') === '1';
      const r = Object.values(this.rooms).find(x => (busy ? (x.status === 'lobby' || x.status === 'playing') && (x.busy || x.uids || []) : (x.uids || [])).includes(uid));
      return json({ code: r ? r.code : null });
    }
    return bad('Not found', 404);
  }
  async webSocketMessage(ws, msg) { if (wsFlooding(ws, msg)) return; if (msg === 'ping') ws.send('pong'); }
  async webSocketClose(ws, code) { try { ws.close(code); } catch (e) { } }
}

/* each player keeps their REPLAYS_PER_PLAYER latest online games: an older game's replay goes once it is past that for
   every person who played it (the AIs play too many games to count) */
async function pruneReplays(DB, uids) {
  const people = uid => !uid.startsWith('ai-');
  for (const uid of uids.filter(people)) {
    const old = (await DB.prepare(`SELECT id,created,uids FROM replays WHERE game=1 AND uids LIKE ? ORDER BY created DESC LIMIT -1 OFFSET ${REPLAYS_PER_PLAYER}`).bind('%,' + uid + ',%').all()).results;
    for (const r of old) {
      let keep = false;
      for (const o of r.uids.split(',').filter(x => x && x !== uid && people(x))) {
        const n = await DB.prepare(`SELECT COUNT(*) AS n FROM replays WHERE game=1 AND uids LIKE ? AND created>?`).bind('%,' + o + ',%', r.created).first();
        if (n.n < REPLAYS_PER_PLAYER) { keep = true; break; }
      }
      if (!keep) await DB.prepare(`DELETE FROM replays WHERE id=?`).bind(r.id).run();
    }
  }
}
/* ---------------- Room: one live game ---------------- */
const mapCache = new Map();
function mapFor(S) { const k = S.course.id + ':' + S.seed; let m = mapCache.get(k); if (!m) { m = E.mapFor(S); mapCache.set(k, m); if (mapCache.size > 200) mapCache.delete(mapCache.keys().next().value); } return m; }
const PCOLORS = ['#e5484d', '#efe9dc', '#9d7df7', '#ff9636']; // matches COLORS: one explorer figure per colour
const AI_RULE = 'AI players play First Expedition with 3 or 4 players for now.';
const ROOM_WS_MAX = 100; // players and watchers
const PLAYER_ACTIONS = ['move', 'native', 'pay', 'action', 'trash', 'transmit', 'buy', 'end', 'resign']; // what a player may send

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.d = null; this.S = null; this.rec = null;
    // storage: d (the room) and rec (the game's record: engine recNewGame). The game state S is rebuilt from rec. rec holds the
    // secret shuffle seed, so it is never sent out; once the game is over it is saved as the game's replay.
    ctx.blockConcurrencyWhile(async () => {
      this.d = (await ctx.storage.get('d')) || null; this.rec = (await ctx.storage.get('rec')) || null;
      if (this.rec && E.replayCheck(this.rec)) this.rec = null; // recorded under older rules: it can't be rebuilt
      if (this.rec) this.load();
      else if (this.d && this.d.status === 'playing') this.d.status = 'closed'; // a game this version can't rebuild
    });
  }
  // S from the record, plus who plays each seat
  load() { const g = E.recState(this.rec); this.S = g.S; this.S.owners = this.d.seats.map(s => s.uid); this.S.room = this.d.code; mapCache.set(this.S.course.id + ':' + this.S.seed, g.MAP); }
  async persist() { await this.ctx.storage.put(this.rec ? { d: this.d, rec: this.rec } : { d: this.d }); }
  engine() { E.S = this.S; E.MAP = mapFor(this.S); return E; }
  summary() { const d = this.d; return { code: d.code, host: (d.seats.find(s => s.uid === d.host) || d.seats[0] || {}).name || '', names: d.seats.map(s => s.name), uids: d.seats.map(s => s.uid), max: d.opts.max, status: d.status, course: d.opts.course, turn: d.opts.turn, pub: d.opts.pub !== false, rated: d.opts.rated !== false, auto: !!d.opts.auto, busy: this.busyUids() }; }
  // people who can't open or join another game while in this one: everyone seated before it starts, then whoever is still racing
  busyUids() {
    const d = this.d; if (d.status === 'lobby') return d.seats.filter(s => !s.ai).map(s => s.uid);
    if (d.status !== 'playing' || !this.S) return [];
    return this.S.players.map((p, i) => !p.ai && !p.resigned && !p.pieces.every(k => k === 'done') ? this.S.owners[i] : null).filter(Boolean);
  }
  async tellLobby() { try { const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName('main')); await lobby.fetch('https://lobby/update', { method: 'POST', body: JSON.stringify(this.summary()) }); } catch (e) { } }
  online(uid) { return this.ctx.getWebSockets(uid).length > 0; }
  roomInfo() { const d = this.d; return { code: d.code, host: d.host, status: d.status, opts: d.opts, seats: d.seats.map(s => ({ uid: s.uid, name: s.name, color: s.color, now: !!s.now, ai: s.ai || null, online: !!s.ai || this.online(s.uid) })), results: d.results || null }; }
  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (e) { } }
  stateFor(uid, ev) {
    const seat = this.S.owners.indexOf(uid);
    return { t: 'state', S: E.redact(this.S, seat), ev: ev || [], seat, undo: seat >= 0 && seat === this.S.cur && E.recCanUndo(this.rec), deadline: this.d.deadline || null, now: Date.now(), room: this.roomInfo() };
  }
  sendAll(ev) {
    for (const ws of this.ctx.getWebSockets()) {
      const { uid } = ws.deserializeAttachment() || {};
      if (this.S && this.d.status !== 'lobby') this.send(ws, this.stateFor(uid, ev)); else this.send(ws, { t: 'room', room: this.roomInfo() });
    }
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/init') {
      if (this.d) return json({ ok: false });
      const b = await req.json();
      this.d = { code: b.code, host: b.uid, seats: [], status: 'lobby', opts: b.opts, created: Date.now(), deadline: null, timeouts: {}, rated: false, results: null };
      await this.persist(); return json({ ok: true });
    }
    if (url.pathname === '/ws') {
      if (!this.d || this.d.status === 'closed') return new Response('No such room', { status: 404 });
      const uid = req.headers.get('x-uid'), name = req.headers.get('x-name');
      if (this.ctx.getWebSockets().length >= ROOM_WS_MAX && !this.d.seats.some(s => s.uid === uid)) return tooMany(); // (players always get in)
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], [uid]); pair[1].serializeAttachment({ uid, name }); dropOldest(this.ctx, uid, pair[1]);
      const elsewhere = req.headers.get('x-busy'); // one game at a time: someone still in another room only watches this one
      if (this.d.status === 'lobby' && !this.d.seats.find(s => s.uid === uid) && elsewhere && elsewhere !== this.d.code)
        this.send(pair[1], { t: 'error', msg: `You're already in a game (${elsewhere}). Leave it to take a seat here.` });
      else if (this.d.status === 'lobby' && !this.d.seats.find(s => s.uid === uid) && this.d.seats.length < this.d.opts.max) {
        const used = this.d.seats.map(s => s.color);
        this.d.seats.push({ uid, name, color: PCOLORS.find(c => !used.includes(c)) });
        if (!this.d.seats.find(s => s.uid === this.d.host)) this.d.host = uid;
        if (await this.seatsChanged()) return new Response(null, { status: 101, webSocket: pair[0] });
        await this.persist(); this.tellLobby();
      }
      this.sendAll();
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return bad('Not found', 404);
  }
  async webSocketMessage(ws, raw) {
    if (wsFlooding(ws, raw)) return;
    if (raw === 'ping') { ws.send('pong'); return; }
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const { uid } = ws.deserializeAttachment() || {};
    const d = this.d; if (!d || !uid) return;
    const err = msg => this.send(ws, { t: 'error', msg });
    if (d.status === 'lobby') {
      const seat = d.seats.find(s => s.uid === uid);
      if (m.t === 'color' && seat && PCOLORS.includes(m.color) && !d.seats.some(s => s !== seat && s.color === m.color)) { seat.color = m.color; await this.persist(); this.sendAll(); }
      else if (m.t === 'leave') {
        if (d.opts.auto) { // match rooms never close on the host; the next player hosts
          d.seats = d.seats.filter(s => s.uid !== uid); if (d.host === uid && d.seats.length) d.host = d.seats[0].uid;
          if (!d.seats.length) d.status = 'closed';
          await this.seatsChanged(); await this.persist(); this.tellLobby(); this.sendAll(); try { ws.close(1000, 'Left'); } catch (e) { } return;
        }
        if (uid === d.host) { d.status = 'closed'; await this.persist(); this.tellLobby(); this.sendAll(); for (const w of this.ctx.getWebSockets()) try { w.close(1000, 'Room closed'); } catch (e) { } return; }
        d.seats = d.seats.filter(s => s.uid !== uid); await this.persist(); this.tellLobby(); this.sendAll(); try { ws.close(1000, 'Left'); } catch (e) { }
      }
      else if (m.t === 'addAI') { // host seats a named AI (each at most once per room); it plays server-side
        if (d.opts.auto || uid !== d.host) return err('Only the host can add AI players.');
        const A = E.aiById(m.ai); if (!A) return err('Unknown AI.');
        if (!E.aiAllowed(d.opts.course, d.opts.max)) return err(AI_RULE);
        if (d.seats.length >= d.opts.max) return err('This room is full.');
        // the same AI may take several seats (named Humboldt, Humboldt 2, …; they share its rating)
        const row = await this.env.DB.prepare(`SELECT name FROM users WHERE id=?`).bind(aiUid(A.id)).first().catch(() => null);
        if (d.status !== 'lobby' || d.seats.length >= d.opts.max) return err('This room is full.'); // checked again: other messages ran during the await
        const used = d.seats.map(s => s.color), base = row ? row.name : A.name, k = d.seats.filter(s => s.ai === A.id).length;
        d.seats.push({ uid: aiUid(A.id), name: k ? base + ' ' + (k + 1) : base, color: PCOLORS.find(c => !used.includes(c)), ai: A.id });
        await this.persist(); this.tellLobby(); this.sendAll();
      }
      else if (m.t === 'removeAI') {
        if (uid !== d.host) return err('Only the host can remove AI players.');
        const i = d.seats.map(s => !!s.ai && s.uid === m.uid).lastIndexOf(true); if (i >= 0) d.seats.splice(i, 1); await this.persist(); this.tellLobby(); this.sendAll();
      }
      else if (m.t === 'rated' && uid === d.host && !d.opts.auto) { d.opts.rated = !!m.v; await this.persist(); this.tellLobby(); this.sendAll(); }
      else if (m.t === 'now' && seat && d.opts.auto) { seat.now = !seat.now; if (await this.seatsChanged()) return; await this.persist(); this.sendAll(); }
      else if (m.t === 'start') {
        if (d.opts.auto) return;
        if (uid !== d.host) return err('Only the host can start.');
        if (d.seats.length < 2) return err('You need at least 2 players.');
        if (d.seats.some(s => s.ai) && !E.aiAllowed(d.opts.course, d.seats.length)) return err(AI_RULE);
        await this.startGame();
      }
      return;
    }
    if (d.status !== 'playing' || !this.S) return;
    const seat = this.S.owners.indexOf(uid);
    if (m.t === 'undo') {
      if (seat !== this.S.cur || !E.recCanUndo(this.rec)) return err('Nothing to undo.');
      this.rec.actions.pop(); this.load(); await this.persist(); this.sendAll(); return;
    }
    if (m.t === 'act') {
      if (seat < 0) return err('You are watching this game.');
      if (!m.a || typeof m.a !== 'object') return err('Bad action.');
      if (!PLAYER_ACTIONS.includes(m.a.t)) return err('Bad action.'); // (timeout and endgame are the server's and local play's, not a player's)
      const eng = this.engine(); const prevCur = this.S.cur; let r;
      try { r = eng.recApply(this.rec, seat, m.a); } catch (e) { r = { ok: false, err: 'Bad action.' }; }
      // a refused action (or an engine exception) must never leave the game half-changed: rebuild it from the record
      if (!r.ok) { this.load(); return err(r.err); }
      this.S = E.S; d.timeouts[seat] = 0;
      if (this.S.cur !== prevCur && !this.S.over) await this.nextTurn();
      await this.afterChange(r.ev); return;
    }
  }
  // quick-match rooms start themselves when full, or when all of 2+ players asked to start now. Returns true if it started.
  async seatsChanged() {
    const d = this.d; if (!d.opts.auto || d.status !== 'lobby') return false;
    if (d.seats.length >= d.opts.max || (d.seats.length >= 2 && d.seats.every(s => s.now))) { await this.startGame(); return true; }
    return false;
  }
  async startGame() {
    const d = this.d;
    this.rec = E.recNewGame({ course: E.courseById(d.opts.course) || E.COURSES[Math.floor(Math.random() * E.COURSES.length)], seed: (Math.random() * 1e9) | 0, players: d.seats.map(s => ({ name: s.name, color: s.color, ai: s.ai || undefined })), fullRace: true });
    this.S = E.S; this.S.owners = d.seats.map(s => s.uid); this.S.room = d.code; mapCache.set(this.S.course.id + ':' + this.S.seed, E.MAP);
    d.status = 'playing'; d.timeouts = {}; d.bank = {}; d.clock = null;
    await this.nextTurn(); await this.persist(); this.tellLobby(); this.sendAll();
  }
  async afterChange(ev) {
    if (this.S.log.length > 120) this.S.log = this.S.log.slice(-120);
    if (this.S.over && this.d.status === 'playing') await this.finish();
    else { const b = this.busyUids().join(); if (b !== this.lastBusy) { this.lastBusy = b; this.tellLobby(); } } // someone resigned or finished: free for another game
    await this.persist(); this.sendAll(ev);
  }
  /* time bank: each turn adds opts.turn seconds to the player's clock, and time not used carries over to their later
     turns (undo doesn't change it). d.bank[seat] = ms left when their last turn ended; d.clock = whose clock is running. */
  settleClock() {
    const d = this.d; if (d.clock == null || !d.deadline) { d.clock = null; return; }
    d.bank = d.bank || {}; d.bank[d.clock] = Math.max(0, d.deadline - Date.now()); d.clock = null;
  }
  async startTurnTimer() {
    this.settleClock(); const d = this.d, seat = this.S.cur;
    d.clock = seat; d.deadline = Date.now() + ((d.bank && d.bank[seat]) || 0) + d.opts.turn * 1000; d.aiAt = null;
    await this.ctx.storage.setAlarm(this.d.deadline);
  }
  /* the turn passed to someone new: a person gets the turn timer, an AI gets its next move scheduled (same alarm) */
  async nextTurn() { if (this.aiToMove()) await this.scheduleAI(900); else await this.startTurnTimer(); }
  aiToMove() { return !!(this.S && !this.S.over && this.S.players[this.S.cur].ai); }
  // someone is following the game: a person still racing with the page open. Otherwise the AIs play on without pauses.
  watched() { return this.S.players.some((p, i) => !p.ai && !p.resigned && !p.pieces.every(k => k === 'done') && this.online(this.S.owners[i])); }
  async scheduleAI(ms) { this.settleClock(); const d = this.d; d.deadline = null; d.aiAt = Date.now() + (this.watched() ? ms : 0); await this.ctx.storage.setAlarm(d.aiAt); }
  /* AI seats play server-side, one action per alarm while people watch (so the table can follow),
     or up to ~0.3 s of actions per alarm when nobody is racing with the page open */
  async aiMove() {
    const eng = this.engine(); useNet(); const ev = []; const t0 = Date.now(); const fast = !this.watched();
    this.aiMem = this.aiMem || {};
    do {
      const seat = this.S.cur, mem = this.aiMem[seat] || (this.aiMem[seat] = {});
      const r = eng.aiStep(this.S.players[seat].ai, mem, this.rec); this.S = E.S; ev.push(...r.ev);
    } while (fast && this.aiToMove() && Date.now() - t0 < 300);
    if (!this.S.over) { if (this.aiToMove()) await this.scheduleAI(700); else await this.startTurnTimer(); }
    await this.afterChange(ev);
  }
  async alarm() {
    const d = this.d; if (!d || d.status !== 'playing' || !this.S || this.S.over) return;
    if (this.aiToMove()) { if (d.aiAt && Date.now() < d.aiAt - 50) { await this.ctx.storage.setAlarm(d.aiAt); return; } await this.aiMove(); return; }
    if (Date.now() < d.deadline - 1000) { await this.ctx.storage.setAlarm(d.deadline); return; }
    // the clock ran out: the turn ends; the third time in a row the player forfeits
    const eng = this.engine(), seat = this.S.cur; d.timeouts[seat] = (d.timeouts[seat] || 0) + 1;
    const { ev } = eng.recApply(this.rec, seat, { t: d.timeouts[seat] >= 3 ? 'resign' : 'timeout' });
    this.S = E.S;
    if (!this.S.over) await this.nextTurn();
    await this.afterChange(ev);
  }
  /* the finished game's log becomes its replay (/?replay=<id>): kept for good, listed publicly unless the room was private.
     Returns the replay's id, or null (a game started before games were recorded, or the database failed). */
  async saveReplay() {
    const d = this.d; if (d.replay !== undefined) return d.replay;
    d.replay = null; E.S = this.S; E.MAP = mapFor(this.S);
    const log = E.recFinal(this.rec); if (!log) return null;
    const id = [...crypto.getRandomValues(new Uint8Array(8))].map(b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
    const text = JSON.stringify(log); if (text.length > REPLAY_MAX_BYTES) return null;
    try {
      await this.env.DB.prepare(`INSERT INTO replays(id,created,title,players,actions,body,game,uids,listed) VALUES(?,?,?,?,?,?,1,?,?)`)
        .bind(id, Date.now(), log.title.slice(0, 120), log.players.map(x => x.name).join(', '), log.actions.length, text, ',' + this.S.owners.join(',') + ',', d.opts.pub === false ? 0 : 1).run();
      await this.env.DB.prepare(`UPDATE replays SET places=? WHERE id=?`).bind(JSON.stringify(this.S.places || []), id).run();
      d.replay = id;
      await pruneReplays(this.env.DB, this.S.owners);
    } catch (e) { }
    return d.replay;
  }
  async finish() {
    const d = this.d; this.settleClock(); d.status = 'over'; d.deadline = null;
    await this.ctx.storage.deleteAlarm();
    const replay = await this.saveReplay();
    if (!d.rated && d.opts.rated === false) { // unrated room: the result is kept, ratings don't move
      d.rated = true; d.results = { places: this.S.places, unrated: true, replay };
      try { await this.env.DB.prepare(`INSERT OR IGNORE INTO matches(id,room,finished,data) VALUES(?,?,?,?)`).bind(d.code + '-' + d.created, d.code, Date.now(), JSON.stringify({ players: this.S.owners, names: this.S.players.map(p => p.name), ai: this.S.players.map(p => p.ai || null), places: this.S.places, rated: false, rounds: this.S.round, replay })).run(); } catch (e) { }
    }
    if (!d.rated) {
      d.rated = true;
      const uids = this.S.owners;
      try {
        const rows = (await this.env.DB.prepare(`SELECT id,rating,games FROM users WHERE id IN (${uids.map(() => '?').join(',')})`).bind(...uids).all()).results;
        const by = Object.fromEntries(rows.map(r => [r.id, r]));
        const ratings = uids.map(u => (by[u] ? by[u].rating : 1200)), games = uids.map(u => (by[u] ? by[u].games : 0));
        const deltas = E.eloDeltas(ratings, this.S.places, games);
        const stmts = uids.map((u, i) => this.env.DB.prepare(`UPDATE users SET rating=rating+?, games=games+1, wins=wins+? WHERE id=?`).bind(deltas[i], this.S.places[i] === 1 ? 1 : 0, u));
        stmts.push(this.env.DB.prepare(`INSERT OR IGNORE INTO matches(id,room,finished,data) VALUES(?,?,?,?)`).bind(d.code + '-' + d.created, d.code, Date.now(), JSON.stringify({ players: uids, names: this.S.players.map(p => p.name), ai: this.S.players.map(p => p.ai || null), rated: true, places: this.S.places, before: ratings, deltas, rounds: this.S.round, replay })));
        await this.env.DB.batch(stmts);
        d.results = { places: this.S.places, before: ratings, deltas, replay };
      } catch (e) { d.results = { places: this.S.places, error: String(e && e.message || e), replay }; }
    }
    this.tellLobby();
  }
  async webSocketClose(ws, code) {
    try { ws.close(code); } catch (e) { }
    const d = this.d; if (!d || d.status === 'closed') return;
    const { uid } = ws.deserializeAttachment() || {};
    // someone who closes the page before a quick match starts gives up their seat, so matches never start with absent players
    if (d.opts.auto && d.status === 'lobby' && uid && !this.ctx.getWebSockets(uid).some(w => w !== ws && w.readyState === 1)) {
      d.seats = d.seats.filter(s => s.uid !== uid); if (d.host === uid && d.seats.length) d.host = d.seats[0].uid;
      if (!d.seats.length) d.status = 'closed';
      await this.persist(); this.tellLobby();
    }
    this.sendAll();
  }
}
