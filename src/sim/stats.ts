import type { LockResult } from './game';

// Counters for what the player has done by hand. Upgrade unlocks read them
// through the `stat` condition, so a new counter is all a new kind of
// unlock needs.
export interface Stats {
  manualLines: number; // Lines earned on the manual board
  linesEarned: number; // every Line earned, by hand, by bots and by luck
  manualPieces: number;
  spins: number; // full T-spin clears
  combo5: number; // runs that reached a 5 combo
  b2bs: number; // clears that extended a back-to-back chain
  pcs: number; // perfect clears
  // Risk-weighted Lines: banked manual Lines times the level they were
  // earned at. Prestige is paid from this.
  riskLines: number;
  rounds: number; // lives started
  checkpoints: number;
  deaths: number;
  maxLevel: number; // highest level reached in a life
  goldens: number; // golden pieces that cleared a line
  // For the prestige tech checklist.
  tss: number;
  tsd: number;
  tst: number;
  combo10: number;
  b2b5: number; // back-to-back chains that reached five clears
  tetrises: number;
  // The longest life of the run, in rows cleared and in life time.
  maxLifeRows: number;
  maxLifeSeconds: number;
  wraths: number; // wrath pieces that cleared a line
  ruins: number;
  // Golden or wrath pieces placed without clearing a line.
  goldensLost: number;
  clotTetrises: number; // tetrises cleared while a CLOT runs
  // Life events.
  rivalWins: number;
  invadersSurvived: number;
  helperRows: number;
  // Garbage rows cleared by a technique (each paid a bonus).
  garbageBonusRows: number;
  missionsDone: number;
  // Game time played, in seconds (stepped time; a hidden tab's formula
  // stretch does not count).
  playSeconds: number;
}

export const emptyStats = (): Stats => ({
  manualLines: 0, linesEarned: 0, manualPieces: 0, spins: 0, combo5: 0, b2bs: 0, pcs: 0, riskLines: 0, rounds: 0, checkpoints: 0, deaths: 0, maxLevel: 0, goldens: 0,
  tss: 0, tsd: 0, tst: 0, combo10: 0, b2b5: 0, tetrises: 0, maxLifeRows: 0, maxLifeSeconds: 0,
  wraths: 0, ruins: 0, goldensLost: 0, clotTetrises: 0,
  rivalWins: 0, invadersSurvived: 0, helperRows: 0, garbageBonusRows: 0, missionsDone: 0, playSeconds: 0,
});

// Add one run's counters into lifetime totals; a "max" counter keeps the larger.
export function addStats(into: Stats, run: Stats): void {
  for (const k of Object.keys(run) as (keyof Stats)[]) {
    into[k] = k.startsWith('max') ? Math.max(into[k] ?? 0, run[k]) : (into[k] ?? 0) + run[k];
  }
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
