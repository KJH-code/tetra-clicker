// The project's own attack table (not TETR.IO's: patches there would shake
// the economy). Lines sent by one placement, before combo and back-to-back.
// Convex at the start on purpose: a piece clears 0.4 rows on average
// whatever the clear size, so 1/2/3/4 would pay singles and triples the same
// per piece. The ratios (1 : 2.5 : 4.5 : 7, spins 2/4/6, PC 10) are the
// design; the unit is doubled so every entry is a whole number. Do not
// change the ratios.
export const ATTACK = {
  // index = lines cleared (1..4)
  normal: [0, 2, 5, 9, 14] as const,
  // full T-spin single / double / triple
  tspin: [0, 4, 8, 12, 12] as const,
  // Combo multiplier is 1 + 0.1 * COMBO[index]; the index is the number of
  // consecutive clears before this one, and runs past the end stay at 5.
  combo: [0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 5] as const,
  comboStep: 0.1,
  // Keeping a back-to-back chain alive multiplies the clear by this.
  b2bMultiplier: 1.2,
  // A perfect clear replaces the base value outright; combo and b2b still apply.
  perfectClear: 20,
} as const;
