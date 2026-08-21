# Operator Blocks — Design Notes

A prototype for testing five rule variants on one shared core mechanic. Plain
HTML/JS, no framework, no build step, deploys as a static site.

## Status

Build order (see brief): core+sandbox ✅, Triple Bloom ✅, Order Board ✅,
Logging ✅, Line Level ✅, Pressure Cooker ✅, Blueprint+solver ✅. All
five variants plus sandbox are built.

## Shared core mechanic

- Square grid of tiles, each holding an integer ≥ 0. Board size is a config
  value (`config.boardSize`, default **4**). Tiles start at 0 by default;
  the starting value is tunable live (including a per-tile random option).
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

### Placement legality

A block placement is legal only if **every** covered cell is legal:

- The whole block must fit inside the board.
- `÷2` requires an even value (a fractional tile isn't representable under
  any rule, so this one never relaxes).
- What happens at the **bottom** of the range is a swappable rule — see
  below.
- Any cell failing its check fails the entire placement (no partial apply).

### Below-zero rule (4 options, switchable live)

The original strict rule made both `-1` and `÷2` illegal on an all-zero
board, which meant **26.5% of seeds dealt an unplayable opening hand**
(measured over 20,000 seeds). Rather than pick one fix, the prototype ships
four testable answers, selectable from the in-page Settings panel and
recorded with every logged session:

| id | rule | behavior |
|---|---|---|
| a | `strict` | Below 0 is impossible: `-1` on 0 and `÷2` on 0 are both illegal placements. **Dead hands are re-rolled** so a deal always has at least one legal move. |
| b | `instaLoss` | `-1` on 0 is a legal placement. Making it drives the tile below 0 and immediately ends the run. The UI previews such placements in amber with a dashed outline, so the choice is visible before it's committed. |
| c | `clamp` | `-1` on 0 is legal; the tile simply floors at 0. |
| d | `deadAtZero` | As (c), plus any tile driven from a positive value down to exactly 0 becomes a permanently dead cell — the same fate as exceeding `maxValue` in Pressure Cooker. |

Notes on the interpretation, since the brief left room:

- Under (b), (c) and (d), `÷2` on 0 also becomes legal (`0 ÷ 2 = 0`, a
  harmless no-op). Without this, `÷2` blocks would *still* be dead on an
  empty board and (b)/(c) wouldn't actually fix the opening.
- Under (d), "reaching 0" means arriving at 0 **from a positive value**. A
  tile that was already 0 is untouched — otherwise a fresh all-zero board
  would be entirely dead before the first move. Pair (d) with a non-zero
  starting tile value for it to be interesting.
- (d) applies only to tiles an *operator* touched. A variant zeroing a tile
  itself (a Bloom collapse, a Line Level clear) is not "reaching 0" in this
  sense and never kills.
- Blueprint always runs `strict` with its own authored tile values,
  regardless of the panel. Its levels are designed objects whose pars are
  solver-verified under strict legality; letting the panel change the number
  rules underneath them would silently invalidate every par.

**Dead-hand re-rolling** (active under `strict`, harmless elsewhere): a hand
with no legal placement anywhere is re-drawn, up to 40 attempts. This is
what removes the 26.5% dead-opening rate — verified at 0 dead openings over
800 seeds. It carries one cost worth knowing when comparing seeds: a re-roll
depends on the board, and boards diverge between variants once their rules
start firing, so a seed stops guaranteeing an identical block sequence
across variants from the first re-roll onward. The **opening deal is
unaffected** — every variant starts from the same board, so it re-rolls
identically.

