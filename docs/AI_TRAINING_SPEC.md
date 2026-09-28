# Value-network training for *The Quest for El Dorado* — specification

This document states what the training procedure does. It gives no reasons for any choice.
State as of 2026-09-28 (run "reuse").

## 1. The game (as implemented)

- Board game by Reiner Knizia, base game. 3 or 4 players (2-player games are not used in training).
- Race: in 3- and 4-player games each player moves one explorer across a hex map to El Dorado. The first to arrive wins;
  the round is finished after a player
  arrives, so later players in turn order can still arrive in the same round. Ties are broken by number of blockades
  taken, then the highest-numbered blockade.
- Deck building: everyone starts with the same 8 cards. On a turn a player draws to 4 cards, plays cards to move
  (green = jungle, blue = water, yellow = villages/coins, jokers), may buy one card from a market of 6 stacks (a reserve of
  further stacks opens once a market stack is empty), may use action cards (draw cards, remove cards from the game), and
  at the end of the turn may keep up to 3 unplayed cards (the rest are discarded) and draws a new hand.
- 21 card types. Some cards are single-use (removed from the game after their effect is used).
- Hex spaces cost cards of a matching symbol and strength; rubble spaces cost discarding cards; base camps cost removing
  cards from the game; blockades between map tiles cost cards and are taken (they count for tie-breaks).
- Four maps ("courses") are used: first (easy), hills (easy), winding (medium), witch (hard). They are assembled from the
  same tile set in different layouts. Random elements per game: deck shuffles, blockade assignment.
- Hidden information: every player's deck order and the other players' hands. Everything else is public (including all
  cards each player owns and every discard pile).

## 2. Network

- Value network: input vector x (3,878 values) → fully connected 256 → fully connected 128 → 1 → sigmoid.
- Hidden activation: leaky ReLU, negative slope 0.03.
- During training, batch normalisation is applied to each hidden layer's pre-activations (after the linear layer, before the
  activation). At export it is folded into the linear layers' weights and biases; the network used for play has no
  normalisation layers.
- Output: a number in (0, 1): the estimated result value (§5) for the player whose point of view the input encodes.
- Approximately 1.03 million parameters.
- One network is shared by all four maps.

## 3. Input encoding (3,878 values, from one player's point of view)

Only what that player can see. No history beyond current public state.

1. **Map summary along the distance axis (144):** the map is binned into 16 bands of 3 steps each by shortest-path distance
   to El Dorado. Per band: number of spaces, share of each terrain type (5), mean space strength, number of occupied
   spaces, total strength of untaken blockades in the band. The terrain part is constant per map.
2. **Me (14):** mean route cost to El Dorado (in card strength), mean steps to El Dorado, minimum steps, whether finished,
   number of blockades taken, terrain mix along my cheapest routes (5), whether it is my turn, seat position relative to the
   start player, whether I bought this turn, whether it is a 2-player game.
3. **My cards (84 = 4 × 21):** count of each card type in my hand (only on my turn or in the end-of-turn view), in my draw
   pile, in my discard pile, in play this turn. Counts are divided by 3 or 4.
4. **This turn (12, zero when it is not my turn):** leftover movement of the card being played and its symbol, pending card
   removal, coins in hand, hand size, number of action cards in hand, best and total reduction of my route cost achievable
   with single cards in hand, that total relative to my route cost, a constant 1.
5. **Each of up to 3 opponents in turn order after me (3 × 50):** count of each card type they own (21), count in their
   discard pile (21), their route cost, their steps, finished, resigned, blockades taken, hand size, whether it is their turn,
   their route cost minus mine.
6. **Market and reserve (44):** cards left of each type in the market (21) and in the reserve (21), whether the reserve is
   open, number of non-empty market stacks.
