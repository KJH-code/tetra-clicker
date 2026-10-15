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

### Adding a building

Append one entry to `src/data/buildings.ts`; nothing in `src/sim` changes:

```ts
{
  id: 'double',
  name: 'DOUBLE',
  basePrice: 100,
  priceGrowth: 1.15,
  pps: 1,
  skill: 'double',          // a policy registered in src/sim/bot/index.ts
  unlock: [{ type: 'owned', id: 'single', gte: 1 }],
  effects: [
    { target: 'income', filter: ['building:double'], op: 'add_pct', value: 10,
      stack: { type: 'owned', id: 'double', offset: -1 } },
  ],
}
```

The first copy of a building creates its board; each further copy adds the
percentage. A new `skill` needs a placement policy (`BotPolicy`) registered in
`src/sim/bot/index.ts`; everything else (shop button, price curve, income,
catch-up, save) comes from the data entry.

## Save

localStorage, key `tetra-clicker/save`, every 10 s plus on tab hide and
unload. The file has a `version`; `src/save/schema.ts` holds the migration
list for future versions.
