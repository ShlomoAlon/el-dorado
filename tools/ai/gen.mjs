// Plays games on the real rules engine (no server) in parallel worker threads.
//   HORIZON=3 node tools/ai/gen.mjs <mode> <games> <out-prefix|-> [net.json] [course-id]
//   mode: self – the net plays (25% of seats heuristic); every position after one of its own actions is a sample,
//                target = TD(λ) return of the game result (TD-Gammon style)
//         eval – the net vs 2 heuristic bots, 3 players, seats rotated; no samples
// HORIZON: games stop after this many rounds (curriculum). Unfinished players are ranked by how close they got.
// Result for each player, in [0,1]: 0.8 × placement (1 = first, 0 = last) + 0.2 × how far ahead of the others (distance).
// Samples are sparse: <out>.len.bin (u32 non-zeros per row) .idx.bin (u16 columns) .val.bin (f32) .Y.bin (f32 target).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, readFileSync, appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { cpus } from 'node:os';
import { E } from '../../src/engine.gen.js';
const LAMBDA = 0.7;
const MAXBACK = process.env.MAXBACK === '1';
const TREESTRAP = +(process.env.TREESTRAP || 0);
const DISTILL = process.env.DISTILL === '1';
// LEAGUE=a.json,b.json: in self-play a share (LEAGUE_P, default 0.25) of seats is played by these past frozen networks (plain play), so the network doesn't only learn to beat its own habits
const LEAGUE = process.env.LEAGUE ? process.env.LEAGUE.split(',').map(f => JSON.parse(readFileSync(f, 'utf8'))) : null, LEAGUE_P = +(process.env.LEAGUE_P || .25);
// ANNEAL=T0,factor,floor: log-odds exploration whose temperature starts at T0 in round 1 and is multiplied by factor each round down to floor
const ANNEAL = process.env.ANNEAL ? process.env.ANNEAL.split(',').map(Number) : null; // max-backup targets from the whole-turn planner (needs MAXBACK=1) // untaken options learned per decision (see the self-play loop) // within-turn max backup (see the self-play loop)

