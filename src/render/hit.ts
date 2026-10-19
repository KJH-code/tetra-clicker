import type { LockResult } from '../sim/game';

// How hard a clear lands, 0..8: a single barely registers, a tetris or a
// T-spin double hits, a perfect clear hits hardest. Shake, hit-stop,
// shards, the popup and the thump all scale with it.
export function hitStrength(r: LockResult): number {
  if (r.lines === 0) return 0;
  if (r.perfectClear) return 8;
  let s = r.lines >= 4 ? 4 : r.lines - 1;
  if (r.spin === 'full') s += 2;
  else if (r.spin === 'mini') s += 1;
  if (r.b2bExtended) s += 1;
  if (r.comboIndex >= 4) s += 1;
  return Math.min(8, s);
}

// Hit-stop in ms: none below a triple, about a tenth of a second at the top.
export function hitStopMs(strength: number): number {
  return strength < 2 ? 0 : Math.min(110, 20 + strength * 12);
}
