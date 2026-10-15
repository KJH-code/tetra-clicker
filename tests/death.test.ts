import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { HEIGHT, WIDTH, serializeGrid } from '../src/sim/board';
import { DANGER, GARBAGE_ID } from '../src/data/danger';
import type { Piece } from '../src/sim/pieces';

function gridFrom(rows: string[]): string {
  return rows.map((r) => r.split('').map((c) => (c === '.' ? '0' : '1')).join('')).join('/');
}
function gameWith(rows: string[], queue: Piece[] = ['T', 'I', 'O', 'S', 'Z', 'J', 'L']): Game {
  return new Game(0, { grid: gridFrom(rows), holds: [], holdUsed: false, queue, rng: 1, combo: -1, b2b: -1, active: null, graceUsed: 0, shieldSpent: false });
}

describe('garbage', () => {
  it('pushes a cheese row in from the bottom with exactly one hole', () => {
    const g = gameWith(['XXXXX.....']);
    expect(g.addGarbage(3)).toBe(false);
    const bottom = Array.from(g.grid.subarray((HEIGHT - 1) * WIDTH, HEIGHT * WIDTH));
    expect(bottom.filter((c) => c === 0)).toHaveLength(1);
    expect(bottom[3]).toBe(0);
    expect(bottom[0]).toBe(GARBAGE_ID);
    // The old bottom row moved up one.
    expect(serializeGrid(g.grid).split('/')[0]).toBe('1111100000');
  });

  it('lifts the active piece when the stack rises into it', () => {
    const rows: string[] = [];
    for (let i = 0; i < 10; i++) rows.push('XXXXXXXXX.');
    const g = gameWith(rows);
    while (g.softDrop()) { /* rest on the stack */ }
    const resting = g.active!.y;
    expect(g.addGarbage(9)).toBe(false);
    expect(g.active!.y).toBe(resting - 1);
  });

  it('reports a top-out when blocks are pushed off the matrix', () => {
    const g = gameWith([]);
    // Fill the very top row of the buffer.
    for (let x = 0; x < WIDTH; x++) g.grid[x] = 1;
    expect(g.addGarbage(0)).toBe(true);
  });
});

describe('gravity and lock delay', () => {
  it('no gravity, no fall and no auto-lock', () => {
    const g = gameWith([]);
    const y = g.active!.y;
    expect(g.tick(10_000, 0)).toBeNull();
    expect(g.active!.y).toBe(y);
  });

  it('falls at the given rate', () => {
    const g = gameWith([]);
    const y = g.active!.y;
    g.tick(1000, 2);
    expect(g.active!.y).toBe(y + 2);
  });

  it('locks after the lock delay once resting', () => {
    const g = gameWith([]);
    while (g.softDrop()) { /* to the floor */ }
    expect(g.tick(DANGER.lockDelayMs - 1, 1)).toBeNull();
    const r = g.tick(1, 1);
    expect(r).not.toBeNull();
    expect(r!.piece).toBe('T');
  });

  it('moves reset the lock delay, but only up to the limit', () => {
    const g = gameWith([]);
    while (g.softDrop()) { /* floor */ }
    let resets = 0;
    let locked = false;
    for (let i = 0; i < 40 && !locked; i++) {
      if (g.tick(DANGER.lockDelayMs - 10, 1)) { locked = true; break; }
      const moved = i % 2 === 0 ? g.moveLeft() : g.moveRight();
      if (moved) resets++;
    }
    expect(locked).toBe(true);
    expect(resets).toBeGreaterThanOrEqual(DANGER.lockResetLimit);
    expect(resets).toBeLessThanOrEqual(DANGER.lockResetLimit + 1);
  });
});
