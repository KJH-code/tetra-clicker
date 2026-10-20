// Life events: something turns up on the manual board for a while. From
// level 3, every 2–5 minutes of life time (its own timer, apart from golden
// pieces). Half the draw at level 3 is the kind ones (helper, bonus round,
// mystery); the ones that fight back (rival, invader, boss) and the tech
// challenge grow with the level up to level 15.
// Attack between boards is the attack table in garbage rows: table value
// ÷ 2, so a single is one row and a tetris seven.
export type EventKind = 'rival' | 'invader' | 'helper' | 'bonus' | 'boss' | 'tech' | 'mystery';
export const GOOD_EVENTS: readonly EventKind[] = ['helper', 'bonus', 'mystery'];

export const EVENTS = {
  fromLevel: 3,
  minSeconds: 120,
  maxSeconds: 300,
  // Draw weights at a level.
  weights: (level: number): Record<EventKind, number> => {
    const up = 1 + Math.min(12, Math.max(0, level - 3)) * 0.25;
    return { rival: up, invader: up, boss: up, tech: 0.5 * up, helper: 1, bonus: 1.5, mystery: 1 };
  },
  // A bot on a board of its own beside yours, trading garbage until one of
  // you tops out. Stronger at higher levels; beating it pays this many
  // seconds of PER SECOND per level into the vault. `pace` is the
  // rival_pace effect: 0.5 in normal runs, where a 2-PPS rival outran
  // the 0.7-PPS player the game is pitched at (cap 1), and 1 in hardcore.
  rival: {
    pace: 0.5,
    pps: (level: number, pace = 1): number => Math.min(2 * pace, 0.5 + 0.06 * level * pace),
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
  // Manual income ×incomeMul for 30 s.
  bonus: { seconds: 30, incomeMul: 4.5 },
  // HP in garbage rows of attack (table value ÷ 2), level × hpPerLevel;
  // every attackSeconds it queues attackRows at you, which your attack
  // cancels first, as against a rival. Gone after `seconds` if alive.
  // Killing it pays PER SECOND × level × rewardMinutes into the vault.
  boss: { seconds: 90, hpPerLevel: 10, attackSeconds: 6, attackRows: 2, maxRowsPerLock: 4, rewardMinutes: 4.5 },
  // A technique so many times in 60 s pays rewardMinutes of PER SECOND.
  tech: {
    seconds: 60,
    rewardMinutes: 4.5,
    goals: [
      { id: 'tetris', label: 'TETRIS', count: 2 },
      { id: 'tspin', label: 'T-SPIN', count: 2 },
      { id: 'b2b', label: 'B2B', count: 3 },
      { id: 'combo5', label: '5 COMBO', count: 1 },
    ] as const,
  },
  // NEXT hidden behind ? for 20 s; manual income ×incomeMul meanwhile.
  mystery: { seconds: 20, incomeMul: 3 },
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
