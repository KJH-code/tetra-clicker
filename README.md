# Tetra Clicker

Tetris × idle clicker. Clear lines by hand to earn **Lines**, spend Lines on
buildings, and each building is a bot that plays its own board and clears
lines for you. Fifteen buildings, from a bot that only clears singles to a
rival that trades garbage with your own board.

Play: https://kjh-code.github.io/tetra-clicker/

## Run

```
npm install
npm run dev        # http://localhost:5173
npm test           # everything (the bot runs take ~30 min)
npm run test:fast  # all but the long bot runs (about half a minute)
npm run build      # typecheck + static build in dist/
npm run build:engine  # rebuild src/engine/cold-clear.wasm from engine/ (Rust)
```

Node 22. The build sets `base` to `/tetra-clicker/` for GitHub Pages; dev
serves from `/`.

## Controls

Guideline defaults: ← → move, ↓ soft drop, Space hard drop, ↑ / X rotate CW,
Z / Ctrl rotate CCW, A 180, Shift / C hold. DAS / ARR / SDF and the keys
are under SETTINGS: an action takes any number of keys (+ adds the next key
pressed, × on a key removes it), and a key serves one action only, so adding
it to one takes it off another. Settings also hold the volume (sound is
synthesized, no files; MUTE silences it), the language, accessibility and
moving the save (below).

On a touch screen or a window under 900 px, buttons under the manual board
play the same actions with the same DAS / ARR (a tap on the board starts or
resumes a life). Under 900 px the page shows one pane at a time, picked from
the BOARD / BOTS / SHOP bar at the bottom.

A new save gets a five-step tutorial along the bottom of the manual board:
start a life, clear a line, buy a building, reach a checkpoint, ascend. Each
step moves on when the game sees it done (a save that already did one skips
it); OK hides the current step, TUTORIAL OFF ends it.

## Look

Dark slate panels with a colour band per area: the manual board cyan, the
shop green, settings blue, achievements and stats gold, ascension violet,
hardcore red. Buttons are filled in their area's colour; each building has
a colour of its own (the piece colours down the ladder) on its shop card and
over its bot board. The shop ends with a NEXT GOAL card: the next building
on the ladder (or, once every kind is owned, the cheapest next copy) and how
long PER SECOND takes to pay for it. Text is Exo 2 for Latin and Pretendard
for Hangul, both bundled ([THIRD_PARTY.md](THIRD_PARTY.md)); the boards wait
for them before the first frame. Hover and press effects are short and stop
under LESS MOTION.

Clears on the manual board hit as hard as the technique (`hitStrength` in
`src/render/hit.ts`, 0–8: a single barely, a tetris 4, a T-spin double 3,
B2B and a 4+ combo +1 each, a perfect clear 8). From a double up the cleared
rows burst into shards of the piece's colour; from a triple the board holds
still for a beat (hit-stop, up to 110 ms) before it shakes, and a technique's
name lands big in the middle of the well. Under every clear sits a low
thump with a crunch of noise for the bigger ones, and each combo step plays a
semitone higher. Queued garbage a clear cancels pops a red −n by the gauge
with a crack; garbage that rises jolts the stack up with a red flash and a
dull shove. All of it is render-side: the sim does not wait for a hit-stop.

Around the boards:

- **Backdrop**: faint tetrominoes drift down behind the (slightly
  see-through) panes and through the bot pane, which draws only its frame;
  more and faster the richer the run (log10 of PER SECOND), up to 40
  (`src/render/backdrop.ts`). SETTINGS → BACKDROP sets how strongly they
  show (50% by default, 0 turns them off); LESS MOTION stops them.
- **Level theme**: the manual well's frame, grid and floor change colour
  every ten levels (cyan, violet, orange, red) and turn white at 20G.
- **Life readout**: under the hold column, PPS over the last 10 s, life
  time, the combo and B2B chain, and the life's three missions (below).
