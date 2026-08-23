# Operator Blocks — Design Notes

A prototype for testing rule variants on one shared core mechanic. Plain
HTML/JS, no framework, no build step, deploys as a static site.

## Shared core mechanic

- Square grid of tiles, each holding an integer ≥ 0. Board size is tunable
  (`boardSize`, default **3**), giving a 3×3 grid.
- Each turn the player is offered a hand of 3 blocks. A block is 1, 2, or 3
  tiles; which, is drawn from `blockSizeWeights`. Shapes live in
  `core/shapes.js`, grouped by tile count. No rotation: every orientation
  the player should see is listed explicitly as its own shape.
- Every block cell carries an operator drawn from `operatorWeights`: `none`
  (most common), `+1`, `-1`, `×2`, `÷2` (rare). A block is re-rolled until
  at least one cell carries a real operator.
- Placing a block dissolves it immediately and applies its operators to the
  covered tiles. Nothing persists on the board except the numbers.
- Hand behavior: the 3 slots are consumed one at a time. Once all 3 are
  used, the pre-generated **next hand** becomes the hand and a new next hand
  is generated. The next hand is always previewed, so the player can plan
  the whole 3-block cycle.

### Number rules

Both ends of the range are enforced in core (`core/resolve.js`), because
they're properties of the numbers rather than of any variant. There are two
modes, picked by the variant via `config.signedValues`:

**Unsigned** (Line Level, Order Board):

- **Bottom — clamps.** A `-1` that would take a tile below 0 is a legal
  placement; the tile simply floors at 0.
- **Top — costs a strike.** A tile pushed above `maxValue` (default **9**)
  gives the player one strike and is reset to exactly `maxValue`. One strike
  per tile, however far over it went. At `maxStrikes` (default **5**), the
  run is lost.

**Signed** (Fight Mode):

- A tile may go negative — a negative tile is a **red** tile, drawn as its
  magnitude with no minus sign. Only the magnitude is capped, at `maxValue`
  in either direction, and no strikes are charged; Fight has its own
  win/lose condition.

### Placement legality

A placement is legal only if **every** covered cell is legal:

- The whole block must fit inside the board.
- `÷2` halves anything, rounding the **magnitude** down: `5 ÷ 2 = 2`, and a
  red 5 becomes a red 2. Truncating toward zero rather than flooring keeps
  ÷2 a weakening move for both colours — flooring would push a red tile
  further from zero, which reads backwards.
- A stone-locked cell (Order Board) only accepts its `allowedOps`.
- Any cell failing its check fails the entire placement — no partial apply.

No value makes an operator illegal any more. Since `÷2` handles odd numbers,
the only thing that can reject a placement is geometry (out of bounds), a
blocked cell, or an Order Board stone. This also retired the `÷2` dead end
that used to end most Line Level runs.

Pushing a tile over the cap is deliberately **legal**: it costs a strike
rather than being rejected. The UI previews such placements in amber with a
dashed outline, so the tradeoff is visible before committing. Illegal
placements shake and never mutate state.

Hands are re-rolled at deal time if they have no legal placement anywhere,
so a deal is always playable.

## Line quotas

Every row shows a number to its **left**, every column shows one **below**
it. That's the value a match on that line has to reach: **equal or higher**.
Quotas are rolled at setup, one per line, from the seed.

- Quotas are random in `1..maxValue`. Bounding by the tile cap rather than a
  hard 9 keeps them achievable if the cap is lowered — a quota above the cap
  would make the level unwinnable by construction.
- When a qualifying match lands on a line, that line's chip flips to a green
  checkmark. **Checks are permanent** — a later, weaker match can't undo one.
- **When every row and column quota is checked, the level is won.**

Tiles also still score: a scored tile is worth its value squared, feeding
the score readout. That's a stat now, not a win condition.

What counts as a match *on a line* is the one thing the core delegates — see
the variants below.

## Win / lose

| outcome | condition |
|---|---|
| **Win** | every row and column quota is checked |
| **Lose** | `maxStrikes` strikes accumulated |
| **Lose** | no legal placement exists for any block in hand |

