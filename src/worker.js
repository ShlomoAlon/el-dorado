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
  for (const A of E.AIS) { // one rated player per named AI; if a person already has the name, the AI gets "(AI)" after it
    const id = aiUid(A.id);
    if (await env.DB.prepare(`SELECT id FROM users WHERE id=?`).bind(id).first()) continue;
    for (const name of [A.name, A.name + ' (AI)', A.name + ' (AI) ' + id.slice(-4)]) {
      const r = await env.DB.prepare(`INSERT OR IGNORE INTO users(id,google_sub,name,created,bot) VALUES(?,NULL,?,?,?)`).bind(id, name, Date.now(), A.id).run();
      if (r.meta && r.meta.changes) break;
    }
  }
  // One-time calibration: the AIs start from the ratings measured in AI-vs-AI games (AIS[].rating, tools/ai/calibrate_ais.mjs)
  // instead of the default 1200. It shifts (rating += calibrated - 1200), so an AI that already played rated games keeps what
  // it won or lost. One transaction: the updates apply only while the marker row is missing, then the marker is written,
  // so it runs exactly once per database, whichever isolate gets here first, and never touches ratings again.
  const CAL = 'ai_calibration_v1';
  await env.DB.batch([
    ...E.AIS.filter(A => Number.isFinite(A.rating)).map(A => env.DB.prepare(`UPDATE users SET rating = rating + ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM settings WHERE k = ?)`).bind(A.rating - 1200, aiUid(A.id), CAL)),
    env.DB.prepare(`INSERT OR IGNORE INTO settings(k,v) VALUES(?,?)`).bind(CAL, JSON.stringify({ at: Date.now(), ratings: Object.fromEntries(E.AIS.map(A => [A.id, A.rating])) })),
  ]);
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
      REPLAY_KEEP = 1000;
const MATCH_SIZE = 3; // quick-match rooms start by themselves once this many have joined,
                      // or earlier (with 2+) when everyone in the room asks to start now

