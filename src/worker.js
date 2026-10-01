/* El Dorado Expedition — Cloudflare Worker.
   - Serves the game page (public/) as static assets.
   - /api/*: Google sign-in, profile, leaderboard, rooms.
   - Room Durable Object: one per game; holds the real game state, checks every
     move with the shared rules engine, sends each player only what they may see,
     runs the turn timer, and records Elo ratings when the game ends.
   - Lobby Durable Object: the live list of open rooms.
   - Bugs: what the page's and the server's boundaries caught, stored as reports (docs/ASSERTIONS.md).
   Tables are created automatically on first use; no migrations to run. */
import { DurableObject } from 'cloudflare:workers';
import * as E from './engine.gen.js';
import NET_BIN from './ai/first.bin'; // the AI's neural network as half floats (tools/ai/pack.mjs); wrangler imports .bin as an ArrayBuffer

// JSON responses (jsonText: a body that is already JSON)
const jsonText = (text, status = 200, cache = 'no-store') => new Response(text, { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });
const json = (data, status = 200) => jsonText(JSON.stringify(data), status);
const bad = (err, status = 400) => json({ err }, status);
const CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({ length: 5 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join('');
const TURN_CHOICES = [60, 90, 120, 180, 300];

/* ---------------- database ---------------- */
/* Setting the database up takes ~25 queries in a row (seconds from a far colo), so it runs only when this stamp changes:
   a new instance of the worker (they start often) then costs one query. Bump SCHEMA_V when createSchema changes; the
   named AIs and their calibrated ratings are part of the stamp. */
const SCHEMA_V = 2, SCHEMA = SCHEMA_V + ':' + E.AIS.map(A => A.id + '=' + A.rating).join(',');
/* who is on the ladder (the leaderboard, and the rank a profile shows): players with rated games, and the named AIs still
   playing (an AI no longer in the game, retired, leaves it). One definition for both: they once differed (the profile's
   rank counted retired AIs the leaderboard left out) */
E.assert(E.AIS.every(A => /^[a-z0-9_-]+$/.test(A.id)), 'AI ids are plain words (they are written into the ladder query)');
const LADDER = `(games>0 OR bot IS NOT NULL) AND (bot IS NULL OR bot IN (${E.AIS.map(A => `'${A.id}'`).join(',')}))`;
let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) schemaReady = checkSchema(env).catch(e => { schemaReady = null; throw e; });
  return schemaReady;
}
/* columns are only ever added; one that is already there is the failure expected */
async function addColumn(env, table, col) {
  try { await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${col}`).run(); }
  catch (e) { if (!/duplicate column/i.test(errText(e))) throw e; }
}
async function checkSchema(env) {
  const row = await env.DB.prepare(`SELECT v FROM settings WHERE k='schema'`).first().catch(e => { if (/no such table/i.test(errText(e))) return null; throw e; }); // (expected: no table yet, a new database)
  if (row && row.v === SCHEMA) return;
  await createSchema(env);
  await env.DB.prepare(`INSERT INTO settings(k,v) VALUES('schema',?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).bind(SCHEMA).run();
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
    // bug reports: source page | room | worker; who = the sender (uid, ip:…, room:…: the rate limit); context = JSON
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS bugs(id TEXT PRIMARY KEY, created INTEGER NOT NULL, source TEXT NOT NULL, who TEXT, msg TEXT, stack TEXT, build TEXT, context TEXT)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS bugs_created ON bugs(created DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS bugs_who ON bugs(who, created)`),
  ]);
  await addColumn(env, 'users', 'bot TEXT');
  // replays of online games (game=1) are kept for good; uids = ',uid1,uid2,' (who played); listed=0: a private room's game
  // places: finishing places in the order of uids (no longer written or read: the log's own result has them; columns stay)
  for (const c of ['game INTEGER NOT NULL DEFAULT 0', 'uids TEXT', 'listed INTEGER NOT NULL DEFAULT 1', 'places TEXT'])
    await addColumn(env, 'replays', c);
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
  // (none yet: the default 1200). Each shift and its key are
  // written in one transaction, conditional on the key still holding the old value: it applies exactly once, whichever
  // isolate gets here first.
  for (const A of E.AIS.filter(A => Number.isFinite(A.rating))) {
    const k = 'ai_rating:' + A.id, row = await env.DB.prepare(`SELECT v FROM settings WHERE k=?`).bind(k).first();
    const applied = row ? +row.v : 1200;
    if (row && applied === A.rating) continue;
    await env.DB.batch([
      env.DB.prepare(`UPDATE users SET rating = rating + ? WHERE id = ? AND COALESCE((SELECT v FROM settings WHERE k = ?), ?) = ?`).bind(A.rating - applied, aiUid(A.id), k, String(applied), String(applied)),
      env.DB.prepare(`INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v WHERE settings.v = ?`).bind(k, String(A.rating), String(applied)),
    ]);
  }
}
/* ---------------- bugs ----------------
   A report: the error, and the game as its record (replaying it offline rebuilds the exact state). Anyone may send one
   (people signed out hit bugs too), at most BUGS_PER_HOUR per sender; the newest BUGS_KEEP are kept. Reading them needs the
   BUGS_KEY secret (docs/ASSERTIONS.md). */
const BUG_MAX_BYTES = 256e3, BUGS_PER_HOUR = 20, BUGS_KEEP = 2000;
const newId = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const errText = e => String(e && e.message || e);
/* a socket that closed meanwhile can't be written to or closed again: the one failure expected here */
function wsSend(ws, msg) { try { ws.send(msg); } catch (e) { /* expected: the socket closed meanwhile */ } }
function wsClose(ws, code, reason) { try { ws.close(code, reason); } catch (e) { /* expected: the socket is already closed */ } }
/* store a report ({msg, stack, build, context}); the id, or null (over the limit, or the database failed). Never throws:
   a report must not become a second failure */
async function storeBug(env, source, who, b) {
  try {
    await ensureSchema(env);
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM bugs WHERE who=? AND created>?`).bind(who, Date.now() - 3600e3).first();
    if (n.n >= BUGS_PER_HOUR) return null;
    let context = JSON.stringify(b.context === undefined ? null : b.context);
    if (context.length > 1.5e6) context = JSON.stringify({ tooLarge: context.length }); // (a D1 row holds 2 MB)
    const id = newId();
    await env.DB.prepare(`INSERT INTO bugs(id,created,source,who,msg,stack,build,context) VALUES(?,?,?,?,?,?,?,?)`)
      .bind(id, Date.now(), source, who, String(b.msg || '').slice(0, 1000), String(b.stack || '').slice(0, 8000), String(b.build || '').slice(0, 80), context).run();
    await env.DB.prepare(`DELETE FROM bugs WHERE id NOT IN (SELECT id FROM bugs ORDER BY created DESC LIMIT ${BUGS_KEEP})`).run();
    return id;
  } catch (e) { console.error('bug report not stored:', e); return null; }
}
const ipOf = req => 'ip:' + (req.headers.get('cf-connecting-ip') || 'unknown');

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
async function verifyGoogleToken(cred, clientId) {
  const [h, p, s] = String(cred || '').split('.'); if (!s) throw new Error('bad token');
  const header = JSON.parse(new TextDecoder().decode(b64uDecode(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64uDecode(p)));
  if (payload.aud !== clientId) throw new Error('token not for this app');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw new Error('bad issuer');
  if (payload.exp * 1000 < Date.now()) throw new Error('token expired');
  const jwk = (await googleKeys()).find(k => k.kid === header.kid); if (!jwk) throw new Error('unknown key');
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

/* a room's options: what the player chose (checked), or a quick match's, which are fixed. Developer servers allow short clocks. */
function roomOpts(env, b) {
  const turn = TURN_CHOICES.includes(+b.turn) || (env.DEV_AUTH === '1' && +b.turn >= 5) ? +b.turn : 90;
  return { max: Math.min(4, Math.max(2, +b.max || 3)), course: b.course === 'random' || E.courseById(b.course) ? b.course : E.COURSES[0].id, turn, pub: b.pub !== false, rated: b.rated !== false, auto: false };
}
const matchOpts = env => ({ max: MATCH_SIZE, course: 'random', turn: env.DEV_AUTH === '1' ? 20 : 90, pub: true, rated: true, auto: true });
async function createRoom(env, uid, opts) {
  for (let i = 0; i < 8; i++) {
    const code = genCode();
    const room = env.ROOMS.get(env.ROOMS.idFromName(code));
    const r = await (await room.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code, uid, opts }) })).json();
    if (r.ok) return code;
  }
  return null;
}
/* a finished game in a list (Replays, a profile): what its row shows. From the game log itself, so uploads have it too:
   course id, the players' names, their places (null: it never finished), rounds played */
