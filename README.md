# Tetra Clicker

Tetris × idle clicker. Clear lines by hand to earn **Lines**, spend Lines on
buildings, and each building is a bot that plays its own board and clears
lines for you. Nine buildings, from a bot that only clears singles to one
that loops perfect clears.

Play: https://kjh-code.github.io/tetra-clicker/

## Run

```
npm install
npm run dev        # http://localhost:5173
npm test           # everything (the bot runs take ~20 min)
npm run test:fast  # all but the 10,000-piece bot runs (seconds)
npm run build      # typecheck + static build in dist/
```

Node 22. The build sets `base` to `/tetra-clicker/` for GitHub Pages; dev
serves from `/`.

## Controls

Guideline defaults: ← → move, ↓ soft drop, Space hard drop, ↑ / X rotate CW,
Z / Ctrl rotate CCW, A 180, Shift / C hold. DAS / ARR / SDF and every key can
be changed under SETTINGS.

## Lives

The manual board is played one life at a time. Between lives it shows READY
and the first game key starts one (that key does nothing else). There is no
way out of a life but topping out, so every life ends; how far it gets is the
skill.

- **Level**: marathon style, +1 every 10 rows cleared. Manual Lines are
  multiplied by the level.
- **Gravity** is always on and follows the level: 0.5 cells/s at level 1,
  1.5 at 5, 4 at 10, 10 at 15, and at level 20 pieces land at once (20G).
  A resting piece locks after 500 ms; moves and turns reset that up to 15 times.
- **Garbage**: from level 3, a cheese row (one random hole) every
  `max(1.5, 24 / level)` seconds.
- **Vault and checkpoints**: manual Lines go to the vault. Every 40 rows
  cleared in a life, a checkpoint banks the vault into the balance. A top-out
  loses whatever the vault still holds, and the level goes back to the start.
- The shop stays open: buying is a click away while the board keeps falling.
- Hiding the tab or leaving the window pauses the life (bots keep going); any
  key resumes. A life restored from a save starts paused.

Wrath is bought as three upgrades (unlocked after the first life) that make
lives harder and richer. There is no way back before prestige:

| | price | effect |
|---|---|---|
| WRATH I | 2K | every life starts at level 4 |
| WRATH II | 20K | a level every 8 rows instead of 10 |
| WRATH III | 200K | start at level 8, a level every 6 rows |

Banked Lines times the level they were earned at are summed into the
`riskLines` stat, which pays for prestige; Lines lost to a top-out never
count. All numbers live in `src/data/levels.ts`.

## Keeping the manual board worth playing

Bots outgrow the attack table, so two things keep hand play in step:

- **Manual share.** Five upgrades (unlocked at 2K / 20K / 200K / 2M / 20M Lines
  by hand, priced at ten times that) each add 1% of PER SECOND to every row
  cleared by hand. A manual clear pays
  `(table value × manual upgrades + share × PER SECOND × rows) × level × buffs`,
  with PER SECOND taken without buffs.
- **Golden pieces.** Every 1–5 minutes of round time the last NEXT piece turns
  gold. It stays gold through hold and pays only if it clears a line; placed
  flat it is lost, and a round's end takes it away. The outcome is drawn when
  it clears:

| | chance | effect |
|---|---|---|
| FRENZY | 45% | all income ×7 for 77 s |
| LUCKY | 45% | 15 minutes of PER SECOND into the vault |
| CLEAR FRENZY | 10% | manual income ×777 for 13 s |

Buffs run on game time whether or not a round is on; different buffs
multiply, the same one restarts its timer. A hidden-tab stretch uses up buff
time without paying it. LUCKY DAY (15,554, after 7 golden pieces) halves the
wait; GET LUCKY (155,554, after 27) doubles buff time. Numbers live in
`src/data/golden.ts`.

## Prestige

Ascending trades a run for CROWNs. Crowns ever earned =
`∛(lifetime risk-weighted Lines / 135,000)`; an ascension pays the growth of
that since the last one, times `1 + tech score`, rounded down, and needs at
least one. The cube root makes each next crown dearer, so one long run beats
many short ones. K is set so the first crown comes after about 2.5 hours.

- **Tech score**: ten checks per run, 0.15 each, capped at 1.0 — T-spin
  single / double / triple, perfect clear, 5 and 10 combo, five B2B in a row,
  10 tetrises, reaching level 10, 3 golden pieces.
- **Every crown earned** adds 1% to all income, spent or not.
- **Resets**: Lines, buildings, run upgrades (wrath too), run stats, round,
  buffs, golden piece. **Stays**: crowns, prestige upgrades, lifetime stats,
  settings.

