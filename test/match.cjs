// Quick match + private rooms against `npm run dev` (DEV_AUTH=1): three players press Quick match,
// land in the same public room and the game starts by itself; two players can start early if both ask;
// a private room stays out of the public list.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8787/';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };
(async () => {
  const b = await chromium.launch(); const errs = [];
  const mk = async name => { const c = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await c.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message)); return p; };
  const signin = async (P, name) => { await P.goto(BASE); await P.waitForTimeout(800); await P.click('#sMode label[data-v="online"]'); await P.waitForTimeout(400); await P.fill('#devName', name); await P.click('#devGo'); await P.waitForTimeout(800); };
  const tag = 'm' + Date.now() % 100000;
  const [A, B, C, D] = await Promise.all(['A', 'B', 'C', 'D'].map(mk));
  await signin(A, tag + 'a'); await signin(B, tag + 'b'); await signin(C, tag + 'c'); await signin(D, tag + 'd');
  // private room: not listed
  const priv = await D.evaluate(async () => { const r = await fetch('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + __ED.NET.token }, body: JSON.stringify({ max: 3, pub: false }) }); const j = await r.json(); __ED.joinRoom(j.code); return j.code; });
  await D.waitForTimeout(1200);
  await A.click('#qGo'); await A.waitForTimeout(1200);
  await B.waitForTimeout(800);
  const listed = await B.evaluate(() => __ED.NET.rooms.map(r => r.code + (r.auto ? '*' : '')));
  console.log('private', priv, 'listed', listed);
  assert(!listed.some(c => c.startsWith(priv)), 'private room is listed');
  const codeA = await A.evaluate(() => __ED.NET.code);
  assert(listed.includes(codeA + '*'), 'match room not listed');
  await B.click('#qGo'); await B.waitForTimeout(1200);
  assert(await B.evaluate(() => __ED.NET.code) === codeA, 'second player got another room');
  assert(await A.evaluate(() => !document.querySelector('#rlStart')), 'match room shows a start button');
  await C.click('#qGo'); await C.waitForTimeout(2500);
  const st = await Promise.all([A, B, C].map(P => P.evaluate(() => ({ code: __ED.NET.code, started: !!(__ED.S && __ED.S.owners), n: __ED.S && __ED.S.players.length, course: __ED.S && __ED.S.course.id }))));
  console.log(st);
  assert(st.every(s => s.code === codeA && s.started && s.n === 3), 'match did not start with all three');
  // a second match room: two players both press Start now -> a 2-player game
  const [E1, F1] = await Promise.all(['E', 'F'].map(mk)); await signin(E1, tag + 'e'); await signin(F1, tag + 'f');
  await E1.click('#qGo'); await E1.waitForTimeout(1000); await F1.click('#qGo'); await F1.waitForTimeout(1200);
  const c2 = await E1.evaluate(() => __ED.NET.code); assert(c2 !== codeA && c2 === await F1.evaluate(() => __ED.NET.code), 'second match room');
  await E1.click('#rlNow'); await E1.waitForTimeout(800);
  assert(await E1.evaluate(() => !(__ED.S && __ED.S.owners)), 'started after one request');
  await F1.click('#rlNow'); await F1.waitForTimeout(1500);
  assert(await E1.evaluate(() => !!(__ED.S && __ED.S.owners) && __ED.S.players.length === 2), '2-player match did not start on request');
  await A.screenshot({ path: '/tmp/m_game.png' });
  console.log(errs.length ? errs : 'ok: quick match + private rooms');
  await b.close(); if (errs.length) process.exit(1);
})();
