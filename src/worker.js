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

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const bad = (msg, status = 400) => json({ error: msg }, status);
const CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({ length: 5 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join('');
const TURN_CHOICES = [60, 90, 120, 180, 300];

/* ---------------- database ---------------- */
let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) schemaReady = env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, google_sub TEXT UNIQUE, name TEXT NOT NULL UNIQUE COLLATE NOCASE, rating REAL NOT NULL DEFAULT 1200, games INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS users_rating ON users(rating DESC)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY, room TEXT, finished INTEGER, data TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT)`),
  ]).catch(e => { schemaReady = null; throw e; });
  return schemaReady;
}
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

/* ---------------- worker entry ---------------- */
export default {
  async fetch(req, env) {
    const url = new URL(req.url); const p = url.pathname;
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      await ensureSchema(env);
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
      if (p === '/api/leaderboard') {
        const r = await env.DB.prepare(`SELECT id,name,rating,games,wins FROM users WHERE games>0 ORDER BY rating DESC LIMIT 100`).all();
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
        const opts = { max: Math.min(4, Math.max(2, +b.max || 4)), course: b.course === 'random' || E.courseById(b.course) ? b.course : E.COURSES[0].id, turn: TURN_CHOICES.includes(+b.turn) || (env.DEV_AUTH === '1' && +b.turn >= 5) ? +b.turn : 90 };
        for (let i = 0; i < 8; i++) {
          const code = genCode();
          const room = env.ROOMS.get(env.ROOMS.idFromName(code));
          const r = await (await room.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code, uid: user.id, opts }) })).json();
          if (r.ok) return json({ code });
        }
        return bad('Could not create a room, try again.', 500);
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
  list() { return Object.values(this.rooms).filter(r => r.status === 'lobby' || r.status === 'playing').map(r => ({ code: r.code, host: r.host, names: r.names, count: r.names.length, max: r.max, status: r.status, course: r.course, turn: r.turn })); }
  broadcast() { const msg = JSON.stringify({ t: 'rooms', rooms: this.list() }); for (const ws of this.ctx.getWebSockets()) { try { ws.send(msg); } catch (e) { } } }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') { const pair = new WebSocketPair(); this.ctx.acceptWebSocket(pair[1]); pair[1].send(JSON.stringify({ t: 'rooms', rooms: this.list() })); return new Response(null, { status: 101, webSocket: pair[0] }); }
    if (url.pathname === '/update') {
      const r = await req.json();
      if (r.status === 'closed' || r.status === 'over') delete this.rooms[r.code]; else this.rooms[r.code] = { ...r, updated: Date.now() };
      this.prune(); await this.ctx.storage.put('rooms', this.rooms); this.broadcast(); return json({ ok: true });
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
const PCOLORS = ['#e5484d', '#efe9dc', '#9d7df7', '#ff9636', '#35d0ba', '#f07ab8'];

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
  summary() { const d = this.d; return { code: d.code, host: (d.seats.find(s => s.uid === d.host) || d.seats[0] || {}).name || '', names: d.seats.map(s => s.name), uids: d.seats.map(s => s.uid), max: d.opts.max, status: d.status, course: d.opts.course, turn: d.opts.turn }; }
  async tellLobby() { try { const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName('main')); await lobby.fetch('https://lobby/update', { method: 'POST', body: JSON.stringify(this.summary()) }); } catch (e) { } }
  online(uid) { return this.ctx.getWebSockets(uid).length > 0; }
  roomInfo() { const d = this.d; return { code: d.code, host: d.host, status: d.status, opts: d.opts, seats: d.seats.map(s => ({ uid: s.uid, name: s.name, color: s.color, online: this.online(s.uid) })), results: d.results || null }; }
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
        if (uid === d.host) { d.status = 'closed'; await this.persist('d'); this.tellLobby(); this.sendAll(); for (const w of this.ctx.getWebSockets()) try { w.close(1000, 'Room closed'); } catch (e) { } return; }
        d.seats = d.seats.filter(s => s.uid !== uid); await this.persist('d'); this.tellLobby(); this.sendAll(); try { ws.close(1000, 'Left'); } catch (e) { }
      }
      else if (m.t === 'join' && !seat) { if (d.seats.length >= d.opts.max) return err('This room is full.'); const used = d.seats.map(s => s.color); const { name } = ws.deserializeAttachment(); d.seats.push({ uid, name, color: PCOLORS.find(c => !used.includes(c)) }); await this.persist('d'); this.tellLobby(); this.sendAll(); }
      else if (m.t === 'start') {
        if (uid !== d.host) return err('Only the host can start.');
        if (d.seats.length < 2) return err('You need at least 2 players.');
        E.newGame({ course: E.courseById(d.opts.course) || E.COURSES[Math.floor(Math.random() * E.COURSES.length)], seed: (Math.random() * 1e9) | 0, players: d.seats.map(s => ({ name: s.name, color: s.color })), fullRace: true });
        this.S = E.S; this.S.owners = d.seats.map(s => s.uid); this.S.room = d.code; mapCache.set(this.S.course.id + ':' + this.S.seed, E.MAP);
        d.status = 'playing'; d.timeouts = {}; this.undo = [];
        await this.startTurnTimer(); await this.persist(); this.tellLobby(); this.sendAll([{ e: 'start' }]);
      }
      return;
    }
    if (d.status !== 'playing' || !this.S) return;
    const seat = this.S.owners.indexOf(uid);
    if (m.t === 'resign') { if (seat < 0) return; const eng = this.engine(); const prevCur = this.S.cur; const r = eng.resign(seat); if (!r.ok) return; if (this.S.cur !== prevCur) { this.undo = []; await this.startTurnTimer(); } await this.afterChange(r.ev); return; }
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
      if (this.S.cur !== prevCur && !this.S.over) await this.startTurnTimer();
      await this.afterChange(r.ev); return;
    }
  }
  async afterChange(ev) {
    if (this.S.log.length > 120) this.S.log = this.S.log.slice(-120);
    if (this.S.over && this.d.status === 'playing') await this.finish();
    await this.persist(); this.sendAll(ev);
  }
  async startTurnTimer() {
    this.d.deadline = Date.now() + this.d.opts.turn * 1000;
    await this.ctx.storage.setAlarm(this.d.deadline);
  }
  async alarm() {
    const d = this.d; if (!d || d.status !== 'playing' || !this.S || this.S.over) return;
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
    if (!this.S.over) await this.startTurnTimer();
    await this.afterChange(ev);
  }
  async finish() {
    const d = this.d; d.status = 'over'; d.deadline = null;
    await this.ctx.storage.deleteAlarm();
    if (!d.rated) {
      d.rated = true;
      const uids = this.S.owners;
      try {
        const rows = (await this.env.DB.prepare(`SELECT id,rating,games FROM users WHERE id IN (${uids.map(() => '?').join(',')})`).bind(...uids).all()).results;
        const by = Object.fromEntries(rows.map(r => [r.id, r]));
        const ratings = uids.map(u => (by[u] ? by[u].rating : 1200)), games = uids.map(u => (by[u] ? by[u].games : 0));
        const deltas = E.eloDeltas(ratings, this.S.places, games);
        const stmts = uids.map((u, i) => this.env.DB.prepare(`UPDATE users SET rating=rating+?, games=games+1, wins=wins+? WHERE id=?`).bind(deltas[i], this.S.places[i] === 1 ? 1 : 0, u));
        stmts.push(this.env.DB.prepare(`INSERT OR IGNORE INTO matches(id,room,finished,data) VALUES(?,?,?,?)`).bind(d.code + '-' + d.created, d.code, Date.now(), JSON.stringify({ players: uids, names: this.S.players.map(p => p.name), places: this.S.places, before: ratings, deltas, rounds: this.S.round })));
        await this.env.DB.batch(stmts);
        d.results = { places: this.S.places, before: ratings, deltas };
      } catch (e) { d.results = { places: this.S.places, error: String(e && e.message || e) }; }
    }
    this.tellLobby();
  }
  async webSocketClose(ws, code) {
    try { ws.close(code); } catch (e) { }
    if (this.d && this.d.status !== 'closed') this.sendAll();
  }
}
