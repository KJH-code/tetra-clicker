import { describe, it, expect } from 'vitest';
import { Game } from '../../src/sim/game';
import { playOne, POLICIES } from '../../src/sim/bot/index';
import { columnHeight, WIDTH } from '../../src/sim/board';

const PIECES = 10_000;
const SEEDS = [1, 2, 3, 4, 5];

// Each building's bot never clears more than its size and never tops out,
// the same bar the single bot had to clear. Income is checked against the
// data file's measured constant in world.test.ts.
describe.each([
  ['double', 2],
  ['triple', 3],
  ['tetris', 4],
] as const)('%s bot', (skill, k) => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: ${PIECES} pieces, only ${k}-row clears, never tops out`, () => {
      const game = new Game(seed);
      const policy = POLICIES[skill]!;
      let wrong = 0;
      let topped = 0;
      let rows = 0;
      let maxHeight = 0;
      for (let i = 0; i < PIECES; i++) {
        const move = playOne(game, policy);
        expect(move).not.toBeNull();
        const r = move!.result;
        if (r.lines > k) wrong++;
        rows += r.lines;
        if (r.topped) topped++;
        for (let x = 0; x < WIDTH; x++) maxHeight = Math.max(maxHeight, columnHeight(game.grid, x));
      }
      expect(wrong).toBe(0);
      expect(topped).toBe(0);
      // A bounded stack clears 0.4 rows per piece in the long run.
      expect(rows / PIECES).toBeGreaterThan(0.38);
      expect(maxHeight).toBeLessThan(16);
    }, 300_000);
  }
});
