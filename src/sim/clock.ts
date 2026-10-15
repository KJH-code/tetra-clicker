// How a gap between two ticks is treated. The browser throttles timers in
// hidden tabs (Chrome: once a minute after five minutes), so ticks can be
// seconds or minutes apart while the computer is awake. A gap beyond the
// sleep threshold means the machine itself was off or asleep: no income.
export type GapKind = 'sim' | 'formula' | 'sleep';

export const SIM_GAP_MS = 2_000;
export const SLEEP_GAP_MS = 120_000;

export function classifyGap(gapMs: number): GapKind {
  if (gapMs > SLEEP_GAP_MS) return 'sleep';
  if (gapMs > SIM_GAP_MS) return 'formula';
  return 'sim';
}

// Fixed simulation step. Bots run at whole-piece granularity, so a step only
// needs to be fine enough for smooth piece timing in the renderer.
export const STEP_MS = 1000 / 60;

// Long-run lines cleared per piece when the stack stays bounded: a piece is
// four cells and a row is ten, so 0.4 rows per piece on average. The bot
// test checks this against the real simulation.
export const LINES_PER_PIECE = 0.4;
