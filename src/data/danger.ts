// Every number behind the manual board's death elements and rounds. All
// placeholders until play-testing tunes them.
export const DANGER = {
  // Danger climbs with time spent in a round: +1 every five minutes.
  risePerSecond: 1 / 300,
  // Starting danger for wrath stage 0..3; also the floor danger resets to.
  wrathFloor: [0, 0.25, 0.5, 1.0],
  // Wrath III makes danger climb this much faster.
  wrath3RiseMultiplier: 2,
  // Garbage (wrath I+): one line every (seconds ÷ danger), never faster than the minimum.
  garbageSecondsAtDanger1: 8,
  garbageMinSeconds: 1.5,
  // Gravity (wrath II+): cells per second per point of danger.
  gravityPerDanger: 1,
  // Lock delay once gravity is on; moves and turns reset it, up to the limit.
  lockDelayMs: 500,
  lockResetLimit: 15,
  // Share of the round vault lost on a top-out.
  forfeit: 0.4,
  // Settling: press the key twice within the tap window, then survive the countdown.
  settleCountdownMs: 3000,
  settleDoubleTapMs: 400,
} as const;

// Grid id for garbage cells; piece colours use 1..7.
export const GARBAGE_ID = 8;
