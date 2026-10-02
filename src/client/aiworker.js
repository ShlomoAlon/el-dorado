/* The AI's thinking, off the page's thread: a Web Worker running the same engine. The page (ai.js) sends it a position and
   gets back a decision, so an AI weighing its turn (or the replay's advisor weighing many turns) never holds up a frame
   or a tap. Built as its own script (build.mjs): a file of its own on the site, loaded when an AI first plays; inline in
   the artifact. Each request carries an id; the answer, or the error, comes back with it. */
import { aiChoose, aiPlan, aiSetNet, aiNetDecode, applyAction, botValue, mulberry32, setAssertMode } from '../engine.gen.js';

let gen = -1; const mems = new Map(); // (each AI seat's memory across its turns, for the game the page has on show: gen)
const ops = {
  init(m) { setAssertMode({ debug: m.debug }); },
  net(m) { aiSetNet(aiNetDecode(m.bin)); },
  /* a local AI's next action: its memory is kept here, per seat, until the page starts another game */
  choose(m) {
    if (m.gen !== gen) { gen = m.gen; mems.clear(); }
    if (!mems.has(m.seat)) mems.set(m.seat, {});
    return { a: aiChoose(m.S, m.ai, mems.get(m.seat), Math.random) };
  },
  /* how the network rates each player's position (resigned: 0) */
  value(m) { return { raw: m.S.players.map((p, j) => p.resigned ? 0 : Math.max(0, botValue(m.S, j, 'net'))) }; },
  /* the replay advisor's whole turn from a position, with a random stream of its own (the same advice every visit), and the
     position before each of its steps (the plan played forward on a copy) */
  advise(m) {
    const g = mulberry32(m.seed), line = aiPlan(m.S, m.ai, g); if (!line) return { line: null };
    const gs = JSON.parse(m.state), before = [];
    for (const a of line) { before.push(JSON.stringify(gs)); const me = gs.cur; if (!applyAction(gs, me, a, g).ok || gs.over || gs.cur !== me) break; }
    return { line: line.slice(0, before.length), before };
  },
};
onmessage = e => {
  const m = e.data;
  let out;
  try { out = ops[m.t](m); }
  catch (err) { postMessage({ id: m.id, err: String(err && err.message || err), stack: String(err && err.stack || ''), assertion: err && err.name === 'AssertionError' }); return; }
  if (m.id) postMessage({ id: m.id, ...out });
};
