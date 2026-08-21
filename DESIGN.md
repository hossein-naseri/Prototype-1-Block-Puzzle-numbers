# Operator Blocks — Design Notes

A prototype for testing five rule variants on one shared core mechanic. Plain
HTML/JS, no framework, no build step, deploys as a static site.

## Status

Build order (see brief): core+sandbox ✅, Triple Bloom ✅, Order Board ⏳,
Logging ⏳, Line Level ⏳, Pressure Cooker ⏳, Blueprint+solver ⏳.

## Shared core mechanic

- Square grid of tiles, each holding an integer ≥ 0, starting at 0.
  Board size is a config value (`config.boardSize`, default **4**).
- Each turn the player is offered a hand of 3 blocks (`config.handSize`).
  A block is one of the shapes in `core/shapes.js` — 6 orthogonally-connected
  trominoes (I horizontal/vertical, 4 L rotations), 2 diagonal-connected
  shapes, and 2 disconnected "scatter" shapes. No rotation in v1: every
  orientation the player should see is listed explicitly as its own shape.
- Every block cell carries an operator drawn from `config.operatorWeights`:
  `none` (most common), `+1`, `-1`, `×2`, `÷2` (rare). A block is re-rolled
  until at least one cell is a non-`none` operator.
- Placing a block dissolves it immediately and applies its operators to the
  covered tiles. Nothing persists on the board except the numbers (plus a
  couple of generic per-cell flags described below, which variants use).
- Hand behavior: the 3 hand slots are consumed one at a time as blocks are
  placed (used slots simply disappear from the hand — like Block
  Blast/Woodoku). Once all 3 are used, the pre-generated **next hand**
  becomes the hand, and a new next hand is generated. The next hand is
  always shown as a preview so the player can plan the whole 3-block cycle,
  not just the immediate pick.

### Placement legality (strict)

A block placement is legal only if **every** covered cell is legal:

- The whole block must fit inside the board.
- `-1` cannot take a tile below 0.
- `÷2` requires an even, non-zero value.
- Any cell failing its check fails the entire placement (no partial apply).

Illegal placements are rejected with a shake animation and never mutate
state. Legality is previewed live: hovering (mouse) or dragging (touch)
colors the target cells green (legal) or red (illegal) before commit.

### Generic per-cell flags (core, variant-agnostic)

The core board format is `{ value, blocked, allowedOps }` per cell. Core
itself never sets `blocked` or `allowedOps` — only variants do, via the
mutations they return from `onPlacementResolved`. This keeps variant rules
(stones, dead cells, …) out of the core while still letting core enforce
them uniformly:

- `blocked: true` — permanently unusable (e.g. Pressure Cooker's dead
  cells). Fails every op, including `none`.
- `allowedOps: Set([...])` — only those ops (plus `none`, which never
  mutates a value) may be applied here (e.g. Order Board's stones).

## Seeded RNG

`core/rng.js` implements a mulberry32 PRNG. `?variant=bloom&seed=4471` in the
URL fully determines the block sequence for that session, independent of
which variant is loaded — so two playtesters (or one playtester across two
variants) can compare the exact same blocks. The seed is shown in the UI
with a copy button; a non-numeric seed string is hashed to a numeric seed.

## Architecture

```
/core        board state, block generation, legality checks, placement resolution, engine orchestration
/variants    one module per variant, implementing a shared interface
/config      per-variant tuning values
/ui          renderer (DOM), input handling, variant selector, HUD, logging
```

Core never imports a variant. The variant interface (see `core/engine.js`):

```js
{
  name: 'variantName',
  init(config, rng) -> { board?, variantState }        // optional
  getNextHand(rng, config, variantState) -> Block[3]   // optional, default = random hand
  onPlacementResolved(board, placement, variantState, config)
      -> { mutations, scoreDelta, events, variantState? }
  isGameOver(board, hand, variantState, config) -> bool
  getHudState(board, variantState, config) -> {}
  checkWin(board, variantState, config) -> bool          // optional (Blueprint)
}
```

`board` passed into `onPlacementResolved` already has the core placement's
operators applied; the variant only returns *additional* mutations (collapses,
banking, locking, …) as `[{ r, c, patch }]`. Everything is a pure function
over plain objects — no rules logic lives in the renderer, and the engine is
portable to Unity/Godot later without touching `core/` semantics.

## Config values (starting points, not constants)

See `config/config.js` for the authoritative source.

| key | default | meaning |
|---|---|---|
| `boardSize` | 4 | grid is `boardSize × boardSize` |
| `handSize` | 3 | blocks offered per hand |
| `operatorWeights` | none .55 / +1 .18 / -1 .18 / ×2 .045 / ÷2 .045 | per-cell operator draw |
| `bloom.minGroupSize` | 3 | tiles needed to collapse |
| `orderBoard.startTarget` | 3 | starting target number |
| `orderBoard.incrementEvery` | 5 | banks per target increment |
| `lineLevel.lineScoreMultiplier` | 1 | score = value × boardSize × multiplier |
| `pressure.cap` | 12 | value above which a tile dies |

## Variants

### A. Triple Bloom (endless, high score) ✅

- After a placement resolves, any orthogonally-connected group of
  `minGroupSize` (default 3) or more same-value, non-zero tiles collapses:
  one tile (the "winner") becomes `value + 1`, the rest reset to 0.
- Winner selection: prefer a tile the player's placement (or the previous
  cascade pass) actually just modified. If several qualify, the top-left
  one wins (ties are rare — usually only when the block covered two cells
  of the same eventual group). Not specified in the brief; documenting the
  tie-break here rather than blocking on it.
- Collapses cascade: after resolving a pass, the board is rescanned for new
  groups (a cascade can chain when winners' new values match a neighbor).
  Each pass increments a chain multiplier (1, 2, 3, …) applied to that
  pass's score.
- Score per bloom: `config.baseScorePerTier(value, groupSize)` — default
  `value^2 * groupSize` — times the chain multiplier for that pass.
- Game over: no legal placement exists for any block in hand. This can
  happen early if the hand is dominated by `÷2`/`-1` cells and the board
  doesn't yet have matching (even/non-zero) values anywhere — working as
  specified, and exactly the kind of signal the brief is testing for.
### B. Order Board (endless, high score) — not yet built
### C. Blueprint (level-based) — not yet built
### D. Line Level (endless, high score) — not yet built
### E. Pressure Cooker (survival) — not yet built

Each section will be filled in as its variant lands, with the exact rule
and any decisions made along the way.

## Logging

Not yet built (step 4 of the build order). Will log to `localStorage` per
session: variant, seed, final score, turns survived, session length, every
placement (offered hand composition + chosen block + position), and illegal
placement attempts. Exportable as JSON via a button in the footer.

## Hosting

Static site, no build step. See `README.md` for exact GitHub Pages setup
commands.
