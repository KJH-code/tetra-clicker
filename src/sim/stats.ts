import type { LockResult } from './game';

// Counters for what the player has done by hand. Upgrade unlocks read them
// through the `stat` condition, so a new counter is all a new kind of
// unlock needs.
export interface Stats {
  manualLines: number; // Lines earned on the manual board
  manualPieces: number;
  spins: number; // full T-spin clears
  combo5: number; // runs that reached a 5 combo
  b2bs: number; // clears that extended a back-to-back chain
  pcs: number; // perfect clears
  // Risk-weighted Lines: every manual Line times the danger it was earned at.
  // Prestige will be paid from this; for now it is only recorded.
  riskLines: number;
  rounds: number;
  roundsSettled: number;
  goldens: number; // golden pieces that cleared a line
}

export const emptyStats = (): Stats => ({
  manualLines: 0, manualPieces: 0, spins: 0, combo5: 0, b2bs: 0, pcs: 0, riskLines: 0, rounds: 0, roundsSettled: 0, goldens: 0,
});

// The combo index the HUD shows as "5 COMBO".
const COMBO_MILESTONE = 5;

export function recordManual(s: Stats, r: LockResult, earned: number): void {
  s.manualPieces += 1;
  s.manualLines += earned;
  if (r.lines > 0 && r.piece === 'T' && r.spin === 'full') s.spins += 1;
  if (r.comboIndex === COMBO_MILESTONE) s.combo5 += 1;
  if (r.b2bExtended) s.b2bs += 1;
  if (r.perfectClear) s.pcs += 1;
}
