// Online AI seats (run against `wrangler dev` with DEV_AUTH=1, like test/e2e.cjs):
//  1. rated room: one person + Humboldt + Raleigh, added from the room lobby. The AIs move on the server during the game;
//     after a few turns the person leaves, the two AIs race to the end on their own, and every rating (AIs included) moves.
//  2. unrated room: person + Orellana; nobody's rating moves.
//   NODE_PATH=$(npm root -g) node test/e2e_ai.cjs [--shots dir]
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8787/';
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const fail = m => { console.log('FAIL: ' + m); process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const errs = [];
  const mk = async (name, w = 1280, h = 800) => { const c = await b.newContext({ viewport: { width: w, height: h } }); const p = await c.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_TUNNEL|ERR_CERT|gsi/.test(m.text())) errs.push(name + ' console: ' + m.text()); }); return p; };
  const A = await mk('A');
  await A.goto(BASE); await A.waitForTimeout(800); await A.click('#sMode button[data-m="online"]'); await A.waitForTimeout(400);
  await A.fill('#devName', 'Ada' + Date.now() % 10000); await A.click('#devGo'); await A.waitForTimeout(800);
  const board = () => A.evaluate(async () => Object.fromEntries((await (await fetch('/api/leaderboard')).json()).players.map(p => [p.id, { r: p.rating, g: p.games, bot: p.bot }])));
  const lb0 = await board();
  for (const id of ['ai-humboldt', 'ai-orellana', 'ai-raleigh']) if (!lb0[id] || !lb0[id].bot) fail('AI player missing from the leaderboard: ' + id);
  // hub: rated / unrated choice exists
  if (!(await A.$('#cRated'))) fail('no rated/unrated choice in the hub');
  const mkRoom = rated => A.evaluate(async rated => { const r = await fetch('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + __ED.NET.token }, body: JSON.stringify({ max: 3, turn: 10, course: 'first', rated }) }); const j = await r.json(); __ED.joinRoom(j.code); return j.code; }, rated);
  // ---- 1. rated room with two AIs
  const code = await mkRoom(true); await A.waitForTimeout(1200);
  await A.click('[data-addai="humboldt"]'); await A.waitForTimeout(500);
  await A.click('[data-addai="raleigh"]'); await A.waitForTimeout(700);
  if (shots) await A.screenshot({ path: shots + '/e2e_ai_room.png' });
  const seats = await A.evaluate(() => __ED.NET.room.seats.map(s => (s.ai || 'human') + ':' + s.name));
  console.log('room', code, seats);
  if (seats.length !== 3 || !seats[1].startsWith('humboldt') || !seats[2].startsWith('raleigh')) fail('AI seats not added');
  await A.click('#rlStart'); await A.waitForTimeout(1500);
  const st = () => A.evaluate(() => ({ cur: __ED.S.cur, round: __ED.S.round, over: __ED.S.over, can: __ED.canAct(), ai: __ED.S.players.map(p => p.ai || ''), log: __ED.S.log.slice(-2).map(l => l.t), deadline: __ED.NET.deadline }));
  let s = await st(); console.log('start', s);
  if (s.ai.join() !== ',humboldt,raleigh') fail('AI seats not in the game state');
  let aiTurnSeen = false;
  for (let t = 0; t < 3; t++) {
    for (let i = 0; i < 60 && !(s = await st()).can && !s.over; i++) { if (s.cur !== 0) { aiTurnSeen = true; if (s.deadline) fail('turn timer running on an AI turn'); } await A.waitForTimeout(500); }
    if (!s.can) { fail('the turn never came back from the AIs'); break; }
    if (t === 1 && shots) await A.screenshot({ path: shots + '/e2e_ai_game.png' });
    await A.evaluate(() => { __ED.startEndTurn(); if (__ED.UI.mode === 'endTurn' || __ED.UI.mode === 'buyWarn') __ED.finishTurn(); });
    await A.waitForTimeout(700);
  }
  s = await st(); console.log('after 3 turns', s);
  if (!aiTurnSeen || s.round < 3) fail('AIs did not take turns');
  // the person leaves: the AIs race to the end by themselves (fast: nobody is racing with the page open)
  await A.evaluate(() => __ED.netSend({ t: 'resign' }));
  const t0 = Date.now(); for (let i = 0; i < 240 && !(s = await st()).over; i++) await A.waitForTimeout(500);
  console.log('over', s.over, 'round', s.round, 'in', Math.round((Date.now() - t0) / 1000) + 's', await A.evaluate(() => ({ places: __ED.S.places, res: __ED.NET.room.results })));
  if (!s.over) fail('the AI game did not finish');
  await A.waitForTimeout(1200);
  if (shots) await A.screenshot({ path: shots + '/e2e_ai_over.png' });
  const lb1 = await board();
  for (const id of ['ai-humboldt', 'ai-raleigh']) if (lb1[id].g !== lb0[id].g + 1) fail('rated game not counted for ' + id);
  const res = await A.evaluate(() => __ED.NET.room.results);
  if (!res || !res.deltas || res.deltas.every(x => x === 0)) fail('no rating changes');
  ['ai-humboldt', 'ai-raleigh'].forEach((id, k) => { if (Math.abs(lb1[id].r - lb0[id].r - res.deltas[k + 1]) > .01) fail('rating of ' + id + ' does not match its delta'); });
  console.log('ratings', ['ai-humboldt', 'ai-raleigh', 'ai-orellana'].map(id => id + ' ' + lb0[id].r + ' → ' + lb1[id].r).join(', '));
  // ---- 2. unrated room: nothing moves
  await A.evaluate(() => { document.querySelector('#gClose')?.click(); });
  const me = await A.evaluate(() => __ED.NET.user.id);
  const code2 = await mkRoom(false); await A.waitForTimeout(1200);
  await A.click('[data-addai="orellana"]'); await A.waitForTimeout(600);
  await A.click('#rlStart'); await A.waitForTimeout(1500);
  await A.evaluate(() => __ED.netSend({ t: 'resign' })); await A.waitForTimeout(1500);
  const r2 = await A.evaluate(() => ({ over: __ED.S.over, res: __ED.NET.room.results, code: __ED.NET.code }));
  const lb2 = await board();
  console.log('unrated', code2, r2);
  if (!r2.over || !r2.res || !r2.res.unrated) fail('unrated game did not end as unrated');
  if (lb2['ai-orellana'].g !== lb1['ai-orellana'].g || lb2['ai-orellana'].r !== lb1['ai-orellana'].r || (lb2[me] && lb1[me] && lb2[me].r !== lb1[me].r)) fail('an unrated game changed ratings');
  // leaderboard shows the AIs, marked
  await A.evaluate(() => { document.querySelector('#gClose')?.click(); });
  if (errs.length) fail('page errors: ' + errs.slice(0, 5).join(' | '));
  await b.close();
  if (!process.exitCode) console.log('e2e ai ok');
})();