const GAME_COLS = `id,created,actions,json_extract(body,'$.course') AS course,json_extract(body,'$.players') AS pl,json_extract(body,'$.result') AS res`;
const gameRow = r => { const res = JSON.parse(r.res || '{}');
  return { id: r.id, created: r.created, actions: r.actions, course: r.course, names: JSON.parse(r.pl).map(p => p.name), places: res.places || null, rounds: res.rounds || null }; };
const REPLAY_MAX_BYTES = 1.9e6, // D1 rows hold at most 2 MB
      REPLAY_KEEP = 1000, // uploaded logs
      REPLAYS_PER_PLAYER = 10; // online games: each player's latest are kept
const AI_BATCH = 8; // AI actions per alarm when no person is watching (about the 0.3 s once meant: the network AIs take tens of ms an action)
const MATCH_SIZE = 3; // quick-match rooms start by themselves once this many have joined,
                      // or earlier (with 2+) when everyone in the room asks to start now

/* ---------------- worker entry ---------------- */
export default {
  async fetch(req, env) {
    const url = new URL(req.url); const p = url.pathname;
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(req);
    E.setAssertMode({ debug: env.DEV_AUTH === '1' });
    let m0;
    // the worker's boundary: whatever a route throws is a bug, reported; the request gets a 500 (a body that isn't JSON: a 400)
    try {
      await ensureSchema(env);
      if (p === '/api/bugs' && req.method === 'POST') {
        const text = await req.text(); if (text.length > BUG_MAX_BYTES) return bad('Too large', 413);
        const b = JSON.parse(text), user = await authUser(req, env);
        const id = await storeBug(env, 'page', user ? user.id : ipOf(req), b);
        return id ? json({ id }) : bad('Not stored (too many reports)', 429);
      }
      if (p === '/api/bugs') { // the owner's reading: header x-bugs-key = the BUGS_KEY secret (not set: nobody can read)
        if (!env.BUGS_KEY || req.headers.get('x-bugs-key') !== env.BUGS_KEY) return bad('Not allowed', 403);
        const id = url.searchParams.get('id');
        if (id) { const r = await env.DB.prepare(`SELECT * FROM bugs WHERE id=?`).bind(id).first(); return r ? json({ ...r, context: JSON.parse(r.context) }) : bad('No such report.', 404); }
        return json({ bugs: (await env.DB.prepare(`SELECT id,created,source,who,msg,build FROM bugs ORDER BY created DESC LIMIT 200`).all()).results });
      }
      // AI training progress (/train.html polls it): the training machine posts its run's status with a secret token
      // whose SHA-256 is TRAIN_TOKEN_HASH (wrangler.jsonc); anyone may read it
      if (p === '/api/train' && req.method === 'POST') {
        const tok = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
        const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tok)))].map(b => b.toString(16).padStart(2, '0')).join('');
        if (!env.TRAIN_TOKEN_HASH || h !== env.TRAIN_TOKEN_HASH) return bad('Not allowed', 403);
        const text = await req.text(); if (text.length > 300000) return bad('Too large', 413);
        const st = JSON.parse(text);
        await env.DB.prepare(`INSERT INTO train(run,updated,body) VALUES(?,?,?) ON CONFLICT(run) DO UPDATE SET updated=excluded.updated, body=excluded.body`).bind(String(st.run || 'run').slice(0, 40), Date.now(), text).run();
        return json({ ok: true });
      }
      if (p === '/api/train') {
        const r = await env.DB.prepare(`SELECT updated, body FROM train ORDER BY updated DESC LIMIT 1`).first();
        return r ? jsonText(`{"updated":${r.updated},"now":${Date.now()},"status":${r.body}}`) : json({ updated: null, now: Date.now(), status: null });
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
        const log = JSON.parse(text), err = E.replayCheck(log); if (err) return bad(err, 400);
        const id = newId();
        const title = String(log.title || '').slice(0, 120), players = log.players.map(x => String(x.name || '').slice(0, 24)).join(', ');
        await env.DB.prepare(`INSERT INTO replays(id,created,title,players,actions,body) VALUES(?,?,?,?,?,?)`).bind(id, Date.now(), title, players, log.actions.length, text).run();
        await env.DB.prepare(`DELETE FROM replays WHERE game=0 AND id NOT IN (SELECT id FROM replays WHERE game=0 ORDER BY created DESC LIMIT ${REPLAY_KEEP})`).run();
        return json({ id });
      }
      if (p === '/api/replays' && req.method === 'GET') {
        const r = await env.DB.prepare(`SELECT ${GAME_COLS} FROM replays WHERE listed=1 ORDER BY created DESC LIMIT 50`).all();
        return json({ replays: r.results.map(gameRow) });
      }
      if ((m0 = p.match(/^\/api\/replays\/([a-z0-9]{6,12})$/)) && req.method === 'GET') {
        const r = await env.DB.prepare(`SELECT body FROM replays WHERE id=?`).bind(m0[1]).first();
        return r ? jsonText(r.body, 200, 'public, max-age=3600') : bad('No replay with that id.', 404);
      }
      // a player's profile: stats and their most recent games (each with its replay). Private rooms' games only for the player.
      if ((m0 = p.match(/^\/api\/users\/([A-Za-z0-9_-]{1,40})$/)) && req.method === 'GET') {
        const u = await env.DB.prepare(`SELECT id,name,rating,games,wins,bot FROM users WHERE id=?`).bind(m0[1]).first();
        if (!u) return bad('No such player.', 404);
        const me = await authUser(req, env), own = !!me && me.id === u.id;
        const rank = await env.DB.prepare(`SELECT COUNT(*)+1 AS r FROM users WHERE ${LADDER} AND rating>?`).bind(u.rating).first();
        if (env.DEV_AUTH === '1') { // (debug: a player on the leaderboard has the rank of their place on it, ties sharing one)
          const top = (await env.DB.prepare(`SELECT id,rating FROM users WHERE ${LADDER} ORDER BY rating DESC LIMIT 100`).all()).results;
          if (top.some(x => x.id === u.id)) E.assert(top.filter(x => x.rating > u.rating).length + 1 === rank.r, 'a profile\'s rank is its place on the leaderboard (' + u.name + ': rank ' + rank.r + ')'); }
        const g = await env.DB.prepare(`SELECT ${GAME_COLS},uids FROM replays WHERE game=1 AND uids LIKE ?${own ? '' : ' AND listed=1'} ORDER BY created DESC LIMIT ${REPLAYS_PER_PLAYER}`).bind('%,' + u.id + ',%').all();
        const games = g.results.map(r => ({ ...gameRow(r), seat: r.uids.split(',').filter(Boolean).indexOf(u.id) })); // seat: theirs in it
        return json({ user: { ...u, rank: rank.r }, games });
      }
      if (p === '/api/leaderboard') {
        const r = await env.DB.prepare(`SELECT id,name,rating,games,wins,bot FROM users WHERE ${LADDER} ORDER BY rating DESC LIMIT 100`).all();
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
        const code = await createRoom(env, user.id, roomOpts(env, b));
        return code ? json({ code }) : bad('Could not create a room, try again.', 500);
      }
      if (p === '/api/match' && req.method === 'POST') { // quick match: join the fullest waiting public match room, or open one
        const r = await (await lobby.fetch('https://lobby/match', { method: 'POST', body: JSON.stringify({ uid: user.id, opts: matchOpts(env) }) })).json();
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
      if (e instanceof SyntaxError) return bad('Expected JSON', 400); // (a request body that isn't JSON: the sender's mistake)
      console.error('worker:', req.method, p, e);
      await storeBug(env, 'worker', ipOf(req), { msg: errText(e), stack: e && e.stack, context: { method: req.method, path: p } });
      return bad('Server error: ' + errText(e), 500);
    }
  }
};