A placement can both check the last quota and take the final strike. The
strike is applied during operator resolution, *before* the variant gets a
chance to score anything, so it lands first and the loss takes precedence.

## Variants

Line Level and Order Board sit on the quota system and differ only in what
counts as a match on a line. Fight Mode opts out of quotas entirely
(`usesLineQuotas: false`) and brings its own win condition.

### Line Level
A row or column matches when every tile in it is equal and non-zero. The
match is attributed to **that line only** — matching a row ticks the row's
quota, not the quotas of the three columns it crosses.

**Matched tiles keep their values.** Nothing is reset to 0, so a match is
purely additive: the board is sculpted upward rather than repeatedly
emptied. That has two consequences worth knowing:

- A matched line *stays* matched until the player disturbs it, so a line is
  reported only when it **becomes** matched — or re-matches at a different
  value, which is how you upgrade a line to clear a higher quota. Without
  that transition check a standing match would re-score on every placement
  for the rest of the run.
- Filling the whole board with one value ≥ every quota now satisfies all
  rows and columns at once, which is a real and reachable win line.

Because tiles are no longer consumed, a tile sitting where two lines match
simultaneously scores for both — each line match is its own event.

### Fight Mode
A two-sided territory fight. Tile values are **signed**: positive is
**green** (the player), negative is **red** (the opponent), 0 is neutral. A
red tile is drawn as its magnitude in red with no minus sign, so "red 2" is
the value `-2`. Everything is ordinary signed arithmetic, which makes the
operators read naturally from either side — `+1` pushes a tile toward green,
`-1` toward red, `×2` doubles whoever holds it, `÷2` halves them.

**The turn.** Unlike the other modes, a turn here is all three blocks, not
one placement:

1. At the start of a turn, `threatsPerTurn` (default **3**) tiles are picked
   at random and marked with 1–`threatMaxStacks` (default **2**) red
   triangles in their top-left corner — a visible warning of what's coming.
2. The player places all three blocks.
3. At the end of the turn each marked tile takes that many points of red
   pressure (`-1` per triangle). A 0 becomes a red 1; a red 1 becomes a red
   2; a green 3 drops to a green 2.
4. The board re-resolves, next turn's threats are rolled, and a fresh hand
   is dealt.

The engine calls this end-of-turn phase through an `onTurnEnd` hook, which
fires when the last block of a hand is placed and before the next hand is
dealt — so the new hand is judged against the resolved board.

**Conversion.** One-directional: **green takes red tiles, red never takes
green ones.** A red tile flips when

```
(its own strength + its red neighbours' strength) < (its green neighbours' strength)
```

counting only the 4 orthogonal neighbours, and requiring **at least 2** of
them to be green. Ties do nothing — red has to be strictly out-muscled. The
flipped tile keeps its magnitude and only changes sign; the surrounding
tiles are untouched.

Worked example: a red 3 with a red 1 to the north and a red 2 to the east
(red total 3 + 1 + 2 = 6), and a green 4 to the west and a green 3 to the
south (green total 7). Two green neighbours, and 6 < 7, so it becomes a
green 3.

Because a corner tile has exactly two orthogonal neighbours (one horizontal,
one vertical), the "at least 2 green" requirement still lets corners be
taken.

**Conversions cascade.** A flip changes the sums for its neighbours, so the
board is re-scanned until nothing more converts. This terminates by
construction: every flip turns a red tile green and nothing ever turns a
green tile red, so each pass strictly reduces the red count.

Two details not spelled out, resolved this way:

- **Neutral 0 tiles neither convert nor count.** They have no colour, so
  they can't be a target and add nothing to either side's strength.
- **Conversion happens only in the end-of-turn phase**, after the threats
  land — matching the brief's "at the end of the turn the red tile becomes
  a green tile". Placements during the turn only move numbers.

**Win / lose.** Whichever side holds more than `controlThreshold` (default
**70%**) of the tiles ends the run — green wins, red loses. On a 3×3 that's
`floor(9 × 0.7) + 1 = 7` tiles. A dead end isn't reachable in this mode,
since every placement is legal.

