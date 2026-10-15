import { cellAt, type Grid, type Placement, collides } from './board';

export type SpinKind = 'none' | 'mini' | 'full';

// Index into the kick table of the offset that succeeded; the fifth SRS kick
// (index 4) is the one that lets a T slip into a slot from the side, and the
// guideline rewards it as a full spin even when only one front corner is filled.
export const FULL_SPIN_KICK_INDEX = 4;

export interface SpinContext {
  lastActionWasRotation: boolean;
  lastKickIndex: number;
}

// T pieces use the three-corner rule every guideline game agrees on; every
// other piece uses the immobility test, which is what "all-spin" means. Their
// spins currently earn the same as a plain clear, so only the tag is affected.
export function detectSpin(grid: Grid, p: Placement, ctx: SpinContext): SpinKind {
  if (!ctx.lastActionWasRotation) return 'none';
  if (p.piece === 'O') return 'none';
  if (p.piece === 'T') return tSpin(grid, p, ctx);
  return isImmobile(grid, p) ? 'full' : 'none';
}

function tSpin(grid: Grid, p: Placement, ctx: SpinContext): SpinKind {
  // The T's centre is the middle of its 3x3 box.
  const cx = p.x + 1;
  const cy = p.y + 1;
  const nw = cellAt(grid, cx - 1, cy - 1) !== 0;
  const ne = cellAt(grid, cx + 1, cy - 1) !== 0;
  const sw = cellAt(grid, cx - 1, cy + 1) !== 0;
  const se = cellAt(grid, cx + 1, cy + 1) !== 0;
  const count = Number(nw) + Number(ne) + Number(sw) + Number(se);
  if (count < 3) return 'none';
  const fronts: Record<number, [boolean, boolean]> = {
    0: [nw, ne],
    1: [ne, se],
    2: [sw, se],
    3: [nw, sw],
  };
  const [a, b] = fronts[p.rot]!;
  if (a && b) return 'full';
  return ctx.lastKickIndex === FULL_SPIN_KICK_INDEX ? 'full' : 'mini';
}

export function isImmobile(grid: Grid, p: Placement): boolean {
  return (
    collides(grid, { ...p, x: p.x - 1 }) &&
    collides(grid, { ...p, x: p.x + 1 }) &&
    collides(grid, { ...p, y: p.y - 1 })
  );
}