if (!isMainThread) {
  const { mode, games, seed0, net, course, H, eps, temp, lotemp, buyEps, transEps, typeEps, bench, stuckFile, giftRate, giftW, beam, oldNet, wi = 0 } = workerData;
  // four-way test (search runs): the new net with search ('net'), the same net without search ('netP'), the frozen old net with
  // search ('oldS') and without ('old'); 4-player games seat all four, 3-player games leave each one out in turn; seats rotated.
  // new+search vs old+search is the measure of training progress (search alone makes either net much stronger)
  const table = mode === 'eval' && beam && oldNet;
  const search = beam ? { kind: 'plan', beam } : undefined; // SEARCH_BEAM: nets play through the whole-turn planner
  const C = E.COURSES.find(c => c.id === course) || E.COURSES[0];
  if (net) E.setNet(net);
  let s = seed0 >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const X = [], Y = [], st = { win3: 0, seat3: 0, win4: 0, seat4: 0, netWins: 0, netSeats: 0, netRem: [], heurRem: [], netArr: [], heurArr: [], capped: 0, buysNet: {}, buysHeur: {}, transNet: {}, transHeur: {}, dec: {}, explore: {}, stuck: 0 };
  const inc = (k, sub, by = 1) => { const o = st.dec[k] = st.dec[k] || {}; o[sub] = (o[sub] || 0) + by; };
  const T = id => E.S.cards[id];
  for (let g = 0; g < games; g++) {
    let pols;
    // 3- and 4-player games only (2-player games use different rules)
    if (mode === 'self') { const np = rnd() < .5 ? 3 : 4; pols = Array.from({ length: np }, () => { const r = rnd(); return r < .25 ? 'heur' : LEAGUE && r < .25 + LEAGUE_P ? 'lg' + Math.floor(rnd() * LEAGUE.length) : 'net'; }); if (!pols.includes('net')) pols[0] = 'net'; }
    else if (table) { const gi = wi * games + g, np = gi % 2 ? 4 : 3, k = gi >> 1, all = ['net', 'netP', 'oldS', 'old'], a = np === 4 ? all : all.filter((_, i) => i !== k % 4);
      pols = a.map((_, i) => a[(i + (k >> 2)) % np]); }
    else { const np = g % 2 ? 4 : 3, a = ['net', ...Array(np - 1).fill('heur')]; pols = a.map((_, i) => a[(i + (g >> 1)) % np]); } // half 3-player, half 4-player, seats rotated
    // every game is recorded as a replayable log (seeded shuffles); games that hit the final cap are saved for viewing
    const glog = { kind: 'eldorado-replay', v: 1, course: C.id, seed: (rnd() * 2 ** 31) | 0, rng: (rnd() * 2 ** 32) >>> 0, fullRace: true,
      players: pols.map((p, i) => ({ name: `${{ net: search ? 'Net + search' : 'Bot (net)', netP: 'Net (no search)', old: 'Old net', oldS: 'Old net + search' }[p] || 'Planner'} ${i + 1}`, bot: p === 'heur' ? bench : p })), actions: [] };
    // exploration: now and then every player starts with the same extra card, favouring cards the bot rarely buys
    if (mode === 'self' && !lotemp && !ANNEAL && giftW && rnd() < giftRate) { let r = rnd() * giftW.reduce((a, x) => a + x[1], 0); for (const [t, w] of giftW) { r -= w; if (r <= 0) { glog.gift = t; break; } } glog.gift = glog.gift || giftW[giftW.length - 1][0];
      st.explore.gift = (st.explore.gift || 0) + 1; inc('Gift card given to every player (exploration)', glog.gift); }
    // MIX_PLAIN=1 (search runs): one net seat per self-play game plays plain (no planner), the others through the planner.
    // Off by default: the mixed run (2026-09-27) saw search's lead over the old net stall while the plain net caught up.
    const plainSeat = pols.map(() => false);
    if (mode === 'self' && search && process.env.MIX_PLAIN === '1') { const ns = pols.map((p, i) => p === 'net' ? i : -1).filter(i => i >= 0);
      if (ns.length > 1 || rnd() < .5) plainSeat[ns[Math.floor(rnd() * ns.length)]] = true; }
    glog.players.forEach((p, i) => { if (pols[i] === 'net' && search) p.name = `${plainSeat[i] ? 'Net (no search)' : 'Net + search'} ${i + 1}`; });
    const shuf = E.replayStart(glog); E.setRng(null);
    const traj = pols.map(() => []), trajU = pols.map(() => []), trajB = pols.map(() => []), lastPush = pols.map(() => null); let acts = 0, lastMe = -1, lastRound = -1, turnState = null, capped = false;
    while (!E.S.over) {
      const S = E.S; S.log.length = 0;
      if (S.round > H || acts > 20000) { capped = S.round > H; E.endGame(); break; }
      const me = S.cur, isNet = pols[me] === 'net';
      if (me !== lastMe || S.round !== lastRound) { lastMe = me; lastRound = S.round; const nb = mode === 'self' && !lotemp && !ANNEAL && isNet && rnd() < buyEps; turnState = { noBuy: nb, forceBuy: false && mode === 'self' && isNet && rnd() < buyEps, forceTransmit: mode === 'self' && isNet && rnd() < transEps }; }
      const c = mode === 'eval' && pols[me] === 'netP' ? E.botChoose({ mode: 'net', rnd })
        : mode === 'eval' && pols[me] === 'old' ? (E.setNet(oldNet), ((x) => (E.setNet(net), x))(E.botChoose({ mode: 'net', rnd })))
        : mode === 'eval' && pols[me] === 'oldS' ? (E.setNet(oldNet), ((x) => (E.setNet(net), x))(E.botChoose({ mode: 'net', rnd, search })))
        : mode === 'eval' ? E.botChoose({ mode: isNet ? 'net' : bench, rnd, search: isNet ? search : undefined })
        : isNet ? E.botChoose(lotemp || ANNEAL ? { mode: 'net', eps, lotemp: ANNEAL ? Math.max(ANNEAL[2], ANNEAL[0] * ANNEAL[1] ** (S.round - 1)) : lotemp, rnd } : { mode: 'net', eps, temp, typeEps, turnState, rnd, search: plainSeat[me] ? undefined : search })
        : pols[me].startsWith('lg') ? (E.setNet(LEAGUE[+pols[me].slice(2)]), ((x) => (E.setNet(net), x))(E.botChoose({ mode: 'net', rnd, temp: .004 })))
        : E.botChoose({ mode: bench, eps: .03, noise: .3, rnd });
      // MAXBACK=1 (Q-learning style max backup within a turn): my turn has no luck between my own actions, so the position after
      // my previous action is worth the BEST option available now, not whatever I happen to do next (exploration, habits).
      // Only within the same turn and never across "end turn"; other steps keep the TD(λ) update.
      if (MAXBACK && mode === 'self' && isNet) { const lp = lastPush[me];
        const explored = c.why === 'explore' || c.why === 'random';
        if (lp && traj[me].length === lp.idx + 1 && trajB[me][lp.idx] == null && ((lp.round === S.round && !lp.ended) || (explored && (lotemp || ANNEAL)))) {
          // DISTILL=1: the target is the whole-turn planner's best completion from here (search distilled into the network)
          const b = DISTILL ? E.botChoose({ mode: 'net', rnd, search: { kind: 'plan', beam: 3 } }).v
            : c.best != null && !(turnState && turnState.noBuy) ? c.best : E.botChoose({ mode: 'net', rnd }).best;
          trajB[me][lp.idx] = b; st.maxback = (st.maxback || 0) + 1; } }
      // TREESTRAP=n (TreeStrap-style): also learn from n options I did NOT take. Each is scored one step further ahead (the best
      // option available after it, within my turn), so positions my habits never reach (e.g. move before buying) get trained too.
      if (TREESTRAP && mode === 'self' && isNet) { const root = E.S, sib = E.botActions().filter(a => a.t !== 'end' && JSON.stringify(a) !== JSON.stringify(c.a));
        for (let k = 0; k < TREESTRAP && sib.length; k++) { const a = sib.splice(Math.floor(rnd() * sib.length), 1)[0];
          E.S = E.botClone(root); const r = E.applyAction(me, a);
          if (r.ok && !E.S.over && E.S.cur === me && !E.playerDone(E.S.players[me])) { const f = E.botNetFeatures(me), b = E.botChoose({ mode: 'net', rnd }).best;
            if (b != null && b > -Infinity) { X.push(f); Y.push(b); st.treestrap = (st.treestrap || 0) + 1; } }
          E.S = root; } }
      // track every kind of decision the network makes (and which of them were exploration)
      if (isNet) {
        const a = c.a, P = S.players[me];
        st.netDec = (st.netDec || 0) + 1; if (c.why) st.explore[c.why] = (st.explore[c.why] || 0) + 1;
        if (turnState && turnState.noBuy && !turnState.nbCounted) { turnState.nbCounted = 1; st.explore.noBuyTurn = (st.explore.noBuyTurn || 0) + 1; }
        if (a.t === 'trash') { inc('Remove (Scientist / Travel Log): how many', a.cards.length + ''); for (const id of a.cards) inc('Remove (Scientist / Travel Log): which card', T(id)); }
        else if (a.t === 'pay') { const kind = a.to[0] === 'B' ? 'Rubble blockade: cards given up' : E.MAPX.hexes.get(a.to).type === 'c' ? 'Base camp: cards removed from the game' : 'Rubble: cards discarded'; for (const id of a.cards) inc(kind, T(id)); }
        else if (a.t === 'action') inc('Draw cards played', T(a.card));
        else if (a.t === 'native') inc('Native', a.to[0] === 'B' ? 'tore down a blockade' : 'moved');
        else if (a.t === 'end') {
          inc('End of turn: cards kept', a.keep.length + ''); for (const id of a.keep) inc('End of turn: which cards kept', T(id));
          for (const id of P.hand) if (!a.keep.includes(id) && ['cartographer', 'compass', 'scientist', 'travellog', 'native', 'transmitter'].includes(T(id))) inc('Ended the turn without playing', T(id));
          if (!S.turn.bought) { const cash = P.hand.reduce((x, id) => x + ((E.CT[T(id)].c === 'y' || E.CT[T(id)].c === 'x') ? E.CT[T(id)].p : .5), 0), open = S.market.some(q => q.n === 0);
            const cheapest = Math.min(...[...S.market, ...(open ? S.reserve : [])].filter(q => q.n > 0).map(q => E.CT[q.t].cost));
            inc('Buying', cash >= cheapest ? 'could afford a card but bought nothing' : 'could not afford anything'); }
          else inc('Buying', 'bought a card');
        }
      }
      if (c.a.t === 'buy' || c.a.t === 'transmit') { const stk = c.a.src === 'm' ? S.market[c.a.idx] : S.reserve[c.a.idx]; if (stk) { const b = c.a.t === 'transmit' ? (isNet ? st.transNet : st.transHeur) : (isNet ? st.buysNet : st.buysHeur); b[stk.t] = (b[stk.t] || 0) + 1; } }
      // sample = the position right after my action, as I'll see it: for "end turn", before the next hand is drawn
      const f = mode === 'self' ? (c.a.t === 'end' ? E.botEndFeatures(me, c.a.keep) : null) : null;
      E.setRng(shuf); const r = E.applyAction(me, c.a); acts++;
      if (!r.ok) E.applyAction(me, { t: 'end', keep: [] });
      E.setRng(null); glog.actions.push([me, r.ok ? c.a : { t: 'end', keep: [] }]);
      if (r.ok && isNet) for (const e of r.ev) if (e.e === 'block') inc('Blockades taken', '#' + e.n);
      // no samples once my place is settled: play never asks the network about those positions (they get the exact place value),
      // and bootstrapping through its guess for them (the average over all places) inflated the moves just before arriving,
      // so arriving in a low place looked worse than hovering next to El Dorado. The λ-return starts from the exact result.
      // Arrived but not settled (someone after me this round can still arrive and win the tie-break): play asks the network,
      // so those positions are sampled; they are the last of my trajectory, so their target is the exact result.
      if (mode === 'self' && !E.S.over && (!E.playerDone(E.S.players[me]) || !E.botPlaceSettled(me))) { traj[me].push(f || E.botNetFeatures(me)); trajU[me].push(E.playerDone(E.S.players[me])); trajB[me].push(null); lastPush[me] = { idx: traj[me].length - 1, round: E.S.round, ended: c.a.t === 'end' || E.S.cur !== me }; }
    }
    if (capped) st.capped++;
    if (process.env.REPLAYALL) writeFileSync(`${process.env.REPLAYALL}/g-${glog.seed}.json`, JSON.stringify(glog)); // testing: keep every game
    // a full-length game where someone still hasn't arrived by the cap is probably a bug: save it
    if (capped && H >= 25 && stuckFile && st.stuck < 5) { st.stuck++; const S = E.S;
      glog.title = `training ${mode} game · hit the 25-round cap`; glog.result = { capped: true, arrived: S.players.map(p => p.fin) };
      mkdirSync('tools/ai/data/replays', { recursive: true }); writeFileSync(`tools/ai/data/replays/stuck-${glog.seed}.json`, JSON.stringify(glog));
      appendFileSync(stuckFile, JSON.stringify({ mode, round: S.round, pols, players: S.players.map((p, i) => ({ pieces: p.pieces, left: E.botRemaining(i), fin: p.fin, hand: p.hand.map(T), cards: [...p.deck, ...p.hand, ...p.discard, ...p.play].map(T).sort().join(',') })), blockades: S.blockades }) + '\n'); }
    const S = E.S, n = pols.length, rem = S.players.map((_, i) => E.botRemaining(i));
    S.players.forEach((p, i) => {
      const others = rem.filter((_, j) => j !== i), lead = others.reduce((a, x) => a + x, 0) / others.length - rem[i];
      // result = what the place is worth (1st 1, 2nd ¼, 3rd ⅛, last 0; E.botPlaceValue).
      // Short horizons also reward getting far; at the final 25-round cap, not arriving is worth 0 whoever got closest.
      const fail = capped && H >= 25 && !p.fin, win = S.places[i] === 1 && !fail, pv = E.botPlaceValue(S.places[i], n);
      const z = fail ? 0 : H >= 25 ? pv : 0.8 * pv + 0.2 / (1 + Math.exp(-lead / 5));
      // (a network not yet trained on arrived-but-unsettled positions has no idea there: bootstrap through the result instead)
      if (mode === 'self') { const T = traj[i], U = trajU[i], Bv = trajB[i]; let G = z; for (let t = T.length - 1; t >= 0; t--) { X.push(T[t]); Y.push(G); G = t > 0 && Bv[t - 1] != null ? Bv[t - 1] : (1 - LAMBDA) * (net && (net.unsettled || !U[t]) ? E.botNetValue(T[t]) : G) + LAMBDA * G; } }
      if (table) { const tn = (st.tab = st.tab || {})['p' + n] = st.tab['p' + n] || {}, t = tn[pols[i]] = tn[pols[i]] || { seats: 0, wins: 0, pv: 0, arrSum: 0, arrN: 0 };
        t.seats++; if (win) t.wins++; t.pv += fail ? 0 : pv; if (p.fin) { t.arrSum += p.fin; t.arrN++; } if (i === 0) tn.games = (tn.games || 0) + 1; }
      if (pols[i] === 'net') { st.netSeats++; if (win) st.netWins++; st['seat' + n]++; if (win) st['win' + n]++; st.netRem.push(rem[i]); if (p.fin) st.netArr.push(p.fin); }
      else { st.heurRem.push(rem[i]); if (p.fin) st.heurArr.push(p.fin); }
    });
  }
  let nnz = 0; for (const x of X) for (const v of x) if (v !== 0) nnz++;
  const len = new Uint32Array(X.length), idx = new Uint16Array(nnz), val = new Float32Array(nnz); let o = 0;
  X.forEach((x, i) => { let c = 0; for (let k = 0; k < x.length; k++) if (x[k] !== 0) { idx[o] = k; val[o++] = x[k]; c++; } len[i] = c; });
  parentPort.postMessage({ len, idx, val, Y: new Float32Array(Y), nf: X.length ? X[0].length : 0, st }, [len.buffer, idx.buffer, val.buffer]);
}

