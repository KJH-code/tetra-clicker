// Life events: something turns up on the manual board for a while. From
// level 5, every 3–8 minutes of life time (its own timer, apart from golden
// pieces); the higher the level, the likelier the two that fight back.
// Attack between boards is the attack table in garbage rows: table value
// ÷ 2, so a single is one row and a tetris seven.
export type EventKind = 'rival' | 'invader' | 'helper';

export const EVENTS = {
  fromLevel: 5,
  minSeconds: 180,
  maxSeconds: 480,
  // Draw weights at a level.
  weights: (level: number): Record<EventKind, number> => {
    const up = Math.max(0, level - 5);
    return { rival: 1 + up * 0.25, invader: 1 + up * 0.25, helper: 2 };
  },
  // A bot on a board of its own beside yours, trading garbage until one of
  // you tops out. Stronger at higher levels; beating it pays this many
  // seconds of PER SECOND per level into the vault.
  rival: {
    pps: (level: number): number => Math.min(2, 0.5 + 0.06 * level),
    nodes: (level: number): number => Math.min(4_000, 200 + 150 * level),
    rewardSecondsPerLevel: 120,
    // Rows a board takes at once when it places a piece that clears nothing.
    maxRowsPerLock: 6,
  },
  // Garbage comes three times as fast for 45 s; your attack blocks rows.
  // Surviving adds three times the Lines you made by hand meanwhile.
  // A cheese row every rowSeconds whatever the level: at the old level-scaled
  // rate a high-level invader buried the board in a second a row.
  invader: { seconds: 45, rowSeconds: 3, payout: 3 },
  // For 60 s each clear that keeps a combo or back-to-back going lifts one
  // garbage row off the bottom, paid like a single.
  helper: { seconds: 60 },
};

// The RIVAL building: its board fights yours for as long as a life runs.
// Each rival it puts up after a win plays faster and hits harder; a win
// pays (streak) minutes of PER SECOND per level into the vault.
export const RIVAL_DUEL = {
  ppsPerWin: 0.15,
  attackPerWin: 0.1,
  rewardSecondsPerLevel: 60,
  maxRowsPerLock: 6,
};

// Garbage rows a placement's attack sends.
export const ATTACK_ROWS_PER_LINE = 0.5;