/* ---------------- worker entry ---------------- */
export default {
  async fetch(req, env) {
    const url = new URL(req.url); const p = url.pathname;
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(req);
    let m0;
    try {
      await ensureSchema(env);
      // AI training progress (/train.html polls it): the training machine posts its run's status with a secret token
      // whose SHA-256 is TRAIN_TOKEN_HASH (wrangler.jsonc); anyone may read it
      if (p === '/api/train' && req.method === 'POST') {
        const tok = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
        const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tok)))].map(b => b.toString(16).padStart(2, '0')).join('');
        if (!env.TRAIN_TOKEN_HASH || h !== env.TRAIN_TOKEN_HASH) return bad('Not allowed', 403);
        const text = await req.text(); if (text.length > 300000) return bad('Too large', 413);
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
        const { credential } = await req.json();
        let g; try { g = await verifyGoogleToken(credential, env.GOOGLE_CLIENT_ID); } catch (e) { return bad('Google sign-in failed: ' + e.message, 401); }
        const { user, isNew } = await upsertUser(env, 'g:' + g.sub, g.given_name || g.name || 'Explorer');
        return json({ token: await makeToken(env, user.id), user, isNew });
      }
      if (p === '/api/auth/dev' && req.method === 'POST') { // local testing only (DEV_AUTH=1 in .dev.vars)
        if (env.DEV_AUTH !== '1') return bad('Not found', 404);
        const { name } = await req.json();
        const { user, isNew } = await upsertUser(env, 'dev:' + cleanName(name).toLowerCase(), name);
        return json({ token: await makeToken(env, user.id), user, isNew });
      }
      // game logs anyone can upload and watch step by step (/?replay=<id>); the page rebuilds the game from the log
      if (p === '/api/replays' && req.method === 'POST') {
        const text = await req.text();
        if (text.length > REPLAY_MAX_BYTES) return bad('That game log is too large.', 413);
        let log; try { log = JSON.parse(text); } catch (e) { return bad('That file is not valid JSON.', 400); }
        const err = E.replayCheck(log); if (err) return bad(err, 400);
        const id = [...crypto.getRandomValues(new Uint8Array(8))].map(b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
        const title = String(log.title || '').slice(0, 120), players = log.players.map(x => String(x.name || '').slice(0, 24)).join(', ');
        await env.DB.prepare(`INSERT INTO replays(id,created,title,players,actions,body) VALUES(?,?,?,?,?,?)`).bind(id, Date.now(), title, players, log.actions.length, text).run();
        await env.DB.prepare(`DELETE FROM replays WHERE id NOT IN (SELECT id FROM replays ORDER BY created DESC LIMIT ${REPLAY_KEEP})`).run();
        return json({ id });
      }
      if (p === '/api/replays' && req.method === 'GET') {
        const r = await env.DB.prepare(`SELECT id,created,title,players,actions FROM replays ORDER BY created DESC LIMIT 50`).all();
        return json({ replays: r.results });
      }
      if ((m0 = p.match(/^\/api\/replays\/([a-z0-9]{6,12})$/)) && req.method === 'GET') {
        const r = await env.DB.prepare(`SELECT body FROM replays WHERE id=?`).bind(m0[1]).first();
        return r ? new Response(r.body, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' } }) : bad('No replay with that id.', 404);
      }
      if (p === '/api/leaderboard') {
        const r = await env.DB.prepare(`SELECT id,name,rating,games,wins,bot FROM users WHERE games>0 OR bot IS NOT NULL ORDER BY rating DESC LIMIT 100`).all();
        return json({ players: r.results });
      }
      const user = await authUser(req, env);
      if (!user) return bad('Please sign in.', 401);
      const lobby = env.LOBBY.get(env.LOBBY.idFromName('main'));
      if (p === '/api/me' && req.method === 'GET') {
        const active = await (await lobby.fetch('https://lobby/find?uid=' + encodeURIComponent(user.id))).json();
        return json({ user, active: active.code || null });
      }
      if (p === '/api/me' && req.method === 'PATCH') {
        const { name } = await req.json();
        const n = await uniqueName(env, name, user.id);
        await env.DB.prepare(`UPDATE users SET name=? WHERE id=?`).bind(n, user.id).run();
        return json({ user: { ...user, name: n } });
      }
      if (p === '/api/rooms' && req.method === 'POST') {
        const b = await req.json().catch(() => ({}));
        const opts = { max: Math.min(4, Math.max(2, +b.max || 3)), course: b.course === 'random' || E.courseById(b.course) ? b.course : E.COURSES[0].id, turn: TURN_CHOICES.includes(+b.turn) || (env.DEV_AUTH === '1' && +b.turn >= 5) ? +b.turn : 90, pub: b.pub !== false, rated: b.rated !== false, auto: false };
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
        const h = new Headers(req.headers); h.set('x-uid', user.id); h.set('x-name', user.name);
        return room.fetch(new Request('https://room/ws', { headers: h }));
      }
      if (p === '/api/lobby/ws') {
        if (req.headers.get('upgrade') !== 'websocket') return bad('Expected a WebSocket', 426);
        return lobby.fetch(new Request('https://lobby/ws', { headers: req.headers }));
      }
      return bad('Not found', 404);
    } catch (e) {
      return bad('Server error: ' + (e && e.message || e), 500);
    }
  }
};