// gift-card weights: 1 / (1 + times the bot bought that card in the latest self-play batch)
function giftWeights(course) {
  let buys = {}; try { const L = readFileSync(`tools/ai/data/${course}.log`, 'utf8').split('\n').filter(l => l.includes('] GEN ') && l.includes('"mode":"self"'));
    if (L.length) buys = JSON.parse(L[L.length - 1].slice(L[L.length - 1].indexOf('{'))).buysNet || {}; } catch (e) { }
  return Object.entries(E.CT).filter(([, d]) => d.cost).map(([t]) => [t, 1 / (1 + (buys[t] || 0))]);
}
if (isMainThread) {
  const [, , mode = 'self', G = '100', out = '-', netPath = '', course = 'first'] = process.argv;
  const net = netPath ? JSON.parse(readFileSync(netPath, 'utf8')) : null;
  const W = cpus().length, t0 = Date.now(), env = process.env;
  // Exploration: one level EXPLORE in [0,1] (loop.sh lowers it as the bot improves) scales every rate, same for every course.
  const X = +(env.EXPLORE ?? 1);
  const wd = { mode, net, course, H: +(env.HORIZON || 60), explore: X,
    bench: env.BENCH || 'plan',    // the benchmark / opponent bot (the planner heuristic)
    stuckFile: `tools/ai/data/${course}.stuck.jsonl`,
    typeEps: 0.05 * X,             // a random kind of decision (buy / remove / keep / rubble / draw card / …), then a random option of it
    eps: env.EXPLORE_EPS ? +env.EXPLORE_EPS : 0.03 * X,                 // a uniformly random legal action
    lotemp: +(env.EXPLORE_T || 0),   // EXPLORE_T: log-odds exploration temperature (replaces temp, typeEps, no-buy turns and gift cards)
    temp: Math.max(0.004, 0.02 * X), // softmax over action scores (near-best options tried often)
    buyEps: 0.10 * X,              // turns where buying is off (random purchases were replaced by gift cards)
    giftRate: 0.5 * X,             // games where every player starts with the same extra card (weighted toward rarely bought cards)
    giftW: giftWeights(course),
    beam: +(env.SEARCH_BEAM || 0),
    oldNet: mode === 'eval' && +(env.SEARCH_BEAM || 0) ? JSON.parse(readFileSync(env.EVAL_OLD || 'tools/ai/models/first-td-evaluated.json', 'utf8')) : null,
    transEps: 0 };                 // (forced random Transmitter picks removed: gift cards cover rare cards)
  const GN = wd.oldNet ? +(env.EVAL_GAMES || 72) : +G; // the four-way test uses fewer games
  const rs = await Promise.all(Array.from({ length: W }, (_, wi) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { ...wd, wi, games: Math.ceil(GN / W), seed0: (Math.random() * 2 ** 31) | 0 } });
    w.on('message', res); w.on('error', rej);
  })));
  const st = {}; for (const r of rs) for (const k in r.st) { const v = r.st[k];
    const add = (dst, src) => { for (const t in src) { if (typeof src[t] === 'object') add(dst[t] = dst[t] || {}, src[t]); else dst[t] = (dst[t] || 0) + src[t]; } return dst; };
    if (Array.isArray(v)) st[k] = (st[k] || []).concat(v); else if (typeof v === 'object') st[k] = add(st[k] || {}, v); else st[k] = (st[k] || 0) + v; }
  const avg = a => a && a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null;
  const r3 = st.seat3 ? st.win3 / st.seat3 : null, r4 = st.seat4 ? st.win4 / st.seat4 : null;
  // win rate relative to a fair share (1/3 in 3-player, 1/4 in 4-player); 1.0 = as good as the heuristic
  const rel = (st.seat3 || st.seat4) ? +((st.win3 + st.win4) / (st.seat3 / 3 + st.seat4 / 4)).toFixed(3) : null;
  try { const D = 'tools/ai/data/replays/'; const old = readdirSync(D).filter(f => f.startsWith('stuck-')).map(f => [f, statSync(D + f).mtimeMs]).sort((x, y) => y[1] - x[1]).slice(60);
    for (const [f] of old) unlinkSync(D + f); } catch (e) { } // keep the newest 60 capped-game replays
  // per table size: every player's share of the wins (sums to 100% minus games nobody finished), place value, arrival round
  const tab = st.tab ? Object.fromEntries(Object.entries(st.tab).map(([n, tn]) => [n, { games: tn.games, ...Object.fromEntries(Object.entries(tn).filter(([k]) => k !== 'games').map(([k, t]) => [k, { games: t.seats, wins: t.wins, winRate: +(t.wins / t.seats).toFixed(3), placeValue: +(t.pv / t.seats).toFixed(3), arrival: t.arrN ? +(t.arrSum / t.arrN).toFixed(2) : null }])) }])) : undefined;
  const summary = { mode, horizon: wd.H, explore: X, games: GN, table: tab, secs: (Date.now() - t0) / 1000, capped: st.capped, maxback: st.maxback || 0, treestrap: st.treestrap || 0, netDecisions: st.netDec || 0, explored: (st.explore && st.explore.explore) || 0, netWinRate: st.netSeats ? +(st.netWins / st.netSeats).toFixed(3) : null,
    win3p: r3 == null ? null : +r3.toFixed(3), win4p: r4 == null ? null : +r4.toFixed(3), vsFair: rel,
    netRemaining: avg(st.netRem), heurRemaining: avg(st.heurRem), netArrival: avg(st.netArr), heurArrival: avg(st.heurArr), buysNet: st.buysNet, buysHeur: st.buysHeur, transNet: st.transNet, transHeur: st.transHeur, decisions: st.dec, exploration: st.explore, stuck: st.stuck, bench: wd.bench };
  if (out !== '-' && mode === 'self') {
    const nf = rs.find(r => r.nf)?.nf || 0, cat = (k, T) => { const a = new T(rs.reduce((s, r) => s + r[k].length, 0)); let o = 0; for (const r of rs) { a.set(r[k], o); o += r[k].length; } return a; };
    const Y = cat('Y', Float32Array), len = cat('len', Uint32Array), idx = cat('idx', Uint16Array), val = cat('val', Float32Array);
    for (const [k, a] of [['Y', Y], ['len', len], ['idx', idx], ['val', val]]) writeFileSync(`${out}.${k}.bin`, Buffer.from(a.buffer));
    writeFileSync(out + '.json', JSON.stringify({ n: Y.length, nf, nnz: val.length, unsettled: true, ...summary })); // unsettled: has arrived-but-not-settled samples
    summary.samples = Y.length;
  }
  console.log(JSON.stringify(summary));
}