/* ---------------- Lobby: live list of rooms ---------------- */
export class Lobby extends DurableObject {
  // rooms: code → the room as it describes itself (Room.roomInfo) + when it last did. (Stored under 'list': 'rooms' held an older shape.)
  constructor(ctx, env) { super(ctx, env); this.rooms = null; ctx.blockConcurrencyWhile(async () => { this.rooms = (await ctx.storage.get('list')) || {}; await ctx.storage.delete('rooms'); }); }
  prune() { const now = Date.now(); for (const c in this.rooms) { const r = this.rooms[c]; if (now - r.updated > (r.status === 'playing' ? 12 : 2) * 3600e3) delete this.rooms[c]; } }
  list() { return Object.values(this.rooms).filter(r => r.opts.pub && (r.status === 'lobby' || r.status === 'playing')).map(({ updated, ...r }) => r); }
  broadcast() { const msg = JSON.stringify({ t: 'rooms', rooms: this.list() }); for (const ws of this.ctx.getWebSockets()) wsSend(ws, msg); }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') { const pair = new WebSocketPair(); this.ctx.acceptWebSocket(pair[1]); pair[1].send(JSON.stringify({ t: 'rooms', rooms: this.list() })); return new Response(null, { status: 101, webSocket: pair[0] }); }
    if (url.pathname === '/update') {
      const r = await req.json();
      if (r.status === 'closed' || r.status === 'over') delete this.rooms[r.code]; else this.rooms[r.code] = { ...r, updated: Date.now() };
      this.prune(); await this.ctx.storage.put('list', this.rooms); this.broadcast(); return json({ ok: true });
    }
    if (url.pathname === '/match') {
      const { uid, opts } = await req.json(), now = Date.now(), seated = x => x.seats.some(s => s.uid === uid && !s.left);
      const mine = Object.values(this.rooms).find(x => seated(x) && (x.status === 'lobby' || x.status === 'playing'));
      if (mine) return json({ code: mine.code });
      const open = Object.values(this.rooms).filter(x => x.opts.auto && x.status === 'lobby' && x.seats.length < x.opts.max && now - x.updated < 15 * 60e3).sort((a, b) => b.seats.length - a.seats.length);
      if (open.length) return json({ code: open[0].code });
      const code = await createRoom(this.env, uid, opts); if (!code) return json({ code: null });
      // listed right away so a second quick-matcher lands in the same room
      this.rooms[code] = { code, host: uid, status: 'lobby', opts, seats: [], results: null, updated: now };
      await this.ctx.storage.put('list', this.rooms); this.broadcast(); return json({ code });
    }
    if (url.pathname === '/find') { const uid = url.searchParams.get('uid'); const r = Object.values(this.rooms).find(x => x.seats.some(s => s.uid === uid && !s.left)); return json({ code: r ? r.code : null }); }
    return bad('Not found', 404);
  }
  async webSocketMessage(ws, msg) { if (msg === 'ping') ws.send('pong'); }
  async webSocketClose(ws) { wsClose(ws, 1000, 'Bye'); } // (answer with a normal close: the code received, e.g. 1005, may not be sent back)
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
const PCOLORS = E.COLORS.map(c => c.hex); // the seats' colours (one explorer figure each)
const AI_RULE = 'AI players play First Expedition with 3 or 4 players for now.';
const PLAYER_ACTIONS = ['move', 'native', 'pay', 'action', 'trash', 'transmit', 'buy', 'end', 'resign']; // what a player may send

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.d = null; this.S = null; this.rec = null;
    E.setAssertMode({ debug: env.DEV_AUTH === '1' });
    ctx.blockConcurrencyWhile(() => this.restore());
  }
  // storage: d (the room) and rec (the game's record: engine recNewGame). The game state S is rebuilt from rec. rec holds the
  // secret shuffle seed, so it is never sent out; once the game is over it is saved as the game's replay.
  async restore() {
    this.d = (await this.ctx.storage.get('d')) || null; this.rec = (await this.ctx.storage.get('rec')) || null; this.S = null; this.aiMem = {};
    if (this.rec && E.replayCheck(this.rec)) this.rec = null; // recorded under older rules: it can't be rebuilt
    if (this.rec) this.load();
    else if (this.d && this.d.status === 'playing') this.d.status = 'closed'; // a game this version can't rebuild
  }
  /* The room's boundary: each entry point (fetch, webSocketMessage, alarm, webSocketClose) runs in here. A bug (a failed
     assertion, or any exception) stops that one operation: it is logged and stored as a report with the room and its record,
     the room is rebuilt from storage (its last good state; the message that hit the bug is refused), and everyone is sent
     the state again. If even that fails, the socket that sent the message is closed; the object itself stays up. */
  async guard(what, ws, f) {
    try { return await f(); }
    catch (e) {
      console.error('room', this.d && this.d.code, what, e);
      await storeBug(this.env, 'room', 'room:' + (this.d ? this.d.code : '?'), { msg: errText(e), stack: e && e.stack, context: { what, d: this.d, rec: this.rec } });
      try {
        await this.restore();
        if (ws) this.send(ws, { t: 'error', err: 'Something went wrong on the server, sorry. That was not done; the game goes on.' });
        if (this.d) { this.sendAll(); if (this.S && !this.S.over && this.d.status === 'playing') await this.ctx.storage.setAlarm(Date.now() + 10000); } // (a failed alarm: its work is tried again)
      } catch (e2) { console.error('room: could not recover', e2); if (ws) wsClose(ws, 1011, 'Server error'); }
      return new Response('Server error', { status: 500 });
    }
  }
  // the game (S) and its board (MAP), rebuilt from the record
  load() { this.S = E.recState(this.rec); }
  // who plays each seat: the room's seats, in the game's seat order (fixed once the game starts)
  get owners() { return this.d.seats.map(s => s.uid); }
  async lobbyChanged() { await this.persist(); this.tellLobby(); this.sendAll(); } // a change the room list shows too
  async persist() { await this.ctx.storage.put(this.rec ? { d: this.d, rec: this.rec } : { d: this.d }); }
  async tellLobby() { try { const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName('main')); await lobby.fetch('https://lobby/update', { method: 'POST', body: JSON.stringify(this.roomInfo()) }); } catch (e) { await this.lost('the room list missed an update', e); } }
  /* something the room couldn't store or tell (the game itself goes on): logged and kept as a bug report */
  async lost(what, e) { console.error('room ' + this.d.code + ': ' + what, e); await storeBug(this.env, 'worker', 'room:' + this.d.code, { msg: what + ': ' + errText(e), stack: e && e.stack, context: { room: this.d.code } }); }
  online(uid) { return this.ctx.getWebSockets(uid).length > 0; }
  // left: the player resigned; the game goes on without them, so they are no longer in this room (the lobby's /find, /match)
  roomInfo() { const d = this.d; return { code: d.code, host: d.host, status: d.status, opts: d.opts, seats: d.seats.map((s, i) => ({ uid: s.uid, name: s.name, color: s.color, now: !!s.now, ai: s.ai || null, online: !!s.ai || this.online(s.uid), left: !!(this.S && this.S.players[i].resigned) })), results: d.results || null }; }
  send(ws, obj) { wsSend(ws, JSON.stringify(obj)); }
  stateFor(uid, ev) {
    const seat = this.owners.indexOf(uid);
    // left: ms on the turn clock (the page counts it down from when the message arrives), null when no clock runs
    return { t: 'state', S: E.redact(this.S, seat), ev: ev || [], seat, undo: seat >= 0 && seat === this.S.cur && E.recCanUndo(this.rec), left: this.d.deadline ? Math.max(0, this.d.deadline - Date.now()) : null, room: this.roomInfo() };
  }
  sendAll(ev) {
    for (const ws of this.ctx.getWebSockets()) {
      const { uid } = ws.deserializeAttachment(); // (every socket gets its attachment when it is accepted)
      if (this.S && this.d.status !== 'lobby') this.send(ws, this.stateFor(uid, ev)); else this.send(ws, { t: 'room', room: this.roomInfo() });
    }
  }
  fetch(req) { return this.guard(new URL(req.url).pathname, null, () => this.onFetch(req)); }
  webSocketMessage(ws, raw) { return this.guard(String(raw).slice(0, 2000), ws, () => this.onMessage(ws, raw)); }
  alarm() { return this.guard('alarm', null, () => this.onAlarm()); }
  webSocketClose(ws, code) { return this.guard('close', null, () => this.onClose(ws, code)); }
  async onFetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/init') {
      if (this.d) return json({ ok: false });
      const b = await req.json();
      this.d = { code: b.code, host: b.uid, seats: [], status: 'lobby', opts: b.opts, created: Date.now(), deadline: null, timeouts: {}, done: false, results: null };
      await this.persist(); return json({ ok: true });
    }
    if (url.pathname === '/ws') {
      // no such room: said on the socket itself (close code 4404), which the page can read; a refused handshake only
      // shows it a closed socket, the same as a dropped network, and it went on reconnecting for half a minute
      if (!this.d || this.d.status === 'closed') { const pair = new WebSocketPair(); pair[1].accept(); pair[1].close(4404, 'No such room'); return new Response(null, { status: 101, webSocket: pair[0] }); }
      const uid = req.headers.get('x-uid'), name = req.headers.get('x-name');
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], [uid]); pair[1].serializeAttachment({ uid, name });
      if (this.d.status === 'lobby' && !this.d.seats.find(s => s.uid === uid) && this.d.seats.length < this.d.opts.max) {
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
  async onMessage(ws, raw) {
    if (raw === 'ping') { ws.send('pong'); return; }
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const { uid } = ws.deserializeAttachment(), d = this.d; // (a socket is only accepted into a room that exists)
    const err = e => this.send(ws, { t: 'error', err: e });
    if (d.status === 'lobby') {
      const seat = d.seats.find(s => s.uid === uid);
      if (m.t === 'color' && seat && PCOLORS.includes(m.color) && !d.seats.some(s => s !== seat && s.color === m.color)) { seat.color = m.color; await this.persist(); this.sendAll(); }
      else if (m.t === 'leave') {
        if (d.opts.auto) { // match rooms never close on the host; the next player hosts
          d.seats = d.seats.filter(s => s.uid !== uid); if (d.host === uid && d.seats.length) d.host = d.seats[0].uid;
          if (!d.seats.length) d.status = 'closed';
          await this.seatsChanged(); await this.lobbyChanged(); wsClose(ws, 1000, 'Left'); return;
        }
        if (uid === d.host) { d.status = 'closed'; await this.lobbyChanged(); for (const w of this.ctx.getWebSockets()) wsClose(w, 1000, 'Room closed'); return; }
        d.seats = d.seats.filter(s => s.uid !== uid); await this.lobbyChanged(); wsClose(ws, 1000, 'Left');
      }
      else if (m.t === 'addAI') { // host seats a named AI (each at most once per room); it plays server-side
        if (d.opts.auto || uid !== d.host) return err('Only the host can add AI players.');
        const A = E.aiById(m.ai); if (!A) return err('Unknown AI.');
        if (!E.aiAllowed(d.opts.course, d.opts.max)) return err(AI_RULE);
        if (d.seats.length >= d.opts.max) return err('This room is full.');
        // the same AI may take several seats (named Humboldt, Humboldt 2, …; they share its rating)
        const row = await this.env.DB.prepare(`SELECT name FROM users WHERE id=?`).bind(aiUid(A.id)).first();
        if (d.status !== 'lobby' || d.seats.length >= d.opts.max) return err('This room is full.'); // checked again: other messages ran during the await
        const used = d.seats.map(s => s.color), base = row ? row.name : A.name, k = d.seats.filter(s => s.ai === A.id).length;
        d.seats.push({ uid: aiUid(A.id), name: k ? base + ' ' + (k + 1) : base, color: PCOLORS.find(c => !used.includes(c)), ai: A.id });
        await this.lobbyChanged();
      }
      else if (m.t === 'removeAI') {
        if (uid !== d.host) return err('Only the host can remove AI players.');
        const i = d.seats.map(s => !!s.ai && s.uid === m.uid).lastIndexOf(true); if (i >= 0) d.seats.splice(i, 1); await this.lobbyChanged();
      }
      else if (m.t === 'rated' && uid === d.host && !d.opts.auto) { d.opts.rated = !!m.v; await this.lobbyChanged(); }
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
    if (d.status !== 'playing') { if (m.t === 'act' || m.t === 'undo') err('This game is not running any more.'); return; }
    const seat = this.owners.indexOf(uid);
    if (m.t === 'selftest' && this.env.DEV_AUTH === '1') { this.S.round = -1; E.assert(false, 'self-test: a broken invariant in a live room'); } // (test/online.cjs: the boundary)
    if (m.t === 'undo') {
      if (seat !== this.S.cur || !E.recCanUndo(this.rec)) return err('Nothing to undo.');
      this.S = E.recUndo(this.rec); await this.persist(); this.sendAll(); return;
    }
    if (m.t === 'act') {
      if (seat < 0) return err('You are watching this game.');
      if (!m.a || typeof m.a !== 'object') return err('Bad action.');
      if (!PLAYER_ACTIONS.includes(m.a.t)) return err('Bad action.'); // (timeout and endgame are the server's and local play's, not a player's)
      const prevCur = this.S.cur, r = E.recApply(this.S, this.rec, seat, m.a);
      if (!r.ok) return err(r.err); // (a refused action changes nothing)
      d.timeouts[seat] = 0;
      if (this.S.cur !== prevCur && !this.S.over) await this.nextTurn();
      await this.afterChange(r.ev); // the player's answer first: waiting on the lobby below lets an AI alarm run meanwhile
      if (m.a.t === 'resign') await this.tellLobby(); // (they are out of the room now)
      return;
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
    E.shuffle(d.seats, Math.random); // the order around the table (who moves first): new each game; seat i plays player i
    ({ gs: this.S, rec: this.rec } = E.recNewGame({ course: d.opts.course === 'random' ? E.COURSES[Math.floor(Math.random() * E.COURSES.length)] : E.courseById(d.opts.course), seed: (Math.random() * 1e9) | 0, players: d.seats.map(s => ({ name: s.name, color: s.color, ai: s.ai || undefined })), fullRace: true }, E.recSecret()));
    d.status = 'playing'; d.timeouts = {}; d.bank = {}; d.clock = null;
    await this.nextTurn(); await this.lobbyChanged();
  }
  async afterChange(ev) {
    if (this.S.over && this.d.status === 'playing') await this.finish();
    await this.persist(); this.sendAll(ev);
  }
  /* time bank: each turn adds opts.turn seconds to the player's clock, and time not used carries over to their later
     turns (undo doesn't change it). d.bank[seat] = ms left when their last turn ended; d.clock = whose clock is running. */
  settleClock() {
    const d = this.d; if (d.clock == null || !d.deadline) { d.clock = null; return; }
    d.bank[d.clock] = Math.max(0, d.deadline - Date.now()); d.clock = null;
  }
  async startTurnTimer() {
    this.settleClock(); const d = this.d, seat = this.S.cur;
    d.clock = seat; d.deadline = Date.now() + (d.bank[seat] || 0) + d.opts.turn * 1000; d.aiAt = null;
    await this.ctx.storage.setAlarm(this.d.deadline);
  }
  /* the turn passed to someone new: a person gets the turn timer, an AI gets its next move scheduled (same alarm) */
  async nextTurn() { if (this.aiToMove()) await this.scheduleAI(900); else await this.startTurnTimer(); }
  aiToMove() { return !this.S.over && !!this.S.players[this.S.cur].ai; }
  // someone is following the game: a person still racing with the page open. Otherwise the AIs play on without pauses.
  watched() { return this.S.players.some((p, i) => !p.ai && !p.resigned && !p.pieces.every(k => k === 'done') && this.online(this.owners[i])); }
  async scheduleAI(ms) { this.settleClock(); const d = this.d; d.deadline = null; d.aiAt = Date.now() + (this.watched() ? ms : 0); await this.ctx.storage.setAlarm(d.aiAt); }
  /* AI seats play server-side, one action per alarm while people watch (so the table can follow), or AI_BATCH actions
     per alarm when nobody is racing with the page open. Counted, not timed: in a Worker the clock stands still while
     code runs (it moves on only at I/O), so a time budget never ran out and one alarm played the rest of the game,
     holding the room (and a resigning player's answer) for seconds. */
  async aiMove() {
    useNet(); const ev = []; const fast = !this.watched(); let n = 0;
    do {
      const seat = this.S.cur, mem = this.aiMem[seat] || (this.aiMem[seat] = {});
      const r = E.aiStep(this.S, this.S.players[seat].ai, mem, this.rec, Math.random); ev.push(...r.ev);
    } while (fast && this.aiToMove() && ++n < AI_BATCH);
    if (!this.S.over) { if (this.aiToMove()) await this.scheduleAI(700); else await this.startTurnTimer(); }
    await this.afterChange(ev);
  }
  async onAlarm() {
    const d = this.d; if (d.status !== 'playing') return; // (a game that ended meanwhile: finish() removes its alarm, and sets the status first)
    if (this.aiToMove()) { if (d.aiAt && Date.now() < d.aiAt - 50) { await this.ctx.storage.setAlarm(d.aiAt); return; } await this.aiMove(); return; }
    if (Date.now() < d.deadline - 1000) { await this.ctx.storage.setAlarm(d.deadline); return; }
    // the clock ran out: the turn ends; the third time in a row the player forfeits
    const seat = this.S.cur; d.timeouts[seat] = (d.timeouts[seat] || 0) + 1;
    const forfeit = d.timeouts[seat] >= 3, { ev } = E.recApply(this.S, this.rec, seat, { t: forfeit ? 'resign' : 'timeout' });
    if (!this.S.over) await this.nextTurn();
    await this.afterChange(ev);
    if (forfeit) await this.tellLobby();
  }
  /* the finished game's log becomes its replay (/?replay=<id>): kept for good, listed publicly unless the room was private.
     Returns the replay's id, or null (the log is too large, or the database failed). */
  async saveReplay() {
    const d = this.d; if (d.replay !== undefined) return d.replay;
    d.replay = null;
    const log = E.recFinal(this.rec, this.S);
    const id = newId();
    const text = JSON.stringify(log); if (text.length > REPLAY_MAX_BYTES) return null;
    try {
      await this.env.DB.prepare(`INSERT INTO replays(id,created,title,players,actions,body,game,uids,listed) VALUES(?,?,?,?,?,?,1,?,?)`)
        .bind(id, Date.now(), log.title.slice(0, 120), log.players.map(x => x.name).join(', '), log.actions.length, text, ',' + this.owners.join(',') + ',', d.opts.pub ? 1 : 0).run();
      d.replay = id;
      await pruneReplays(this.env.DB, this.owners);
    } catch (e) { await this.lost('the replay was not saved', e); }
    return d.replay;
  }
  async finish() {
    const d = this.d; this.settleClock(); d.status = 'over'; d.deadline = null;
    await this.ctx.storage.deleteAlarm();
    const replay = await this.saveReplay();
    if (!d.done && !d.opts.rated) { // unrated room: the result is kept, ratings don't move
      d.done = true; d.results = { places: this.S.places, unrated: true, replay };
      try { await this.env.DB.prepare(`INSERT OR IGNORE INTO matches(id,room,finished,data) VALUES(?,?,?,?)`).bind(d.code + '-' + d.created, d.code, Date.now(), JSON.stringify({ players: this.owners, names: this.S.players.map(p => p.name), ai: this.S.players.map(p => p.ai || null), places: this.S.places, rated: false, rounds: this.S.round, replay })).run(); } catch (e) { await this.lost('the result was not saved', e); }
    }
    if (!d.done) {
      d.done = true;
      const uids = this.owners;
      try {
        const rows = (await this.env.DB.prepare(`SELECT id,rating,games FROM users WHERE id IN (${uids.map(() => '?').join(',')})`).bind(...uids).all()).results;
        const by = Object.fromEntries(rows.map(r => [r.id, r]));
        const ratings = uids.map(u => (by[u] ? by[u].rating : 1200)), games = uids.map(u => (by[u] ? by[u].games : 0));
        const deltas = E.eloDeltas(ratings, this.S.places, games);
        const stmts = uids.map((u, i) => this.env.DB.prepare(`UPDATE users SET rating=rating+?, games=games+1, wins=wins+? WHERE id=?`).bind(deltas[i], this.S.places[i] === 1 ? 1 : 0, u));
        stmts.push(this.env.DB.prepare(`INSERT OR IGNORE INTO matches(id,room,finished,data) VALUES(?,?,?,?)`).bind(d.code + '-' + d.created, d.code, Date.now(), JSON.stringify({ players: uids, names: this.S.players.map(p => p.name), ai: this.S.players.map(p => p.ai || null), rated: true, places: this.S.places, before: ratings, deltas, rounds: this.S.round, replay })));
        await this.env.DB.batch(stmts);
        d.results = { places: this.S.places, before: ratings, deltas, replay };
      } catch (e) { d.results = { places: this.S.places, error: errText(e), replay }; await this.lost('the ratings were not updated', e); }
    }
    this.tellLobby();
  }
  async onClose(ws, code) {
    wsClose(ws, 1000, 'Bye'); // (answer with a normal close: the code received, e.g. 1005 'none', may not be sent back)
    const d = this.d; if (d.status === 'closed') return;
    const { uid } = ws.deserializeAttachment();
    // someone who closes the page before a quick match starts gives up their seat, so matches never start with absent players
    if (d.opts.auto && d.status === 'lobby' && !this.ctx.getWebSockets(uid).some(w => w !== ws && w.readyState === 1)) {
      d.seats = d.seats.filter(s => s.uid !== uid); if (d.host === uid && d.seats.length) d.host = d.seats[0].uid;
      if (!d.seats.length) d.status = 'closed';
      await this.persist(); this.tellLobby();
    }
    this.sendAll();
  }
}