/* ---------------- Lobby: live list of rooms ---------------- */
export class Lobby extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.rooms = null; ctx.blockConcurrencyWhile(async () => { this.rooms = (await ctx.storage.get('rooms')) || {}; }); }
  prune() { const now = Date.now(); for (const c in this.rooms) { const r = this.rooms[c]; if (now - r.updated > (r.status === 'playing' ? 12 : 2) * 3600e3) delete this.rooms[c]; } }
  list() { return Object.values(this.rooms).filter(r => r.pub !== false && (r.status === 'lobby' || r.status === 'playing')).map(r => ({ code: r.code, host: r.host, names: r.names, count: r.names.length, max: r.max, status: r.status, course: r.course, turn: r.turn, rated: r.rated !== false, ai: (r.uids || []).filter(u => u.startsWith('ai-')).length, auto: !!r.auto })); }
  broadcast() { const msg = JSON.stringify({ t: 'rooms', rooms: this.list() }); for (const ws of this.ctx.getWebSockets()) { try { ws.send(msg); } catch (e) { } } }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') { const pair = new WebSocketPair(); this.ctx.acceptWebSocket(pair[1]); pair[1].send(JSON.stringify({ t: 'rooms', rooms: this.list() })); return new Response(null, { status: 101, webSocket: pair[0] }); }
    if (url.pathname === '/update') {
      const r = await req.json();
      if (r.status === 'closed' || r.status === 'over') delete this.rooms[r.code]; else this.rooms[r.code] = { ...r, updated: Date.now() };
      this.prune(); await this.ctx.storage.put('rooms', this.rooms); this.broadcast(); return json({ ok: true });
    }
    if (url.pathname === '/match') {
      const { uid, dev } = await req.json(); const now = Date.now();
      const mine = Object.values(this.rooms).find(x => (x.uids || []).includes(uid) && (x.status === 'lobby' || x.status === 'playing'));
      if (mine) return json({ code: mine.code });
      const open = Object.values(this.rooms).filter(x => x.auto && x.status === 'lobby' && x.names.length < x.max && now - x.updated < 15 * 60e3).sort((a, b) => b.names.length - a.names.length);
      if (open.length) return json({ code: open[0].code });
      const opts = { max: MATCH_SIZE, course: 'random', turn: dev ? 20 : 90, pub: true, rated: true, auto: true };
      const code = await createRoom(this.env, uid, opts); if (!code) return json({ code: null });
      // listed right away so a second quick-matcher lands in the same room
      this.rooms[code] = { code, host: '', names: [], uids: [], max: MATCH_SIZE, status: 'lobby', course: 'random', turn: opts.turn, pub: true, auto: true, updated: now };
      await this.ctx.storage.put('rooms', this.rooms); this.broadcast(); return json({ code });
    }
    if (url.pathname === '/find') { const uid = url.searchParams.get('uid'); const r = Object.values(this.rooms).find(x => (x.uids || []).includes(uid)); return json({ code: r ? r.code : null }); }
    return bad('Not found', 404);
  }
  async webSocketMessage(ws, msg) { if (msg === 'ping') ws.send('pong'); }
  async webSocketClose(ws, code) { try { ws.close(code); } catch (e) { } }
}

