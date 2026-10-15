import { describe, it, expect } from 'vitest';
import { deserializeGrid, fullRowsIfLocked, HEIGHT, serializeGrid } from '../src/sim/board';

describe('fullRowsIfLocked', () => {
  it('counts each row once whatever the rotation state', () => {
    // Three rows with gaps at column 3 (and column 2 in the middle one); a
    // vertical T pointing left (rot 3) fills all of them. Its cell list is not
    // row-sorted, so the middle row must not be counted twice.
    const g = deserializeGrid('1110111111/1100111111/1110111111');
    const p = { piece: 'T' as const, rot: 3 as const, x: 2, y: HEIGHT - 3 };
    expect(fullRowsIfLocked(g, p)).toBe(3);
    expect(serializeGrid(g)).toBe('1110111111/1100111111/1110111111'); // untouched
  });
  it('reports zero for a placement that completes nothing', () => {
    const g = deserializeGrid('1111111110');
    expect(fullRowsIfLocked(g, { piece: 'O', rot: 0, x: 0, y: HEIGHT - 3 })).toBe(0);
  });
});