- **Bot boards** burst into shards (half the hand's strength) when they
  land their technique, and each bot clear sends sparks flying to LINES
  (twenty a second at most, `src/render/coins.ts`).
- **Milestones**: the first time the balance passes 1K, 1M, 1B, … a banner
  crosses the top of the screen.
- **Stars**: 10 / 25 / 50 / 100 copies of a building earn it ★ to ★★★★ on
  its card and bot board, with a toast and a flash on the card
  (`src/data/tiers.ts`). Only for show.
- **Goals in the shop**: the next locked building shows its name, what it
  does, what opens it and a bar toward its price; under NEXT GOAL sit a NEXT
  CROWN bar (the share of the next crown this run has earned) and the two
  achievements nearest to done with their counts.

## Language and accessibility

Every screen text is in English or Korean (`src/ui/i18n.ts`, the Korean in
`src/ui/ko.ts`). AUTO, the default, follows the browser's first language;
SETTINGS → LANGUAGE picks one, and the page reloads in it. Technique and
building names (T-SPIN, B2B, PC, SINGLE …), LINES and CROWN stay English. The
English text is the key, so the data files stay English; generated names
(FIRST <building>, "<building> ×2 (n owned)") go through patterns. A test
reads every `t()` call in the source and every data name and requires a
Korean form for each, unless it is technical terms only.

SETTINGS → ACCESSIBILITY:

| option | what it does |
|---|---|
| PIECE COLOURS | STANDARD (neon) or COLOUR-BLIND SAFE (Okabe–Ito). Seven pieces can all touch and no seven hues stay apart for every pair under every colour-vision type, so the colour-blind palette always shows patterns too |
| PATTERNS | a mark per piece inside each cell: I bar, O dot, T chevron, S and Z opposite diagonals, J upright, L corner |
| HIT EFFECTS | hit-stop, shards, big technique names and the garbage jolt (on by default; off leaves the old small text and shake) |
| LESS MOTION | no row flashes, board shakes, hit-stop, shards or pulsing; starts on when the system asks for reduced motion |
| HIGH CONTRAST | brighter text and grid, an outline on every cell |
| TEXT | 90–150% for the panels and the text drawn on the boards (which shrinks back to fit its column) |


The manual board is played one life at a time. Between lives it shows READY
and the first game key starts one (that key does nothing else). There is no
way out of a life but topping out, so every life ends; how far it gets is the
skill.

- **Level**: marathon style, +1 every 10 rows cleared. Manual Lines are
  multiplied by the level up to level 10, then by 0.25 more a level (×12.5
  at 20, ×17.5 at 40; `levelPay` in `src/data/levels.ts`): a plain ×level
  let a strong player's hand dwarf every bot.
- **Gravity** is always on and follows the level. Normal runs climb the
  table at half pace (`gravityPace` 0.5, interpolated between entries):
  0.5 cells/s at level 1, 1.5 at 9, 4 at 19, 10 at 29, and at level 39
  pieces land at once (20G). Hardcore climbs at full pace: 1.5 at 5, 4 at
  10, 10 at 15, 20G at 20. The aim: a 0.7-PPS beginner tops out around
  level 20, a middling player at 30–40, and a TGM player keeps going.
- **Lock delay**: a resting piece locks after 500 ms; moves and turns reset
  that up to 15 times. Past the first 20G level gravity has nowhere to go,
  so the lock delay shrinks instead: −15 ms a level to 200 ms, and one reset
  fewer every two levels down to 8 (`lockAt` in `src/data/levels.ts`).
- **Missions** (`src/data/missions.ts`): each life draws three of ten (four,
  and three hard ones more, with the MISSION prestige chain)
  (TETRIS ×3, T-SPIN ×2, T-SPIN DOUBLE, B2B ×4, 5 COMBO, LEVEL +5,
  CHECKPOINT, GARBAGE ×4 BY TECHNIQUE, SURVIVE 3 MIN, 100 PIECES) from a
  stream keyed on the life's number. Meeting one pays 1–3 minutes of PER
  SECOND into the vault, once (before the first bot, the hand's recent rate
  stands in); a top-out ends them. The simulator counts them with luck: a
  singles player meets only the time, level, piece and checkpoint ones, in a
  life of 3:42, the average of 14 measured lives.
- **Garbage comes from spending, not from the clock** (`src/data/garbage.ts`).
  Buying a building or an upgrade sends rows: its price over a minute of
  what the game earns (PER SECOND plus the hand's recent rate), rounded down,
  four at most. They wait in the red gauge up the well's left edge (bought
  between lives, they wait for the next one). A clear's attack (table value
  ÷ 2) cancels them first; a piece that clears nothing lets up to four rise,
  each with one random hole, as in a versus game.