### Order Board
A target number is shown, starting at `startTarget` (default 3). A tile
landing exactly on the target scores at its value and **keeps that value**
— only the stone lock is released. A bank fires off the cells a placement
changed, so it can only happen on the move that lands the tile on the
target; a tile left sitting there doesn't re-bank. A tile landing *above*
the target locks into a **stone** — only `-1` and `÷2` may
touch it — until it comes back down. The target rises by 1 every
`incrementEvery` banks (default 5).

Order Board scores single tiles rather than lines, so a bank counts as a
match on **both** the row and the column that tile sat on. Without that it
could never satisfy a line quota at all.

## Seeded RNG

`core/rng.js` implements a mulberry32 PRNG. `?variant=lineLevel&seed=4471`
in the URL determines the block sequence, so two playtesters can compare the
exact same blocks. The seed is shown in the UI with a copy button; a
non-numeric seed string is hashed to a number.

One caveat: a hand with no legal placement is re-rolled, and that depends on
the board, which diverges between variants. So a seed guarantees an
identical sequence across variants only up to the first re-roll. The opening
deal is unaffected — every variant starts from the same board.

## Architecture

```
/core        board state, block generation, number rules, legality,
             placement resolution, line quotas, win/lose
/variants    one module per variant — decides only what counts as scoring
/config      tuning values
/ui          renderer (DOM), input, settings panel, HUD, logging
```

Core never imports a variant. The variant interface (see `core/engine.js`):

```js
{
  name: 'variantName',
  init(config, rng) -> { board?, variantState }                    // optional
  getNextHand(rng, config, variantState) -> { hand, variantState } // optional
  onPlacementResolved(board, placement, variantState, config)
      -> { mutations, scoredTiles, scoredLines, events, variantState? }
  isGameOver(board, hand, variantState, config) -> bool            // optional
  getHudState(board, variantState, config) -> {}                   // optional
}
```

`scoredTiles` is `[{ r, c, value }]` — tiles whose numbers became score.
`scoredLines` is `[{ kind: 'row'|'col', index, value }]` — scoring events
attributed to a whole line. The engine squares tile values into the score
and ticks a line's quota when a `scoredLines` entry reaches it. Variants
never touch score, quotas, or the win check directly.

`board` passed into `onPlacementResolved` already has the placement's
operators applied (and the strike cap enforced); the variant returns only
*additional* mutations as `[{ r, c, patch }]`. Everything is a pure function
over plain objects — no rules logic in the renderer, and the core is
portable to Unity/Godot without touching its semantics.

## Config values (starting points, not constants)

`config/config.js` is authoritative. Everything marked **tunable** is
editable live from the in-page Settings panel.

| key | default | meaning |
|---|---|---|
| `boardSize` | 3 | grid is `boardSize × boardSize`; one quota per row and column |
| `maxValue` | 9 | tile cap — above this costs a strike and resets to it; also the quota ceiling |
| `maxStrikes` | 5 | strikes before the run is lost |
| `startValue` | 0 | value every tile starts at, or `'random'` |
| `blockSizeWeights` | 1: .10 / 2: .25 / 3: .65 | block tile-count spawn rate |
| `operatorWeights` | none .50 / +1 .31 / -1 .11 / ×2 .045 / ÷2 .035 | per-cell operator draw |
| `handSize` | 3 | blocks offered per hand (not exposed in the panel) |
| `orderBoard.startTarget` | 3 | starting target number |
| `orderBoard.incrementEvery` | 5 | banks per target increment |
| `fight.signedValues` | true | negative tiles allowed (red); no clamp at 0, no strikes |
| `fight.threatsPerTurn` | 3 | tiles marked with red triangles each turn |
| `fight.threatMaxStacks` | 2 | most triangles any one tile can carry |
| `fight.controlThreshold` | 0.7 | share of the board that ends the run |

Weights are **relative, not percentages** — the RNG normalizes them, so
they never have to sum to 100. The panel shows the resulting percentage
next to each box. Degenerate tables (all zero, or every non-blank operator
at zero) fall back to defaults rather than hanging generation.

