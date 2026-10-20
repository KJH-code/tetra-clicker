// Every number behind a life on the manual board. Placeholders until
// play-testing tunes them.
//
// A life has no way out but topping out. Clearing rows raises the level
// (marathon style); the level multiplies manual income and speeds up gravity
// and garbage, so every life ends, and how far it gets is the skill.
export const LEVELS = {
  rowsPerLevel: 10,
  startLevel: 1,
  // Every this many rows cleared in a life, the vault is banked.
  checkpointRows: 40,
  // Cells per second at level 1, 2, …; past the end of the table a piece
  // drops straight to the floor (20G). Gentler than guideline marathon so an
  // idle-game player has the first minutes to settle in.
  gravity: [0.5, 0.7, 0.9, 1.2, 1.5, 1.9, 2.3, 2.8, 3.4, 4, 5, 6, 7, 8.5, 10, 12, 14, 16, 18],
  // Cheese garbage from this level on, one row every (seconds ÷ level).
  garbageFromLevel: 3,
  garbageSecondsAtLevel1: 24,
  garbageMinSeconds: 1.5,
  // Levels climb the gravity table at this pace: half in normal runs, so
  // 20G comes at level 39, not 20 (hardcore doubles it back). A 0.7-PPS
  // beginner then tops out around 20, a middling player at 30–40.
  gravityPace: 0.5,
  // Resting piece: lock after this long; moves and turns reset it, up to the limit.
  lockDelayMs: 500,
  lockResetLimit: 15,
  // Once gravity is 20G it has nowhere to go, so the lock delay shrinks
  // instead: this much a level past the first 20G level, to the floor, and
  // the reset budget one less every few levels, so even a grandmaster ends.
  lockDelayStepMs: 15,
  lockDelayMinMs: 200,
  lockResetMin: 8,
  lockResetEveryLevels: 2,
  // Manual Lines are multiplied by the level up to `payFullUntil`, then by
  // `payPerLevel` more a level: ×10 at level 10, ×12.5 at 20, ×17.5 at 40.
  // A plain ×level let a strong player's hand dwarf every bot (×40 at 40);
  // a gentler slope from level 1 slowed the early ladder for everyone.
  payFullUntil: 10,
  payPerLevel: 0.25,
  // Share of the unbanked vault kept on a top-out (prestige raises it).
  retain: 0,
} as const;

// Between two table entries the cells per second are interpolated, so a
// half pace still speeds up every level.
export function levelPay(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return l <= LEVELS.payFullUntil ? l : LEVELS.payFullUntil + LEVELS.payPerLevel * (l - LEVELS.payFullUntil);
}

export function gravityAt(level: number, pace = 1): number {
  const at = (Math.max(1, Math.floor(level)) - 1) * pace;
  const i = Math.floor(at);
  if (i >= LEVELS.gravity.length) return Infinity;
  const lo = LEVELS.gravity[i]!;
  const hi = LEVELS.gravity[i + 1];
  return hi === undefined ? lo : lo + (hi - lo) * (at - i);
}

// The first level whose gravity is 20G at this pace.
export function firstInfiniteLevel(pace = 1): number {
  return 1 + Math.ceil(LEVELS.gravity.length / pace);
}

export function lockAt(level: number, pace = 1): { delayMs: number; resets: number } {
  const past = Math.max(0, Math.floor(level) - firstInfiniteLevel(pace));
  return {
    delayMs: Math.max(LEVELS.lockDelayMinMs, LEVELS.lockDelayMs - LEVELS.lockDelayStepMs * past),
    resets: Math.max(LEVELS.lockResetMin, LEVELS.lockResetLimit - Math.floor(past / LEVELS.lockResetEveryLevels)),
  };
}

export function garbageSecondsAt(level: number, fromLevel: number = LEVELS.garbageFromLevel): number | null {
  if (level < fromLevel) return null;
  return Math.max(LEVELS.garbageMinSeconds, LEVELS.garbageSecondsAtLevel1 / level);
}

// Grid id for garbage cells; piece colours use 1..7.
export const GARBAGE_ID = 8;
// Cheese: a garbage row whose hole moved. Drawn the same, paid more by bots.
export const CHEESE_ID = 9;