Illegal placements are rejected with a shake animation and never mutate
state. Legality is previewed live: hovering (mouse) or dragging (touch)
colors the target cells green (legal) or red (illegal) before commit —
plus amber with a dashed outline for the `instaLoss` case, where a
placement is legal but would end the run.

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
  getNextHand(rng, config, variantState)               // optional, default = random hand
      -> { hand: Block[], variantState }               //   (scripted variants advance their
                                                       //    own pointer via variantState)
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
| `startValue` | 0 | **tunable** — value every tile starts at, or `'random'` |
| `maxValue` | 12 | **tunable** — top of the range; Pressure Cooker's cap, and the ceiling for random start values |
| `underflowRule` | `'strict'` | **tunable** — one of `strict` / `instaLoss` / `clamp` / `deadAtZero` |
| `operatorWeights` | none .55 / +1 .18 / -1 .18 / ×2 .045 / ÷2 .045 | **tunable** — per-cell operator draw |
| `bloom.minGroupSize` | 3 | tiles needed to collapse |
| `orderBoard.startTarget` | 3 | starting target number |
| `orderBoard.incrementEvery` | 5 | banks per target increment |
| `orderBoard.bankScorePerTarget` | 10 | score per bank = this × current target |
| `lineLevel.lineScoreMultiplier` | 1 | score = value × boardSize × multiplier |

### Live tuning panel

The four **tunable** rows above are editable by the playtester from the
Settings panel in the page — no code edit, no redeploy:

- **Below-zero rule** — the four options above, with inline help text.
- **Starting tile value** — any integer, or a *Random* checkbox that gives
  each tile its own value strictly between 0 and `maxValue` (both ends
  excluded, so no tile starts already at zero or already dead).
- **Max value** — Pressure Cooker's death cap, and the ceiling for random
  start values.
- **Operator weights** — one box per operator (`Blank`, `+1`, `-1`, `×2`,
  `÷2`), shown with their live normalized percentage. They don't have to sum
  to anything; the RNG normalizes. Degenerate tables (all zero, or every
  non-blank at zero) fall back to defaults rather than hanging block
  generation.

Settings persist in `localStorage` and **restart the run on change** — the
values they control are all baked in at deal time, so applying them mid-run
would produce a board matching neither ruleset. Every logged session records
the ruleset it was played under (see Logging), since two runs of the same
seed under different rules aren't comparable.

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
### B. Order Board (endless, high score) ✅

- A target number is shown (`orderBoard.startTarget`, default 3).
- A tile that lands exactly on the target banks: `scoreDelta +=
  bankScorePerTarget * target` (default `bankScorePerTarget` = 10, so
  banking target 3 scores 30), then resets to 0.
- A tile that lands above the target becomes a **stone**: its
  `allowedOps` is restricted to `{minus1, div2}` (plus `none`, which is
  always allowed as it never mutates a value) via the core's generic
  per-cell lock — core enforces this the same way it enforces the numeric
  rules, with no variant-specific logic in `core/legality.js`.
- When a stone's value is brought back to ≤ target via `-1`/`÷2`, it
  unlocks (`allowedOps` cleared). If it lands exactly on target on the way
  down, it banks instead of just unlocking.
- Target increments by 1 every `incrementEvery` banks (default 5).
- Game over: no legal placement exists (this now also accounts for stones,
  since their `allowedOps` restriction flows through the same legality
  check every other cell uses).
### C. Blueprint (level-based) ✅

- No RNG at all. `config/levels.js` defines each level as `{ boardSize,
  startBoard, targetBoard, handSequence, par }` — the target grid is shown
  next to the play grid (dimmed cells are 0/don't-care visually, but note
  the win check is an **exact** match against every cell, not just the
  non-zero ones).
- `handSequence` is an array of hands (3 block specs each); the engine's
  generic `getNextHand` hook (see `core/engine.js`) is overridden so hands
  are pulled from this fixed sequence instead of the RNG, advancing a
  `handIndex` in variant state each time a hand is fully consumed. Within a
  hand, the player may place its 3 blocks in any order — this matters for
  levels like #8, where a `+1` must land before a `×2` on the same cell.
- Level authoring rule (see comment in `levels.js`): since the win check
  runs after every placement, a block that isn't needed for the intended
  solution is only safe in the *last* hand a level needs — once the
  winning placement lands, remaining hand blocks are never forced into
  play. Every block in an earlier, fully-exhausted hand must be part of
  the solution (and non-conflicting), or exhausting that hand would
  overwrite an already-correct target cell before the level can be won.
