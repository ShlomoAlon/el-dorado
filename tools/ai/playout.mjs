// One seeded game for the tools. newGame deals with the game's own shuffles (mulberry32 of the seed: the same seed plays
// the same deals and shuffles), then choose(me) picks the action of the player to move until the game is over, stop()
// says so, or the round cap ends it (endGame: places as they stand). The choices must be legal (asserted). after(me):
// called after each action (to sample positions).
// Returns {capped}: the cap ended the game.
import * as E from '../../src/engine.gen.js';
export function playout({ seed, players, choose, course = E.COURSES[0], cap = 25, stop, after }) {
  const gen = E.mulberry32(seed * 7 + 1);
  E.newGame({ course, seed, fullRace: true, players }, gen);
  while (!E.S.over && !(stop && stop())) {
    if (E.S.round > cap) { E.endGame(); return { capped: true }; }
    const me = E.S.cur, a = choose(me), r = E.applyAction(me, a, gen);
    E.assert(r.ok, `playout: ${a.t} is legal (${r.err})`);
    if (after) after(me);
  }
  return { capped: false };
}
// players named P0, P1, … (the tools don't show them); ai: a named AI per seat (optional)
export const seatPlayers = (n, ai) => [...Array(n)].map((_, i) => ({ name: 'P' + i, color: E.COLORS[i].hex, ...(ai ? { ai: ai[i] } : {}) }));