Settings persist in `localStorage` and **restart the run on change** — the
values they control are baked in at deal time, so applying them mid-run
would produce a board matching neither ruleset.

### Fight Mode balance

Fight Mode used to be hopeless for green — a control-maximising bot won
**1/60** at the original numbers, because red applied 3–6 points of pressure
per turn while green's hand carried barely any `+1` cells.

Three changes fixed it together: the higher `+1` weight (.18 → .31),
green-only conversion, and cascading. Same bot, same 60 seeds, at the
current defaults:

**24 wins / 30 losses / 6 stalemates**, averaging 4.0 green vs 4.6 red
tiles over ~29 rounds. Close to a coin flip, and games now run long enough
to have a shape.

The threat knobs remain the difficulty dial, and they're much less brutal
than before:

| threats/turn | max triangles | green wins |
|---|---|---|
| 1 | 1 | 60/60 |
| 2 | 1 | 60/60 |
| 2 | 2 | 59/60 |
| 3 | 1 | 59/60 |
| 3 | 2 (default) | 24/60 |

Note how sharp the cliff is: anything below the default is a walkover for
green. The default is where the tension lives. The 6 stalemates are runs
that hit the simulation's 400-placement cap without either side reaching
70% — worth watching for in real play.

### Known problem: the ÷2 dead end

Keeping matched values fixed the structural issue that used to make Line
Level unwinnable (clears wiping the progress crossing lines needed). Order
Board went from 0/60 wins to **10/60** with a quota-seeking bot over 60
seeds. But Line Level is still 0/60, and the cause is now something else
entirely:

**53 of 60 Line Level runs ended with no legal move — and in 100% of those,
every remaining block in hand carried a `÷2` with no even tile to land it
on.** Not the quota design; the `÷2`-needs-an-even-value rule.

**This is now fixed.** `÷2` halves odd values (rounding the magnitude
down), so it is legal on any tile and the dead end can't occur — that was
option 3 of the three listed below, adopted as part of the Fight Mode work
because Fight needed `÷2` to work on arbitrary values anyway. The rest of
this section is kept as the record of what the problem was.

It got worse with this change, and predictably so: values used to be reset
to 0 (even) on every match, which constantly replenished legal `÷2` targets.
Now odd values accumulate and never leave. Typical stuck state:

```
board  0 9 2 / 5 9 6 / 3 3 3      hand  DIAG_DOWN  ÷2 / ÷2 / -1
```

Note these all occur on the **last block of a hand**. The existing re-roll
guarantee only checks a full 3-block deal, so it can't help once two blocks
are spent.

Three levers, none applied since each is a rules decision:

1. **Drop the `÷2` weight** (currently 4.5%). Cheapest, and a settings-panel
   change — but with 3 blocks × up to 3 cells it still surfaces often.
2. **Extend the re-roll guarantee to the remaining hand**, not just the full
   deal. Uses machinery that already exists, but effectively retires "no
   legal placement" as a loss condition.
3. **Let `÷2` round down on odd values.** Removes the dead end at the root,
   at the cost of the one hard placement restriction left in the game.

## Logging

`ui/logging.js` writes one session record per game to
`localStorage['operatorBlocks:sessions']` — nothing is sent anywhere. A
session closes on game over *or* on restart/settings change, so switching
mid-run doesn't lose the data.

Per session:

- `variant`, `seed`, timings, `finalScore`, `turnsSurvived`.
- `ruleset`: every tunable this run used. Without it the data is
  uninterpretable — the same seed under two settings is two different games.
- `placements[]`: per successful placement — `offeredHand` (all 3 blocks,
  their shapes and per-cell operators, captured *before* the placement so
  you can see what was passed over), the chosen block, `anchor`, and
  `scoreDelta`. This answers "does the player ever want a minus-heavy
  block?" — compare how often `-1`-carrying blocks appear in `offeredHand`
  against how often they're the one chosen.
- `illegalAttempts[]`: turn, block, ops, attempted anchor — a proxy for
  confusion.

**Export log** in the footer downloads every stored session as one JSON file.

## Hosting

Static site, no build step, deploys straight to GitHub Pages. See
`README.md` for the commands and repo settings.
