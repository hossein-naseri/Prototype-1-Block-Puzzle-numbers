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
they're properties of the numbers rather than of any variant:

- **Bottom — always clamps.** A `-1` that would take a tile below 0 is a
  legal placement; the tile simply floors at 0.
- **Top — costs a strike.** A tile pushed above `maxValue` (default **9**)
  gives the player one strike and is reset to exactly `maxValue`. One
  strike per tile, however far over it went. At `maxStrikes` (default
  **5**), the run is lost.

### Placement legality

A placement is legal only if **every** covered cell is legal:

- The whole block must fit inside the board.
- `÷2` requires an even value. (Zero is fine — `0 ÷ 2 = 0`, a harmless
  no-op. Blocking it would leave `÷2` blocks unplayable on an empty board.)
  A fractional tile isn't representable, so this is the one hard
  restriction left.
- A stone-locked cell (Order Board) only accepts its `allowedOps`.
- Any cell failing its check fails the entire placement — no partial apply.

Pushing a tile over the cap is deliberately **legal**: it costs a strike
rather than being rejected. The UI previews such placements in amber with a
dashed outline, so the tradeoff is visible before committing. Illegal
placements shake and never mutate state.

Hands are re-rolled at deal time if they have no legal placement anywhere,
so a deal is always playable.

## Scoring, and the column bars

One vertical bar sits above each column — 3 columns, 3 bars on the default
board.

- When a tile's number is **turned into score**, that tile's value is
  squared and added both to the running score and to the bar above **its
  own column**. A scored 4 is worth 16.
- So a cleared row of 4s sends 16 into each of the three column bars; a
  cleared column of 4s sends 48 into that one bar.
- Bars hold `barCapacity` (default **100**). **When every bar is full, the
  level is won.**

What counts as "scored" is the one thing the core delegates — it's exactly
what distinguishes the two variants.

## Win / lose

| outcome | condition |
|---|---|
| **Win** | every column bar reaches `barCapacity` |
| **Lose** | `maxStrikes` strikes accumulated |
| **Lose** | no legal placement exists for any block in hand |

A placement can both fill the last bar and take the final strike. The
strike is applied during operator resolution, *before* the variant gets a
chance to score anything, so it lands first and the loss takes precedence.

## Variants

Both sit on the identical core; they differ only in when a tile's number
converts to score.

### Line Level
A row or column scores when every tile in it is equal and non-zero. Each
tile in that line scores at its own value, then resets to 0. A tile at the
intersection of two simultaneously-clearing lines scores once, not twice.

### Order Board
A target number is shown, starting at `startTarget` (default 3). A tile
landing exactly on the target scores at its value and resets to 0. A tile
landing *above* the target locks into a **stone** — only `-1` and `÷2` may
touch it — until it comes back down. The target rises by 1 every
`incrementEvery` banks (default 5).

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
             placement resolution, score bars, win/lose
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
      -> { mutations, scoredTiles, events, variantState? }
  isGameOver(board, hand, variantState, config) -> bool            // optional
  getHudState(board, variantState, config) -> {}                   // optional
}
```

`scoredTiles` is `[{ r, c, value }]` — the tiles whose numbers became score
this placement. The engine squares each value, banks it, and routes it to
the right column bar. The variant never touches score or bars directly.

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
| `boardSize` | 3 | grid is `boardSize × boardSize`; one bar per column |
| `barCapacity` | 100 | how much each column bar holds; all full = win |
| `maxValue` | 9 | tile cap — above this costs a strike and resets to it |
| `maxStrikes` | 5 | strikes before the run is lost |
| `startValue` | 0 | value every tile starts at, or `'random'` |
| `blockSizeWeights` | 1: .30 / 2: .45 / 3: .25 | block tile-count spawn rate |
| `operatorWeights` | none .55 / +1 .18 / -1 .18 / ×2 .045 / ÷2 .045 | per-cell operator draw |
| `handSize` | 3 | blocks offered per hand (not exposed in the panel) |
| `orderBoard.startTarget` | 3 | starting target number |
| `orderBoard.incrementEvery` | 5 | banks per target increment |

Weights are **relative, not percentages** — the RNG normalizes them, so
they never have to sum to 100. The panel shows the resulting percentage
next to each box. Degenerate tables (all zero, or every non-blank operator
at zero) fall back to defaults rather than hanging generation.

Settings persist in `localStorage` and **restart the run on change** — the
values they control are baked in at deal time, so applying them mid-run
would produce a board matching neither ruleset.

### Why the block-size default leans small

Most 3-tile shapes span all 3 cells of a 3×3 board, so they have only one
legal anchor. A 3-heavy mix dead-ends constantly: simulating a greedy bot
over 60 seeds, `15/25/60` ended **56/60** runs with an unplaceable last
block, versus **34/60** at the shipped `30/45/25`. On a larger board the
3-tile shapes breathe again and a heavier 3 mix is reasonable.

### Known tuning gap

At `barCapacity: 100` the win is very hard to reach — a greedy bot won
0/60 (Line Level) and 2/60 (Order Board). Lowering capacity moves it
sharply:

| capacity | Line Level | Order Board |
|---|---|---|
| 20 | 10/60 | 17/60 |
| 40 | 4/60 | 11/60 |
| 60 | 2/60 | 5/60 |
| 100 | 0/60 | 2/60 |

100 is kept as the default because it was the specified starting value.
`barCapacity` is a panel field, so this is a one-box change to explore.

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