ASCEND (under the shop, locked during a round) shows the crowns on offer and
the checklist; ascending opens the prestige shop, which a reload returns to
until NEW RUN. Three chains, 1 / 3 / 9 / 27 crowns, each step needing the one
before:

| production | survival | proportion |
|---|---|---|
| all income ×2 | gravity ×0.8 | risk weight ×1.5 |
| start with 2K Lines | keep 25% of the vault on a top-out | tech cap +0.5 |
| manual ×3 | garbage gaps ×1.25 | risk weight ×2 |
| all income ×2 | keep 50% of the vault on a top-out | start level +2 |

Everything is data in `src/data/prestige.ts`.

## Attack table

Lines earned per placement (the project's own table, not TETR.IO's). The
ratios are the design; the unit is doubled so every amount is a whole number:

| clear | single | double | triple | tetris | TSS | TSD | TST | PC |
|---|---|---|---|---|---|---|---|---|
| Lines | 2 | 5 | 9 | 14 | 4 | 8 | 12 | 20 |

Combo multiplies by `1 + 0.1 × [0,1,1,2,2,3,3,4,4,4,5…]` (index = clears
before this one in the run). Back-to-back adds 20%. A perfect clear replaces
the base with 20 before combo and B2B. A full spin of any other piece
(all-spin) pays its plain clear × 1.5; minis still pay as plain clears. Bots
are paid only for their own building's technique (below).

Balances, the vault and every payout are whole Lines. Multipliers still make
fractions, so each payout pays the whole part and carries the remainder into
the next (one carry for the balance, one for the vault): nothing is lost and
long-run income equals the exact sum. Building prices round up; a share of
the vault kept on a top-out rounds down.

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
(hidden tab) are settled with `seconds × PPS × Lines per piece × multiplier`, and longer
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
set of tags the amount must carry, `op` is `add` (flat, onto the base),
`add_pct` (summed), `mul` or `mul_pct` (multiplied) or `flag` (turns a feature
on), and `stack` scales the value by copies owned (plus an offset) or by a
statistic. Conditions are data too: `when: [{ type: 'owned', id: 'single', gte: 5 }]`,
or `stat`, `upgrade`, `prestige`. Evaluation order is fixed:
base + all `add` → sum of all `add_pct` → product of all `mul` and `mul_pct`.

### Buildings

Prices are fitted with the economy simulator (below) to a player whose lives
average level 4.

| building | price | bot | PPS | Lines / piece (measured) | paid for |
|---|---|---|---|---|---|
| SINGLE | 110 | clears singles only | 1 | 0.8 | table value |
| DOUBLE | 250 | clears up to doubles | 1 | 0.89 | table value |
| TRIPLE | 900 | up to triples, keeps a well | 1 | 0.95 | table value |
| TETRIS | 1,350 | tetrises from a well | 1 | 1.24 | table value |
| T-SPIN | 3,400 | sets up and spins T-spin doubles, nothing else | 1.22 | 1.31 | TSD |
| ALL-SPIN | 13,000 | spins every piece it can into a clear | 1.32 | 1.36 | every full spin (×1.5 for non-T) |
| COMBO | 32,000 | builds a ragged stack, then cuts it down one row at a time | 1.61 | 1.24 | combo |
| B2B | 150,000 | tetrises and TSDs without breaking back-to-back | 1.82 | 1.21 | B2B +20% (a TSD is a plain double) |
| PERFECT | 380,000 | 4-row perfect clear, then again from the empty board | 1 | 2.45 | perfect clear |

Each building unlocks after one copy of the previous tier. Its bot never
tops out, and every clear that is not its own technique pays the plain table
value. Bots for TRIPLE and TETRIS keep a one-column well on the right and bank
the I in hold; when the stack climbs they drop the well and dig flat.

The technique bots earn about the same per piece (a single is worth too
little for a combo to beat a tetris), so a higher tier plays faster instead:
PPS is set so PPS × Lines per piece climbs 1.6, 1.8, 2.0, 2.2 Lines a second,
and PERFECT, which earns the most per piece, stays at 1 PPS. They are built on
ports of Cold Clear (move generation with spins, the board evaluator, a beam
search with hold) and pcf (the perfect clear finder); see
[THIRD_PARTY.md](THIRD_PARTY.md). Their boards replay each piece's real path,
so a spin shows the piece sliding down and turning in, with the technique's
name floating over the board. When a stack climbs too high, any of them
switches to a survival preset that digs out.

