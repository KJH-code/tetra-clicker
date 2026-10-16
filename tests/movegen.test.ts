import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { findMoves, replay } from '../src/sim/bot/cc/movegen';
import type { Piece } from '../src/sim/pieces';

function gridFrom(rows: string[]): string {
  return rows.map((r) => r.split('').map((c) => (c === '.' ? '0' : '1')).join('')).join('/');
}

function gameWith(rows: string[], piece: Piece): Game {
  return new Game(0, {
    grid: gridFrom(rows), holds: [], holdUsed: false, graceUsed: 0, shieldSpent: false,
    queue: [piece, 'I', 'O', 'S', 'Z', 'J', 'L'], rng: 1, combo: -1, b2b: -1, active: null,
  });
}

// Every move found, replayed on a fresh game, must land where and how the
// generator said.
function checkAll(rows: string[], piece: Piece) {
  const g0 = gameWith(rows, piece);
  const moves = findMoves(g0.grid, g0.active!);
  for (const m of moves) {
    const g = gameWith(rows, piece);
    expect(replay(g, m.inputs)).toBe(true);
    const before = { ...g.active! };
    const r = g.hardDrop();
    expect({ x: before.x, rot: before.rot }).toMatchObject({ x: m.placement.x, rot: m.placement.rot });
    expect(r.spin).toBe(m.spin);
  }
  return moves;
}

describe('move generation', () => {
  it('on an empty board finds every column and rotation once', () => {
    const moves = checkAll([], 'T');
    // T: 8 + 9 + 8 + 9 distinct landings, no spins.
    expect(moves.length).toBe(34);
    expect(moves.every((m) => m.spin === 'none')).toBe(true);
    expect(checkAll([], 'O').length).toBe(9);
    // I, S and Z have mirror-identical rotations: 7 + 10 and 8 + 9.
    expect(checkAll([], 'I').length).toBe(17);
    expect(checkAll([], 'S').length).toBe(17);
  });

  it('finds the T-spin double in a classic slot, and its inputs replay to one', () => {
    const tsd = ['XXX.......', 'XX...XXXXX', 'XXX.XXXXXX'];
    const moves = checkAll(tsd, 'T');
    const spins = moves.filter((m) => m.spin === 'full');
    expect(spins.length).toBeGreaterThan(0);
    const g = gameWith(tsd, 'T');
    const m = spins.find((s) => s.placement.rot === 2)!;
    replay(g, m.inputs);
    expect(g.hardDrop().lines).toBe(2);
    // The path starts at spawn and ends where the piece locks.
    expect(m.path[0]).toEqual(gameWith(tsd, 'T').active);
    expect(m.path[m.path.length - 1]).toEqual(m.placement);
  });

  it('finds an S spin under an overhang', () => {
    // S fits only by turning into the notch: an immobile all-spin.
    const rows = ['......X...', 'XXXXX..XXX', 'XXXX..XXXX'];
    const moves = checkAll(rows, 'S');
    expect(moves.some((m) => m.spin === 'full')).toBe(true);
  });

  it('is fast enough for a bot: a messy board in a few milliseconds', () => {
    const rows = ['..X.X...X.', 'X.XXX.X.XX', 'XX.XXXX.XX', 'XXXX.XXXXX', 'XXXXXXX.XX'];
    const g = gameWith(rows, 'T');
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) findMoves(g.grid, g.active!);
    expect((performance.now() - t0) / 50).toBeLessThan(5);
  });
});
