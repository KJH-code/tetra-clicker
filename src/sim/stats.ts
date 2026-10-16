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
  // For the prestige tech checklist.
  tss: number;
  tsd: number;
  tst: number;
  combo10: number;
  b2b5: number; // back-to-back chains that reached five clears
  tetrises: number;
  hotSettles: number; // rounds settled at high danger
}

export const emptyStats = (): Stats => ({
  manualLines: 0, manualPieces: 0, spins: 0, combo5: 0, b2bs: 0, pcs: 0, riskLines: 0, rounds: 0, roundsSettled: 0, goldens: 0,
  tss: 0, tsd: 0, tst: 0, combo10: 0, b2b5: 0, tetrises: 0, hotSettles: 0,
});

// Add one run's counters into lifetime totals.
export function addStats(into: Stats, run: Stats): void {
  for (const k of Object.keys(run) as (keyof Stats)[]) into[k] = (into[k] ?? 0) + run[k];
}

// The combo index the HUD shows as "5 COMBO".
const COMBO_MILESTONE = 5;

export function recordManual(s: Stats, r: LockResult, earned: number): void {
  s.manualPieces += 1;
  s.manualLines += earned;
  if (r.lines > 0 && r.piece === 'T' && r.spin === 'full') {
    s.spins += 1;
    if (r.lines === 1) s.tss += 1;
    if (r.lines === 2) s.tsd += 1;
    if (r.lines === 3) s.tst += 1;
  }
  if (r.lines === 4) s.tetrises += 1;
  if (r.comboIndex === 10) s.combo10 += 1;
  if (r.comboIndex === COMBO_MILESTONE) s.combo5 += 1;
  if (r.b2bExtended) s.b2bs += 1;
  if (r.perfectClear) s.pcs += 1;
}
