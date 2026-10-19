import type { Condition, Effect } from '../sim/effects';

// Garbage on the manual board comes from spending, not from the clock: a
// purchase sends rows by how dear it is next to what the game earns, they
// wait in a queue (the red gauge) and rise under a piece that clears
// nothing, as in a versus game, and clears cancel them first. Rows left
// on the board slow the bots; rows cleared with a technique pay.
export const GARBAGE = {
  // One row per this many seconds of income the price costs, rounded down.
  secondsPerRow: 60,
  maxRowsPerBuy: 4,
  // Rows that rise under one piece that clears nothing.
  maxRowsPerLock: 4,
  // Each garbage row on the manual board takes this much off bot income, up to `penaltyMaxRows` rows.
  penaltyPctPerRow: 5,
  penaltyMaxRows: 10,
  // A garbage row cleared by a technique pays this many seconds of PER SECOND.
  techBonusSeconds: 10,
  // A combo counts as a technique from this step on.
  techComboMin: 4,
  // The hand's PER SECOND that sizes purchases early on: an average over about this long.
  manualWindowSeconds: 60,
  // Buying while a life runs (not paused) is cheaper; buying between lives
  // sends twice the rows, up to `idleMaxRows`. Otherwise every purchase
  // would wait for the READY screen and the board would never feel it.
  // List prices carry `listMarkup` so the live price is the ladder's price
  // (×1.25 ×0.8 = 1) and the ladder's pace holds; between lives costs more.
  listMarkup: 1.25,
  liveDiscountPct: 20,
  idleGarbageMul: 2,
  idleMaxRows: 8,
};

const LIVE: Condition = { type: 'stat', stat: 'lifeLive', gte: 1 };
const IDLE: Condition = { type: 'stat', stat: 'lifeLive', lte: 0 };

export const GARBAGE_EFFECTS: Effect[] = [
  { target: 'price', op: 'mul', value: GARBAGE.listMarkup },
  { target: 'upgrade_price', op: 'mul', value: GARBAGE.listMarkup },
  { target: 'price', op: 'mul_pct', value: -GARBAGE.liveDiscountPct, when: [LIVE] },
  { target: 'upgrade_price', op: 'mul_pct', value: -GARBAGE.liveDiscountPct, when: [LIVE] },
  { target: 'buy_garbage', op: 'mul', value: GARBAGE.idleGarbageMul, when: [IDLE] },
  // The world reports the rows on the board, capped, as the boardGarbage stat.
  { target: 'income', filter: ['board:auto'], op: 'mul_pct', value: -GARBAGE.penaltyPctPerRow, stack: { type: 'stat', stat: 'boardGarbage' } },
];
