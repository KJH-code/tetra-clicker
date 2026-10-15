# Tetra Clicker

Tetris × idle clicker. Clear lines by hand to earn **Lines**, spend Lines on
buildings, and each building is a bot that plays its own board and clears
lines for you. MVP: one building (SINGLE), one bot, one loop.

Play: https://kjh-code.github.io/tetra-clicker/

## Run

```
npm install
npm run dev        # http://localhost:5173
npm test           # vitest
npm run build      # typecheck + static build in dist/
```

Node 22. The build sets `base` to `/tetra-clicker/` for GitHub Pages; dev
serves from `/`.

## Controls

Guideline defaults: ← → move, ↓ soft drop, Space hard drop, ↑ / X rotate CW,
Z / Ctrl rotate CCW, A 180, Shift / C hold. DAS / ARR / SDF and every key can
be changed under SETTINGS. There is no gravity on the manual board: a piece
waits until you drop it. Reaching the ceiling only wipes the board.

## Attack table

Lines earned per placement (the project's own table, not TETR.IO's):

| clear | single | double | triple | tetris | TSS | TSD | TST | PC |
|---|---|---|---|---|---|---|---|---|
| Lines | 1 | 2.5 | 4.5 | 7 | 2 | 4 | 6 | 10 |

Combo multiplies by `1 + 0.1 × [0,1,1,2,2,3,3,4,4,4,5…]` (index = clears
before this one in the run). Back-to-back adds 20%. Minis and non-T spins pay
as plain clears. A perfect clear replaces the base with 10 before combo and
B2B. Bots earn none of the bonuses.

## Layout

```
src/
  sim/        pure logic, runs in Node (boards, SRS, 7-bag, spins, attack,
              effects, economy, bot, clock, world)
  data/       numbers and definitions: attack table, buildings, handling
  save/       SaveStore interface, localStorage store, schema + migrations, autosave
  render/     Canvas 2D boards, effects, bot replay animation
  ui/         DOM shop, settings panel, keyboard handling (DAS/ARR/SDF)
  main.ts     wires the loop: wall clock → world.advance → events → render
tests/        vitest
```

The sim never touches the DOM. The main loop measures real elapsed time on
every tick: gaps up to 2 s are simulated step by step, gaps up to 120 s
(hidden tab) are settled with `seconds × PPS × 0.4 × multiplier`, and longer
gaps count as the computer having been asleep and earn nothing. There is no
offline income.

## Effect system

Every amount of Lines carries tags such as `board:manual`, `board:auto`,
`building:single`, `clear:double`, `tech:spin`, `tech:combo`, `tech:b2b`,
`tech:pc`. An effect is data:

```ts
{ target: 'income', filter: ['building:single'], op: 'add_pct', value: 10,
  stack: { type: 'owned', id: 'single', offset: -1 } }
```

`target` is what the effect changes (`income`, `price`, …), `filter` is the
set of tags the amount must carry, `op` is `add_pct` (summed), `mul`
(multiplied) or `flag` (turns a feature on), and `stack` scales the value by
how many copies are owned plus an offset. Conditions are data too:
`when: [{ type: 'owned', id: 'single', gte: 5 }]`. Evaluation order is fixed:
base → sum of all `add_pct` → product of all `mul`.

### Buildings

| building | price | largest clear | Lines / piece (measured) |
|---|---|---|---|
| SINGLE | 15 | 1 | 0.4 |
| DOUBLE | 60 | 2 | 0.445 |
| TRIPLE | 250 | 3 | 0.475 |
| TETRIS | 900 | 4 | 0.62 |

Each building unlocks after one copy of the previous tier. Its bot never
clears more rows at once than its size, never tops out, and is paid the
attack table for every clear it makes (no combo, B2B, spin or PC bonuses).
Bots for TRIPLE and TETRIS keep a one-column well on the right and bank the I
in hold; when the stack climbs they drop the well and dig flat. The measured
Lines per piece is what the hidden-tab formula and the shop's per-second
figure use, and a test holds each bot to it within 1%.

### Adding a building

Append one line to `src/data/buildings.ts`; nothing in `src/sim` changes
except registering the bot's placement policy:

```ts
//   id        name       price clear  Lines/piece  unlocked by
tier('tspin', 'T-SPIN', 3000, 2, 0.8, 'tetris'),
```

`tier` fills in the rest: price growth 1.15, 1 PPS, the
`{ target: 'income', filter: ['building:tspin'], op: 'add_pct', value: 10,
stack: { type: 'owned', id: 'tspin', offset: -1 } }` bonus, and the
`unlock: [{ type: 'owned', id: 'tetris', gte: 1 }]` condition. The bot is a
`BotPolicy` registered under the building id in `src/sim/bot/index.ts`;
shop button, lock, price curve, income, catch-up and save all come from the
data entry. Measure the bot's Lines per piece with a 10,000-piece run and put
that number in the entry and in `src/data/ladder.ts`.

## Economy simulator

https://kjh-code.github.io/tetra-clicker/sim.html (dev: `/sim.html`)

A second page that runs the whole building ladder through the catch-up
formula (`PPS × lines per piece × multiplier`) with the game's own pricing
and bonus code, under a player model (PPS, lines per piece, a focus window,
then a daily allowance) and a greedy shortest-payback buyer. It plots income
over time with each building's first purchase, lists unlock times against a
target of `first × ratio^k`, and exports the numbers as JSON in the shape of
`src/data/ladder.ts`. The ladder file holds the nine buildings' numbers for
tuning; the first four have bots and shop entries so far.

## Save

localStorage, key `tetra-clicker/save`, every 10 s plus on tab hide and
unload. The file has a `version`; `src/save/schema.ts` holds the migration
list for future versions.