- Ships 8 hand-authored levels (`config/levels.js`), each with a stated
  `par`. `core/solver.js` brute-forces (depth-limited BFS over every legal
  placement of every hand block) to confirm solvability and find the true
  optimal par; `scripts/solve-levels.mjs` runs it over all 8 from Node
  (`node scripts/solve-levels.mjs`) and all 8 currently solve exactly at
  their authored par. It's also reachable live in a session's browser
  console as `OperatorBlocks.solveLevel()` / `OperatorBlocks.solveAllLevels()`
  once the page has loaded.
- Win: board matches `targetBoard` exactly. Loss: the scripted hand
  sequence runs out (or the current hand has no legal placement) without
  a match.
### D. Line Level (endless, high score) ✅

- A row or column clears when every one of its tiles is equal and
  non-zero (checked after every placement, both axes, no cascade — a
  cleared line resets to all 0, which can't itself complete another line).
- Score: `value * boardSize * lineScoreMultiplier` per cleared line
  (default multiplier 1), so a full row of 6s on a 4×4 board scores 24 —
  far more than a row of 1s.
### E. Pressure Cooker (survival) ✅

- Tiles have a hard cap (`maxValue`, default 12, editable live in the
  Settings panel). A tile pushed above the cap becomes a **dead cell**: `blocked: true` via the core's generic
  flag, so it fails every op (including `none`) forever — the board
  effectively shrinks as dead cells accumulate.
- Score = turns survived (`scoreDelta = 1` per successful placement, so the
  score stat and turn counter track together).
- Shipped as its own standalone selectable variant, matching the brief's
  "score = turns survived" spec exactly. It's also exported as a
  composable `withPressure(baseVariant, cap)` wrapper (see
  `variants/pressure.js`) for layering the cap/dead-cell rule on top of
  another variant's own scoring — not wired into the variant selector in
  v1, but there if a later playtest wants e.g. Bloom-under-pressure.

Each section will be filled in as its variant lands, with the exact rule
and any decisions made along the way.

## Logging ✅

`ui/logging.js` writes one session record per game to
`localStorage['operatorBlocks:sessions']` (an array, appended to — nothing
is ever sent anywhere). A session closes (and is persisted) on game over
*or* on restart/variant-switch, whichever comes first, so switching
variants mid-session doesn't lose the run's data.

Per session:

- `variant`, `seed`, `startedAt`/`endedAt`/`sessionLengthMs`, `finalScore`,
  `turnsSurvived`.
- `ruleset`: the tunables this run was played under — `underflowRule`,
  `startValue`, `maxValue`, `operatorWeights`, `boardSize`, and the Blueprint
  level id if any. Without this the placement data is uninterpretable, since
  the same seed under two different below-zero rules is two different games.
- `placements[]`: one entry per successful placement — `offeredHand` (the
  full 3-block hand, each block's shape and per-cell operator composition,
  captured *before* this placement so you can see what was passed over),
  `chosenBlockId`/`chosenShapeId`/`chosenOps`, `anchor`, `scoreDelta`. This
  is what answers "does the player ever actually want a minus-heavy
  block?" — cross-reference how often a block with `minus1`/`div2` cells
  appears in `offeredHand` vs. how often it's the one in `chosenShapeId`.
- `illegalAttempts[]`: turn, block, its ops, and the attempted anchor — a
  proxy for confusion/frustration per the brief.

The footer's **Export log** button dumps every stored session (not just the
current one) as a single downloaded JSON file. Note: this was built
alongside the core in step 1 (it's small, and having it in place from the
start meant every later variant's playtest was already being captured) —
listed here separately per the requested build order, but the code has
been live since the first commit.

## Hosting

Static site, no build step, deploys straight to GitHub Pages. See
`README.md` for the exact commands and repo settings (Settings → Pages
needs your account, so that part's left for you to click through).