The measured Lines per piece is what the hidden-tab formula and the shop's
per-second figure use, and the slow tests hold each bot to it within 1%.

### Adding a building

Append one line to `src/data/buildings.ts`; nothing in `src/sim` changes
except registering the bot's placement policy:

```ts
//   id        name       price clear  Lines/piece  unlocked by
tier('ultra', 'ULTRA', 900_000, 4, 2.0, 'pc', { tech: 'pc', pps: 1.5 }),
```

`tier` fills in the rest: price growth 1.15, 1 PPS unless given, the
`{ target: 'income', filter: ['building:ultra'], op: 'add_pct', value: 10,
stack: { type: 'owned', id: 'ultra', offset: -1 } }` bonus, and the
`unlock: [{ type: 'owned', id: 'pc', gte: 1 }]` condition. `tech` names the
technique the bot is paid for. The bot is a
`BotPolicy` registered under the building id in `src/sim/bot/index.ts`;
shop button, lock, price curve, income, catch-up and save all come from the
data entry. Measure the bot's Lines per piece with a long run and put that
number in the entry and in `src/data/ladder.ts`.

## Upgrades

Bought once each; they show up as chips above the buildings when they
unlock. All of them are data in `src/data/upgrades.ts`.

| group | unlock | effect |
|---|---|---|
| milestone ×2 (generated per building) | own 1 / 5 / 25 / 50 / 100 | that building's income ×2 |
| manual ×2 | 200 / 2K / 20K / 200K / 2M Lines earned by hand | manual income ×2 |
| SPIN / B2B / PC | that technique done 10 / 50 / 200 times (PC 1 / 5 / 20) | ×1.5, ×2, ×2 on clears with that tag |
| COMBO | 5 / 25 / 100 runs reaching a 5 combo | combo step 0.1 → 0.15 → 0.2 → 0.25 |
| GRACE | 5 combo 10 / 50 times | a combo survives 1, then 2, empty pieces |
| SHIELD | 25 back-to-back clears | one ordinary clear per chain does not break B2B |
| NEXT+1 / HOLD2 | 500 / 2,000 manual pieces | six next pieces / a two-slot hold queue |

Technique upgrades and buffs only matter on the manual board: bot income
carries no technique tags, so the SPIN / B2B / PC / COMBO multipliers never
reach it, and bots always play guideline rules. GRACE, SHIELD, NEXT+1 and
HOLD2 change the rules of Tetris itself and say RULE in their tooltip.

Each tier of a chain needs the previous one bought, so one chip per chain
shows at a time. Conditions are data — `{ type: 'owned' | 'stat' |
'upgrade', … }` — and the loader makes every upgrade effect depend on owning
the upgrade, so an entry is only:

```ts
{ id: 'pc_1', name: 'PC ×1.5 (1)', label: 'PC×1.5', group: 'tech', price: 2_000,
  unlock: [{ type: 'stat', stat: 'pcs', gte: 1 }],
  effects: [{ target: 'income', filter: ['tech:pc'], op: 'mul', value: 1.5 }] }
```

A new stat counter (in `src/sim/stats.ts`) is all a new kind of unlock
needs; a new rule flag needs the manual game to read it.

## Economy simulator

https://kjh-code.github.io/tetra-clicker/sim.html (dev: `/sim.html`)

A second page that runs the whole building ladder through the catch-up
formula (`PPS × lines per piece × multiplier`) with the game's own pricing
and bonus code, under a player model (PPS, lines per piece, an average life
level that multiplies manual income, a focus window, then a daily allowance)
and a greedy shortest-payback buyer that also buys
the milestone, manual ×2 and manual share upgrades (toggle UPGRADES to compare). It plots income
over time with each building's first purchase, lists unlock times against a
target of `first × ratio^k`, and exports the numbers as JSON in the shape of
`src/data/ladder.ts`. The ladder file mirrors the nine shop buildings for
tuning; its default player averages level 4, the level the prices were
fitted to.

## Save

localStorage, key `tetra-clicker/save`, every 10 s plus on tab hide and
unload. The file has a `version` (now 6); `src/save/schema.ts` upgrades
older saves step by step, so a version 1 save loads with no upgrades and
zeroed stats, a version 2 save loads with no round in play, a version 3
save loads with no buffs or golden piece, a version 4 save has never
ascended and has its Lines doubled into the whole-number unit, and a
version 5 save has any round in progress banked in full (lives replaced
settled rounds) and its settle key dropped.