7. **Blockades #1–6 (54):** per blockade: on the board / taken by me / taken by someone else, cost, position, type.
8. **Game clock (4).**
9. **Rule switches (4):** reserved for rule variants; all zero in training.
10. **Map indicator (4):** one-hot over the four maps.
11. **Raw board, one block per map (3,364 total; only the current map's block is non-zero):** per space, 4 values for which
    player (relative seat) stands there; per tile connection, 8 values for the state of its blockade.

A typical position has about 180 non-zero inputs.

## 4. How a network player chooses an action

- A turn consists of several single actions (play a card to move, pay rubble, buy, play an action card, remove cards,
  end the turn keeping 0–3 cards). The player chooses one action at a time.
- For every legal action: copy the state, reshuffle the acting player's own draw pile, apply the action, and evaluate the
  resulting position with the network from the acting player's point of view. For actions that draw cards, the value is
  the mean over 4 independent reshuffles. For "end turn", the position is evaluated after discarding and before the new
  hand is drawn. If the acting player has arrived and the place is final, the exact result value (§5) is used instead
  of the network; if arrived but not final, the network is used.
- No search beyond this one-action look-ahead. Opponents' future moves are not simulated.
- In tests: the action with the highest value is chosen.
- In self-play, network players explore (X = exploration level, §7):
  - with probability 0.03·X: a uniformly random legal action;
  - else with probability 0.05·X: a random action type (buy, move, remove, keep, pay, draw, …), then a random action of
    that type;
  - otherwise: sampling with probability ∝ exp((v − v_best) / τ), τ = max(0.004, 0.02·X) (v on the 0–1 value scale);
  - per turn, with probability 0.10·X, buying is disallowed for that turn;
  - per game, with probability 0.5·X, every player starts with the same one extra card, chosen with weight
    1 / (1 + number of times the network bought that card type in this run's most recent self-play batch).

## 5. Result value (training target at game end)

- Place value: 1st = 1, 2nd = 1/4, 3rd = 1/8, last = 0 (3 players: 1, 1/4, 0).
- Games are stopped after round H = 20. Players still racing are ranked behind arrived players by remaining route cost
  to El Dorado.
- Result = 0.8 × place value + 0.2 × sigmoid(lead / 5), where lead = (mean remaining route cost of the other players) −
  (my remaining route cost).
- In tests, a game stopped at the cap with nobody arrived is won by the player with the lowest remaining route cost.

## 6. Training data (self-play)

- One iteration generates 600 games on 4 CPU cores. Each game: 3 or 4 players (50/50), map chosen uniformly from the four.
- Each seat is independently a heuristic player with probability 0.25, otherwise the network (at least one network seat
  per game). The heuristic player is a hand-written evaluation function with a whole-turn planner (beam search over
  action sequences within the turn); it does not explore.
- Samples: after every action of a network seat, the position from that seat's point of view becomes a sample (for
  "end turn": after discarding, before drawing). Heuristic seats produce no samples. No samples are taken once that
  player's place is final. Each sample records which game it came from.
- Targets, computed at generation time with the network that generated the games, going backwards through each player's
  own sequence of samples:
  - last sample: the result value (§5);
  - if the next sample of the same player is in the same turn (no "end turn" between), the target is the value of the
    action at that next decision that the generating network rates highest, where that value is computed (one-step
    look-ahead as in §4) by the network from before the previous training step (from the second iteration on; in the
    first iteration by the generating network itself), whatever action was actually taken there;
  - otherwise: G_t = (1 − λ)·V(s_{t+1}) + λ·Y_{t+1} with λ = 0.7, where V is the generating network's value of the player's
    next sample and Y_{t+1} is the target assigned to that next sample (which may itself be a within-turn target above).
- About 70,000–220,000 samples per iteration depending on the cap.

## 7. Training loop

- Start: a network previously trained (about 100 iterations over several earlier runs) under a rules implementation in
  which some single-use cards were not removed after use; that network had a negative slope of 0.01 and no batch
  normalisation.
- Round cap H = 20 throughout (no curriculum). Exploration level X = 0.3.
- Each iteration:
  1. 600 self-play games at cap H (§6).
  2. Train on the samples of the 3 most recent iterations.
  3. Test: 168 games against heuristic players, same cap. Deals are fixed (the same 24 three-player and 24 four-player
     deals every iteration, maps in turn); each deal is played once with the network (greedy, no exploration) in each
     seat and heuristic players in the others. Reported: score = network wins / (expected wins if every seat were
     equal), 1.0 = fair share; and mean place value of the network's seats and of the heuristic's seats.
- Training step (each iteration):
  - Warm start from the current network. Batch-norm layers are initialised each iteration so that they compute the
    identity on the current data (scale = standard deviation, shift = mean of each unit's pre-activation over 8,000
    training samples).
  - The samples of 5% of the games are held out for validation; 3 epochs over the rest; mini-batches of 512.
  - Loss: binary cross-entropy between the sigmoid output and the target (targets are in [0, 1]).
  - Optimiser: AdamW (fresh state every iteration), peak learning rate 1e-3, linear warm-up over the first 300 steps then
    constant; weight decay 0.01 on linear-layer weights only; gradient-norm clipping at 1.0.
  - After training, batch norm is folded into the weights and the network is saved; it generates the next iteration's
    games.
- Monitoring after each training step (on a fixed set of 4,000 positions from full games on all four maps): hidden units
  that are never positive; warning above 10% of a layer; the run stops above 30%. Also warnings for >5% of outputs below
  0.01 or above 0.99, a mean prediction off the mean target by more than 0.05, validation error above 0.9 × that of
  predicting the mean, any weight above 10 in magnitude; a stop for non-finite weights.

## 8. Current numbers (for scale)

- Iteration time at cap 15: about 3.7 minutes (self-play 2–2.5 min, training 40 s, test 30 s).
- Test score against the heuristic at cap 15 after the first iteration: 0.06.
- Earlier runs of the same pipeline (under the old rules) reached about 1.0 against the heuristic in full games; the
  mean arrival round of the network playing itself was 14–16.5 depending on the map.
