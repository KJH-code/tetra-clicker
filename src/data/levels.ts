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
  // Resting piece: lock after this long; moves and turns reset it, up to the limit.
  lockDelayMs: 500,
  lockResetLimit: 15,
  // Share of the unbanked vault kept on a top-out (prestige raises it).
  retain: 0,
} as const;

export function gravityAt(level: number): number {
  const i = Math.max(1, Math.floor(level)) - 1;
  return i < LEVELS.gravity.length ? LEVELS.gravity[i]! : Infinity;
}

export function garbageSecondsAt(level: number, fromLevel: number = LEVELS.garbageFromLevel): number | null {
  if (level < fromLevel) return null;
  return Math.max(LEVELS.garbageMinSeconds, LEVELS.garbageSecondsAtLevel1 / level);
}

// Grid id for garbage cells; piece colours use 1..7.
export const GARBAGE_ID = 8;
// Cheese: a garbage row whose hole moved. Drawn the same, paid more by bots.
export const CHEESE_ID = 9;
