// One seeded game for the tools. newGame deals with the game's own shuffles (mulberry32 of the seed: the same seed plays
// the same deals and shuffles), then choose(gs, me) picks the action of the player to move until the game is over,
// stop(gs) says so, or the round cap ends it (endGame: places as they stand). The choices must be legal (asserted).
// after(gs, me): called after each action (to sample positions).
// Returns {gs, capped}: the game, and whether the cap ended it.
import * as E from '../../src/engine.gen.js';
export function playout({ seed, players, choose, course = E.COURSES[0], cap = 25, stop, after }) {
  const gen = E.mulberry32(seed * 7 + 1), gs = E.newGame({ course, seed, fullRace: true, players }, gen);
  while (!gs.over && !(stop && stop(gs))) {
    if (gs.round > cap) { E.endGame(gs); return { gs, capped: true }; }
    const me = gs.cur, a = choose(gs, me), r = E.applyAction(gs, me, a, gen);
    E.assert(r.ok, `playout: ${a.t} is legal (${r.err})`);
    if (after) after(gs, me);
  }
  return { gs, capped: false };
}
// players named P0, P1, … (the tools don't show them); ai: a named AI per seat (optional)
export const seatPlayers = (n, ai) => [...Array(n)].map((_, i) => ({ name: 'P' + i, color: E.COLORS[i].hex, ...(ai ? { ai: ai[i] } : {}) }));