/* ---------------- Room: one live game ---------------- */
const mapCache = new Map();
function mapFor(S) { const k = S.course.id + ':' + S.seed; let m = mapCache.get(k); if (!m) { m = E.mapFor(S); mapCache.set(k, m); if (mapCache.size > 200) mapCache.delete(mapCache.keys().next().value); } return m; }
const PCOLORS = ['#e5484d', '#efe9dc', '#9d7df7', '#ff9636']; // matches COLORS: one explorer figure per colour

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.d = null; this.S = null; this.undo = [];
    ctx.blockConcurrencyWhile(async () => { this.d = (await ctx.storage.get('d')) || null; this.S = (await ctx.storage.get('S')) || null; this.undo = (await ctx.storage.get('undo')) || [];
      if (this.S && !this.S.course) { this.S = null; this.undo = []; if (this.d) this.d.status = 'closed'; } }); // pre-course (v3) games can't be rebuilt
  }
  async persist(parts = 'dSu') {
    const w = {}; if (parts.includes('d')) w.d = this.d; if (parts.includes('S')) w.S = this.S; if (parts.includes('u')) w.undo = this.undo;
    await this.ctx.storage.put(w);
  }
  engine() { E.S = this.S; E.MAP = mapFor(this.S); return E; }
  summary() { const d = this.d; return { code: d.code, host: (d.seats.find(s => s.uid === d.host) || d.seats[0] || {}).name || '', names: d.seats.map(s => s.name), uids: d.seats.map(s => s.uid), max: d.opts.max, status: d.status, course: d.opts.course, turn: d.opts.turn, pub: d.opts.pub !== false, rated: d.opts.rated !== false, auto: !!d.opts.auto }; }
  async tellLobby() { try { const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName('main')); await lobby.fetch('https://lobby/update', { method: 'POST', body: JSON.stringify(this.summary()) }); } catch (e) { } }
  online(uid) { return this.ctx.getWebSockets(uid).length > 0; }
  roomInfo() { const d = this.d; return { code: d.code, host: d.host, status: d.status, opts: d.opts, seats: d.seats.map(s => ({ uid: s.uid, name: s.name, color: s.color, now: !!s.now, ai: s.ai || null, online: !!s.ai || this.online(s.uid) })), results: d.results || null }; }
  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (e) { } }
  stateFor(uid, ev) {
    const seat = this.S.owners.indexOf(uid);
    return { t: 'state', S: E.redact(this.S, seat), ev: ev || [], seat, undo: seat >= 0 && seat === this.S.cur && this.undo.length > 0, deadline: this.d.deadline || null, now: Date.now(), room: this.roomInfo() };
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
      await this.persist('d'); return json({ ok: true });
    }
    if (url.pathname === '/ws') {
      if (!this.d || this.d.status === 'closed') return new Response('No such room', { status: 404 });
      const uid = req.headers.get('x-uid'), name = req.headers.get('x-name');
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], [uid]); pair[1].serializeAttachment({ uid, name });
      if (this.d.status === 'lobby' && !this.d.seats.find(s => s.uid === uid) && this.d.seats.length < this.d.opts.max) {
        const used = this.d.seats.map(s => s.color);
        this.d.seats.push({ uid, name, color: PCOLORS.find(c => !used.includes(c)) });
        if (!this.d.seats.find(s => s.uid === this.d.host)) this.d.host = uid;
        if (await this.seatsChanged()) return new Response(null, { status: 101, webSocket: pair[0] });
        await this.persist('d'); this.tellLobby();
      }
      this.sendAll();
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return bad('Not found', 404);
  }
  async webSocketMessage(ws, raw) {
    if (raw === 'ping') { ws.send('pong'); return; }
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const { uid } = ws.deserializeAttachment() || {};
    const d = this.d; if (!d || !uid) return;
    const err = msg => this.send(ws, { t: 'error', msg });
    if (d.status === 'lobby') {
      const seat = d.seats.find(s => s.uid === uid);
      if (m.t === 'color' && seat && PCOLORS.includes(m.color) && !d.seats.some(s => s !== seat && s.color === m.color)) { seat.color = m.color; await this.persist('d'); this.sendAll(); }
      else if (m.t === 'leave') {
        if (d.opts.auto) { // match rooms never close on the host; the next player hosts
          d.seats = d.seats.filter(s => s.uid !== uid); if (d.host === uid && d.seats.length) d.host = d.seats[0].uid;
          if (!d.seats.length) d.status = 'closed';
          await this.seatsChanged(); await this.persist('d'); this.tellLobby(); this.sendAll(); try { ws.close(1000, 'Left'); } catch (e) { } return;
        }
        if (uid === d.host) { d.status = 'closed'; await this.persist('d'); this.tellLobby(); this.sendAll(); for (const w of this.ctx.getWebSockets()) try { w.close(1000, 'Room closed'); } catch (e) { } return; }
        d.seats = d.seats.filter(s => s.uid !== uid); await this.persist('d'); this.tellLobby(); this.sendAll(); try { ws.close(1000, 'Left'); } catch (e) { }
      }
      else if (m.t === 'join' && !seat) { if (d.seats.length >= d.opts.max) return err('This room is full.'); const used = d.seats.map(s => s.color); const { name } = ws.deserializeAttachment(); d.seats.push({ uid, name, color: PCOLORS.find(c => !used.includes(c)) }); if (await this.seatsChanged()) return; await this.persist('d'); this.tellLobby(); this.sendAll(); }
      else if (m.t === 'addAI') { // host seats a named AI (each at most once per room); it plays server-side
        if (d.opts.auto || uid !== d.host) return err('Only the host can add AI players.');
        const A = E.aiById(m.ai); if (!A) return err('Unknown AI.');
        if (!E.aiCourseOK(d.opts.course) || d.opts.max < 3) return err('AI players only play First Expedition with 3 or 4 players for now.');
        if (d.seats.length >= d.opts.max) return err('This room is full.');
        if (d.seats.some(s => s.ai === A.id)) return;
        const used = d.seats.map(s => s.color); const row = await this.env.DB.prepare(`SELECT name FROM users WHERE id=?`).bind(aiUid(A.id)).first().catch(() => null);
        d.seats.push({ uid: aiUid(A.id), name: row ? row.name : A.name, color: PCOLORS.find(c => !used.includes(c)), ai: A.id });
        await this.persist('d'); this.tellLobby(); this.sendAll();
      }
      else if (m.t === 'removeAI') {
        if (uid !== d.host) return err('Only the host can remove AI players.');
        d.seats = d.seats.filter(s => !(s.ai && s.uid === m.uid)); await this.persist('d'); this.tellLobby(); this.sendAll();
      }
      else if (m.t === 'rated' && uid === d.host && !d.opts.auto) { d.opts.rated = !!m.v; await this.persist('d'); this.tellLobby(); this.sendAll(); }
      else if (m.t === 'now' && seat && d.opts.auto) { seat.now = !seat.now; if (await this.seatsChanged()) return; await this.persist('d'); this.sendAll(); }
      else if (m.t === 'start') {
        if (d.opts.auto) return;
        if (uid !== d.host) return err('Only the host can start.');
        if (d.seats.length < 2) return err('You need at least 2 players.');
        if (d.seats.some(s => s.ai) && !E.aiAllowed(d.opts.course, d.seats.length)) return err('AI players need 3 or 4 players (and First Expedition) for now.');
        await this.startGame();
      }
      return;
    }
    if (d.status !== 'playing' || !this.S) return;
    const seat = this.S.owners.indexOf(uid);
    if (m.t === 'resign') { if (seat < 0) return; const eng = this.engine(); const prevCur = this.S.cur; const r = eng.resign(seat); if (!r.ok) return; if (this.S.cur !== prevCur) { this.undo = []; await this.nextTurn(); } await this.afterChange(r.ev); return; }
    if (m.t === 'undo') {
      if (seat !== this.S.cur || !this.undo.length) return err('Nothing to undo.');
      this.S = JSON.parse(this.undo.pop()); await this.persist('Su'); this.sendAll([{ e: 'undo' }]); return;
    }
    if (m.t === 'act') {
      if (seat < 0) return err('You are watching this game.');
      const eng = this.engine(); const before = JSON.stringify(this.S); const prevCur = this.S.cur;
      const r = eng.applyAction(seat, m.a);
      if (!r.ok) { this.S = JSON.parse(before); return err(r.err); }
      this.S = E.S; d.timeouts[seat] = 0;
      if (r.reveal || this.S.cur !== prevCur) this.undo = []; else { this.undo.push(before); if (this.undo.length > 6) this.undo.shift(); }
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
    E.newGame({ course: E.courseById(d.opts.course) || E.COURSES[Math.floor(Math.random() * E.COURSES.length)], seed: (Math.random() * 1e9) | 0, players: d.seats.map(s => ({ name: s.name, color: s.color, ai: s.ai || undefined })), fullRace: true });
    this.S = E.S; this.S.owners = d.seats.map(s => s.uid); this.S.room = d.code; mapCache.set(this.S.course.id + ':' + this.S.seed, E.MAP);
    d.status = 'playing'; d.timeouts = {}; this.undo = [];
    await this.nextTurn(); await this.persist(); this.tellLobby(); this.sendAll([{ e: 'start' }]);
  }
  async afterChange(ev) {
    if (this.S.log.length > 120) this.S.log = this.S.log.slice(-120);
    if (this.S.over && this.d.status === 'playing') await this.finish();
    await this.persist(); this.sendAll(ev);
  }
  async startTurnTimer() {
    this.d.deadline = Date.now() + this.d.opts.turn * 1000; this.d.aiAt = null;
    await this.ctx.storage.setAlarm(this.d.deadline);
  }
  /* the turn passed to someone new: a person gets the turn timer, an AI gets its next move scheduled (same alarm) */
  async nextTurn() { if (this.aiToMove()) await this.scheduleAI(900); else await this.startTurnTimer(); }
  aiToMove() { return !!(this.S && !this.S.over && this.S.players[this.S.cur].ai); }
  // someone is following the game: a person still racing with the page open. Otherwise the AIs play on without pauses.
  watched() { return this.S.players.some((p, i) => !p.ai && !p.resigned && !p.pieces.every(k => k === 'done') && this.online(this.S.owners[i])); }
  async scheduleAI(ms) { const d = this.d; d.deadline = null; d.aiAt = Date.now() + (this.watched() ? ms : 0); await this.ctx.storage.setAlarm(d.aiAt); }
  /* AI seats play server-side, one action per alarm while people watch (so the table can follow),
     or up to ~0.3 s of actions per alarm when nobody is racing with the page open */
  async aiMove() {
    const eng = this.engine(); useNet(); const ev = []; const t0 = Date.now(); const fast = !this.watched();
    this.aiMem = this.aiMem || {};
    do {
      const seat = this.S.cur, mem = this.aiMem[seat] || (this.aiMem[seat] = {});
      const r = eng.aiStep(this.S.players[seat].ai, mem); this.S = E.S; ev.push(...r.ev);
    } while (fast && this.aiToMove() && Date.now() - t0 < 300);
    this.undo = [];
    if (!this.S.over) { if (this.aiToMove()) await this.scheduleAI(700); else await this.startTurnTimer(); }
    await this.afterChange(ev);
  }
  async alarm() {
    const d = this.d; if (!d || d.status !== 'playing' || !this.S || this.S.over) return;
    if (this.aiToMove()) { if (d.aiAt && Date.now() < d.aiAt - 50) { await this.ctx.storage.setAlarm(d.aiAt); return; } await this.aiMove(); return; }
    if (Date.now() < d.deadline - 1000) { await this.ctx.storage.setAlarm(d.deadline); return; }
    const eng = this.engine(); const seat = this.S.cur; const ev = [{ e: 'timeout', pl: seat }];
    d.timeouts[seat] = (d.timeouts[seat] || 0) + 1;
    this.S.log.push({ p: seat, t: 'ran out of time.' });
    if (d.timeouts[seat] >= 3) { const r = eng.resign(seat); ev.push(...r.ev); this.S.log.push({ p: seat, t: 'missed 3 turns in a row and forfeits.' }); }
    else {
      if (this.S.turn.pending) eng.applyAction(seat, { t: 'trash', cards: [] });
      this.S.turn.active = null;
      const r = eng.applyAction(seat, { t: 'end', keep: [] }); ev.push(...r.ev);
    }
    this.S = E.S; this.undo = [];
    if (!this.S.over) await this.nextTurn();
    await this.afterChange(ev);
  }
  async finish() {
    const d = this.d; d.status = 'over'; d.deadline = null;
    await this.ctx.storage.deleteAlarm();
    if (!d.rated && d.opts.rated === false) { // unrated room: the result is kept, ratings don't move
      d.rated = true; d.results = { places: this.S.places, unrated: true };
      try { await this.env.DB.prepare(`INSERT OR IGNORE INTO matches(id,room,finished,data) VALUES(?,?,?,?)`).bind(d.code + '-' + d.created, d.code, Date.now(), JSON.stringify({ players: this.S.owners, names: this.S.players.map(p => p.name), ai: this.S.players.map(p => p.ai || null), places: this.S.places, rated: false, rounds: this.S.round })).run(); } catch (e) { }
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
        stmts.push(this.env.DB.prepare(`INSERT OR IGNORE INTO matches(id,room,finished,data) VALUES(?,?,?,?)`).bind(d.code + '-' + d.created, d.code, Date.now(), JSON.stringify({ players: uids, names: this.S.players.map(p => p.name), ai: this.S.players.map(p => p.ai || null), rated: true, places: this.S.places, before: ratings, deltas, rounds: this.S.round })));
        await this.env.DB.batch(stmts);
        d.results = { places: this.S.places, before: ratings, deltas };
      } catch (e) { d.results = { places: this.S.places, error: String(e && e.message || e) }; }
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
      await this.persist('d'); this.tellLobby();
    }
    this.sendAll();
  }
}