- **Buy while you play**: a running life buys buildings and upgrades 20%
  under the list price (list prices are ×1.25 the ladder's, so the live
  price is the ladder's). Between lives or paused, the list price applies
  and a purchase sends twice the rows, up to eight. The shop's band says
  which (LIVE · prices −20% / READY · purchase garbage ×2), cards show the
  struck list price in a life and ▲n for the rows a purchase would send.
- **A fresh bag every life**: after a top-out the next life opens on a new
  7-bag with hold empty.
- **Garbage on the board slows the bots**: each row 5% off bot income, half
  at most (BOTS −n% under the level). A top-out sends whatever garbage is on
  the board back to the queue, so dying never sheds it.
- **Digging with technique pays**: a garbage row cleared by a full spin, a
  tetris, back-to-back, a perfect clear or a combo from its fourth step pays
  ten seconds of PER SECOND into the vault.
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

- **Wrath pieces.** Once the WRATH prestige chain opens them, a golden piece
  comes as a wrath piece instead with a chance set by the run's wrath
  upgrades: 33% at WRATH I, 66% at II, 100% at III. It is dark red with a
  throbbing rim, follows the golden rules (clear a line or lose it), and
  draws:

| | chance | effect |
|---|---|---|
| ELDER FRENZY | 20% | bots ×666 for 6 s |
| CLOT | 40% | all income ×0.5 for 66 s |
| RUIN | 40% | loses 20% of the vault (never the bank) |

On average a wrath piece pays about 1.2× a golden one once bots carry the
income (from the first ascension on, in the simulator), all of it from ELDER
FRENZY; four times in five it costs something. The weights were 30 / 35 / 35
in the first draft, which came out at 1.8×; 20 / 40 / 40 brings it to
1.18–1.23× across the simulator's 2.5 h to 7 day range. `tests/wrath.test.ts`
holds it there, using `src/sim/luck.ts`, the expected-value model the
simulator shares.

## Prestige

Ascending trades a run for CROWNs. Crowns ever earned =
`∛(lifetime risk-weighted Lines / 135,000)`; an ascension pays the growth of
that since the last one, times `1 + tech score`, rounded down, and needs at
least one. The cube root makes each next crown dearer, so one long run beats
many short ones. K is set so the first crown comes after about 2.5 hours.

- **Tech score**: ten checks per run, 0.15 each, capped at 1.0 — T-spin
  single / double / triple, perfect clear, 5 and 10 combo, five B2B in a row,
  10 tetrises, reaching level 10, 3 golden pieces — plus four in hardcore runs
  (below).
- **Every crown earned** adds 1% to all income, spent or not.
- **Every achievement** adds 1% too (below).
- **Resets**: Lines, buildings, run upgrades (wrath too), run stats, round,
  buffs, golden piece. **Stays**: crowns, prestige upgrades, lifetime stats,
  settings.

ASCEND (under the shop, locked during a round) shows the crowns on offer and
the checklist; ascending opens the prestige shop, which a reload returns to
until NEW RUN. The shop is a tree (`src/ui/prestigeTree.ts`): a CROWN root in
the middle and a ray per chain, each step on a line from the one before;
bought steps glow in their chain's colour, the next buyable one is outlined,
the rest are faint. Drag to move it, wheel or pinch to zoom; it opens on the
first three steps of every chain. Six chains of five, 1 / 3 / 9 / 27 / 81
crowns, each step needing the one before:

| production | survival | proportion | mission | event | wrath |
|---|---|---|---|---|---|
| all income ×2 | gravity ×0.8 | risk weight ×1.5 | mission pay ×1.5 | events 25% more often | wrath pieces appear |
| start with 2K Lines | keep 25% of the vault on a top-out | tech cap +0.5 | four missions a life | good events twice as likely | ELDER FRENZY lasts 12 s |
| manual ×3 | purchase garbage ×0.8 | risk weight ×2 | hard missions (TETRIS ×6, PERFECT CLEAR, 10 COMBO, 5 min each) | event rewards ×1.5 | RUIN takes 10% |
| all income ×2 | keep 50% of the vault on a top-out | start level +2 | mission pay ×2 | boss HP ×0.75 | CLOT half as likely |
| all income ×3 | keep 75% of the vault on a top-out | risk weight ×3 | each mission met: +10% income for the rest of the life | events 50% more often in all, rewards ×2 | no RUIN |

WRATH's ids are `elder_1..5`, clear of the run upgrades `wrath_1..3`.

A fifth chain, SYNERGY, is research: 1, 2, 3 … 8 crowns up the ladder, each
opening one synergy for every later run (below).

Everything is data in `src/data/prestige.ts`.

### Hardcore

From the second run on, the prestige shop picks the next run's mode, NORMAL or
HARDCORE (it stays as last time unless changed). A hardcore run is one life:

- **Harder**: starts three levels up, gravity and rivals at full pace (20G at
  level 20, rivals up to 2 PPS), three next pieces instead of five, and
  a slow trickle of timed cheese on top of purchase garbage (from level 1,
  a row every `3 × max(1.5, 24 / level)` seconds). Only techniques earn in
  full: a plain single, double or triple pays half.
- **Pays more**: manual income ×2 and risk weight ×3 (about ×1.44 crowns by
  itself, more with the extra Lines). The tech cap rises by 0.5 to make room
  for four hardcore-only checks: level 15, 10 checkpoints, 30 minutes alive,
  and ascending alive.
- **A top-out ascends the run on the spot**, crowns or not: the vault is lost
  (vault-keeping upgrades do not apply) and the prestige shop opens on
  HARDCORE OVER.
- **ASCEND works mid-life**: the life pauses on the confirmation, and
  ascending banks the vault first, risk weight and all.

The manual pane runs red with a HARDCORE badge; the prestige shop shows the
best hardcore life (level reached, rows cleared). The effects are data in
`src/data/hardcore.ts`, on a `{ type: 'hardcore' }` condition.

### Synergies

One per pair of neighbouring buildings. Researched once with crowns; then, in
any run where both buildings are owned, a SYN chip offers it for ten times
the dearer building's base price. Prestige drops the purchase and keeps the
research.

| pair | price | kind | effect |
|---|---|---|---|
| SINGLE + DOUBLE | 2,500 | cross | each earns +1% per copy of the other |
| DOUBLE + TRIPLE | 9,000 | cross | each earns +1% per copy of the other |
| TRIPLE + TETRIS | 13,500 | link | a tetris by hand doubles the TETRIS bot for 30 s |
| TETRIS + T-SPIN | 34,000 | reward | the T-SPIN bot shares back-to-back pay: ×1.25 |
| T-SPIN + ALL-SPIN | 130,000 | play | the T-SPIN bot goes for TSS and TST too, ×1.25 |
| ALL-SPIN + COMBO | 320,000 | reward | the ALL-SPIN bot shares combo pay: ×1.25 |
| COMBO + B2B | 1,500,000 | play | the B2B bot keeps combos going, ×1.25 |
| B2B + PERFECT | 3,800,000 | link | a perfect clear by hand doubles every bot for 30 s |
| PERFECT + DOWNSTACK | 14,000,000 | reward | the DOWNSTACK bot shares perfect-clear pay: ×1.25 |
| DOWNSTACK + 4-WIDE | 38,000,000 | link | a garbage row you clear doubles the 4-WIDE bot for 30 s |
| 4-WIDE + OPENER | 160,000,000 | play | the OPENER bot runs a short combo after each PC instead of the TSD, ×1.25 |
| OPENER + HELPER | 460,000,000 | link | a perfect clear by hand doubles the HELPER bot for 30 s |
| HELPER + INVADER | 1,600,000,000 | reward | the INVADER bot shares combo pay: ×1.25 |
| INVADER + RIVAL | 3,900,000,000 | cross | each earns +1% per copy of the other |

Reward and play synergies are a fixed ×1.25 on that bot's income, in play
and in the hidden-tab formula alike; the bot is still paid only for its own
technique. A play synergy also switches the board to another bot (a
`variant` in the data): measured over 9,000 pieces, the T-SPIN variant
earns about the same per piece (1% more), the B2B variant about a tenth
less, which the ×1.25 more than covers. A link buff is game time like a
golden buff, and the same clear again refills it to 30 s. Boards show SYN
while a synergy they belong to is bought, and the multiplier while a buff
lifts them. All of it is data in `src/data/synergies.ts`.

### Achievements

92, made from templates in `src/data/achievements.ts`: owning 1 / 10 / 50 /
100 of each building in a run (60), Lines earned over all runs (1K / 100K /
10M / 1B), technique counts (TSD 10 / 100, PC 1 / 10, a 10 combo), level
10 / 15 / 20, ascending 1 / 5 / 25 times, two hardcore ones, challenge runs
cleared at 3 / 6 / 10 / 15 points, one per life event, beating the RIVAL
building's board 3 and 10 times in one life, and five hidden ones
(HARDCORE 20, which opens challenge runs, among them) that show as ??? until
met. A building's own achievements are named only once it has been bought
in some run, so the list does not give the ladder away. Each is met once and kept for good, through
ascension, and adds 1% to all income (the same shape as crowns). Their
conditions are the effect engine's own, plus `career`, which reads a stat as
every finished run plus this one. The world checks them after a manual lock,
a purchase, an ascension and once a second; a toast announces each, and ★
N/92 under the shop opens the list. Its STATS tab shows this run beside all
runs (Lines, lives, top-outs, checkpoints, play time, techniques by hand,
records, the best RIVAL streak), the last 20 lives (time, level reached,
missions met, what they paid, and the average: saved with the world, so a
save export carries them; the simulator's life length came from here)
and two charts: PER SECOND through the run (a point every 30 s of
play, the gap doubling past 240 points) and each building's PER SECOND now.

### Challenge runs

Opened by the hidden HARDCORE 20 achievement, picked on the prestige shop as
a third mode. A challenge run is a hardcore run with rules on top, each in
steps worth difficulty points (`src/data/challenges.ts`):

| rule | steps (points) |
|---|---|
| NO HOLD | 2 |
| FEWER NEXT (below hardcore's 3) | NEXT 2 (1), NEXT 1 (2) |
| MORE GARBAGE (purchase garbage) | ×1.5 (1), ×2 (2) |
| FASTER GRAVITY | ×1.5 (1), ×3 (2), 20G (3) |
| FEW BUILDINGS | 3 kinds (1), 1 kind (2), none (3) |
| NO RUN UPGRADES | 2 |
| NO SYNERGIES | 1 |
| DEARER BUILDINGS | prices ×2 (1) |

A run needs 3 points to start and is cleared by ascending alive; a top-out
fails it. The best cleared total is kept, and each of its points adds 2% to
all income for good. The rules are effects on a `{ type: 'challenge', id,
step }` condition, so a harder step replaces the one below it.

### Bots and the hand

The bots and the manual board pull on each other (`src/data/botlinks.ts`):

- **Links**: a clear by hand doubles the bot built on it for 30 s, 30 s
  more for each repeat, 90 s at most: a single, double, triple or tetris its
  clear-size bot, a T-spin T-SPIN, any other spin ALL-SPIN, a combo COMBO, a
  back-to-back B2B, a perfect clear PERFECT (only bots owned). Links stack
  with golden and synergy buffs. The bot's label shows the multiplier.
- **Low stack**: while a life runs, a manual stack of four rows or fewer
  speeds every bot 20%, falling to nothing at ten rows (BOTS +n% under the
  level bar). Garbage still slows them as before.
- **Bot levels**: each building's bot levels up on its own technique (its
  clear size for the plain ones): level n at 50 × n(n+1)/2 of them, +5% to
  that building a level, 20 at most. A run's levels go with an ascension.
  The simulator counts them, taking a quarter of a bot's pieces as its
  technique (a guess).
- **Abilities**: TETRIS cancels a queued garbage row on your board with
  each tetris; PERFECT doubles every bot for 5 s with each perfect clear;
  COMBO pays 10% more per combo step and B2B 2% more per chain step;
  DOWNSTACK lifts a garbage row off your board when it clears garbage (at
  most every 20 s); OPENER doubles the first 10 pieces of each life by hand;
  ALL-SPIN takes 2 s off the hint cooldown with each spin.
- **HINT** (H, or the touch button): the bots' pick for the piece in play
  shows as a dashed ghost for 4 s ("HOLD FIRST" when it uses the hold).
  Cooldown 30 s ÷ (1 + bots owned / 50), 5 s at least; needs a bot and a
  live life. It is worked out on a copy of the board, so asking never
  changes the life.
- **The bot pane**: each board's label carries its stars, level and
  multiplier, its PER SECOND sits under the hold column, a technique bursts
  and stamps its name, and clicking a board opens it large with what it
  owns, earns, its level and XP bar, its link and its ability.

### Life events

From level 3, every 2–5 minutes of life time (a timer of their own), one of
seven turns up (`src/data/events.ts`). At level 3 half the draw is the kind
ones (helper, bonus round, mystery); the ones that fight back (rival,
invader, boss) and the tech challenge grow 25% a level up to level 15.
Attack is the table value ÷ 2 in garbage rows.

- **Rival**: a Cold Clear bot on a board of its own, drawn small under NEXT,
  trading garbage with you until one of you tops out. Your attack cancels the
  rows coming at you first and sends the rest across; a piece that clears
  nothing takes what is waiting (up to 6 rows). Stronger with the level:
  0.5 + 0.06 × level × pace PPS, up to 2 × pace, where pace (the
  `rival_pace` effect) is 0.5 in normal runs (a 1-PPS cap, so it does not
  outrun the player the game is pitched at) and 1 in hardcore. At normal pace
  it also searches less (200 + 30 × level nodes, 800 at most, against
  hardcore's up to 4,000) and one piece in ten plays a quick shallow move
  instead, so a high-level rival can be outplayed. Beating it pays 120 s of
  PER SECOND per level into the vault. A fight lasts 90 s at most: then the
  lower stack (or a tie) wins half that, and a higher one sends the rival away.
- **Invader**: 45 s of timed cheese (the one time a normal life sees timed
  garbage), a row every 3 s at level 3 and 0.09 s sooner each level after,
  never under 1.5 s (from level 20). Your attack is banked and blocks rows
  before they land. Outlasting it adds four times the Lines made by hand
  meanwhile.
- **Helper**: for 60 s, each clear that keeps a combo or back-to-back going
  lifts the lowest garbage row out and pays it like a single.
- **Bonus round**: 30 s of manual income ×4.5; the total shows at the end.
- **Boss**: level × 10 HP, worn down by your attack after it cancels what
  the boss has queued; every 6 s it queues 2 rows, which rise under a piece
  that clears nothing (up to 4). Killing it inside 90 s pays PER SECOND ×
  level × 4.5 minutes into the vault; otherwise it escapes. Its HP shows as a
  bar under the banner.
- **Tech challenge**: one of TETRIS ×2, T-SPIN ×2, B2B ×3 or 5 COMBO ×1 in
  60 s pays 4.5 minutes of PER SECOND; otherwise it fails.
- **Mystery**: NEXT is hidden for 20 s (hold still shows); manual income ×3
  meanwhile.

Rewards here are sized on PER SECOND (the hand's recent rate only before the
first bot: sized on the hand, a high-level life made one reward worth hours
of bots). The simulator prices every event with luck.

A top-out or an ascension ends an event, and a save does not keep one. Once
the HELPER, INVADER or RIVAL building is owned, its event no longer turns up:
the building does the same thing for good.

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
  engine/     the built Cold Clear module and the worker that runs bots ahead
  main.ts     wires the loop: wall clock → world.advance → events → render
engine/       Cold Clear's Rust source (MPL-2.0) and the glue to this game
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
| T-SPIN | 3,400 | a T-spin double from nearly every T (12.9 per 100 pieces; 14.3 is the cap), nothing else | 1.12 | 1.43 | TSD |
| ALL-SPIN | 13,000 | spins every piece into its clears (11 non-T spins per 100 pieces) | 1.24 | 1.45 | every full spin (×1.5 for non-T) |
| COMBO | 32,000 | builds a ragged stack 12 rows high, then cuts it down one row at a time (combos up to 10) | 1.69 | 1.18 | combo |
| B2B | 150,000 | only tetrises and TSDs, so the chain holds (13 B2B clears per 100 pieces) | 1.48 | 1.49 | B2B +20% (a TSD is a plain double) |
| PERFECT | 380,000 | 4-row perfect clear, then again from the empty board | 1 | 2.45 | perfect clear |
| DOWNSTACK | 1,400,000 | its board throws up a garbage row every 4th piece (half of them cheese); it digs | 1.125 | 2.40 | table value + 2 a garbage row, 4 a cheese row |
| 4-WIDE | 3,800,000 | walls stand full on both sides; endless combos in the 4-wide well (up to 165) | 1.03 | 2.918 | combo |
| OPENER | 16,000,000 | a DPC loop by search: PC, TSD, PC from the leftovers (a PC per 15 pieces, a TSD per 29) | 1.6 | 2.064 | PC, TSD and B2B |
| HELPER | 46,000,000 | the COMBO bot; lifts garbage off your board (below) | 3.05 | 1.18 | combo |
| INVADER | 160,000,000 | the DOWNSTACK bot; adds to your purchase garbage (below) | 1.625 | 2.40 | table value + garbage rows |
| RIVAL | 390,000,000 | Cold Clear's own weights, 6,000 nodes; fights your board (below) | 2.82 | 1.488 | B2B |

Each building unlocks after one copy of the previous tier. Its bot never
tops out, and every clear that is not its own technique pays the plain table
value. Bots for TRIPLE and TETRIS keep a one-column well on the right and bank
the I in hold; when the stack climbs they drop the well and dig flat.

The technique bots earn about the same per piece (a single is worth too
little for a combo to beat a tetris), so a higher tier plays faster instead:
PPS is set so PPS × Lines per piece climbs 1.6, 1.8, 2.0, 2.2 Lines a second,
and PERFECT, which earns the most per piece, stays at 1 PPS; past it the
step is 0.3: 2.7, 3.0, 3.3, 3.6, 3.9, 4.2.

The last three reach into the manual board, from the moment one is bought
(`src/data/buildings.ts`, `src/sim/world.ts`):

- **HELPER**: every Nth clear by hand that keeps a combo or back-to-back
  going lifts the lowest garbage row out of your board and pays it like a
  single. N is 4 with one copy, 3 with two, 2 with three to nine, 1 from ten.
- **INVADER**: each copy makes every purchase send 5% more garbage and adds 10% to
  your manual income.
- **RIVAL**: while a life runs, the RIVAL board trades garbage with yours,
  like the rival event (table value ÷ 2 in rows, your attack cancels what is
  coming first, a piece that clears nothing takes up to 6 rows). A top-out
  on your side ends the life as always. When the rival tops out its board
  resets and the next one is stronger: each win in a row makes it play 15%
  faster and hit 10% harder, and pays PER SECOND × 60 s × level ×
  streak into the vault. The streak resets with the life; the best is kept.
  Between lives it plays alone.

DOWNSTACK and 4-WIDE play on boards with rules of their own (`BoardMode`
in `src/sim/game.ts`: its own garbage, walls), kept in the board's snapshot
so the worker's copy plays the same game. OPENER's named builds (TEAL,
산악 2호, 신DT, Sarcell, SDPC, GA spin, Eternal Return …) are a prestige
chain, one step a build, once their fumen diagrams are in
(`src/data/openers.ts`, decoded with tetris-fumen); a researched build the
queue fits is played ahead of the search.

T-SPIN, ALL-SPIN, COMBO and B2B are [Cold Clear](https://github.com/MinusKelvin/cold-clear)
itself: the Rust engine in `engine/`, built to a 150 KB WebAssembly module,
with weights per building (`src/sim/bot/techBots.ts`) and a list of clears
each bot may never make. A search is 10,000–20,000 nodes (30–65 ms); a
worker runs a copy of every bot board a few pieces ahead and hands each
decision over, keyed by the exact position, so the page never waits on a
search and gets the same move it would have worked out itself. The search's
random choices are seeded from the position, so the same board always plays
the same way. PERFECT plans with a port of pcf, the perfect clear finder, and
falls back to Cold Clear between loops; see [THIRD_PARTY.md](THIRD_PARTY.md).
Every bot board replays each piece's real path, so a spin shows the piece
sliding down and turning in, with the technique's name floating over the board.

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
| milestone ×2 (generated per building) | own 1 / 5 / 25 / 50 / 100 / 150 / 200 | that building's income ×2 |
| manual ×2 | 200 / 2K / 20K / 200K / 2M Lines earned by hand | manual income ×2 |
| SPIN / B2B / PC | that technique done 10 / 50 / 200 times (PC 1 / 5 / 20) | ×1.5, ×2, ×2 on clears with that tag |
| COMBO | 5 / 25 / 100 runs reaching a 5 combo | combo step 0.1 → 0.15 → 0.2 → 0.25 |
| GRACE | 5 combo 10 / 50 times | a combo survives 1, then 2, empty pieces |
| SHIELD | 25 back-to-back clears | one ordinary clear per chain does not break B2B |
| NEXT+1 | 500 manual pieces | six next pieces |

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

https://kjh-code.github.io/tetra-clicker/sim.html (dev: `/sim.html`), in the game's language (read from its save)

A second page that runs the whole building ladder through the catch-up
formula (`PPS × lines per piece × multiplier`) with the game's own pricing
and bonus code, under a player model (PPS, lines per piece, an average life
level that multiplies manual income, a focus window, then a daily allowance)
and a greedy shortest-payback buyer that also buys
the milestone, manual ×2 and manual share upgrades (toggle UPGRADES to compare).
SYNERGIES adds the synergy chips as if researched (link synergies pay
nothing there: the model player clears singles); HARDCORE applies the
hardcore effects (manual ×2, risk ×3, lives three levels up); LUCK models
golden pieces at their expected value, at a WRATH stage 0–III. It plots income
over time with each building's first purchase, lists unlock times against a
target of `first × ratio^k`, and exports the numbers as JSON in the shape of
`src/data/ladder.ts`. The ladder file mirrors the fifteen shop buildings for
tuning; its default player averages level 4, the level the prices were
fitted to.

## Save

localStorage, key `tetra-clicker/save`, every 10 s plus on tab hide and
unload. The file has a `version` (now 11); `src/save/schema.ts` upgrades
older saves step by step, so a version 1 save loads with no upgrades and
zeroed stats, a version 2 save loads with no round in play, a version 3
save loads with no buffs or golden piece, a version 4 save has never
ascended and has its Lines doubled into the whole-number unit, and a
version 5 save has any round in progress banked in full (lives replaced
settled rounds) and its settle key dropped, and a version 6 save has only
ever played normal runs, with no hardcore record, and a version 7 save has
met no achievements yet (the first sweep awards what it qualifies for) and
holds no wrath piece, and a version 8 save has its buildings ever bought
filled in from FIRST achievements and what it owns, and its lifetime Lines
(not counted before version 8) raised to a floor estimated from the balance,
what it bought, Lines by hand and banked risk, and a version 9 save has no
RIVAL streak yet; its new settings (language, accessibility) take their
defaults; and a version 10 save loses HOLD ×2 (no longer sold: a run that
bought it gets its 20,000 back and one hold slot) and starts with an empty
purchase-garbage queue.

SETTINGS → SAVE moves a game between browsers. EXPORT copies the save as
text (`TETRA1:` and base64 JSON) and downloads it as a `.txt`; IMPORT takes
pasted text or that file, runs it through the same migrations, and only
when it reads as a save asks to replace this game and reloads. Anything
else is refused and the current game stays as it is.
