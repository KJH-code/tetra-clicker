import type { Effect } from '../sim/effects';

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
};

export const GARBAGE_EFFECTS: Effect[] = [
  // The world reports the rows on the board, capped, as the boardGarbage stat.
  { target: 'income', filter: ['board:auto'], op: 'mul_pct', value: -GARBAGE.penaltyPctPerRow, stack: { type: 'stat', stat: 'boardGarbage' } },
];
