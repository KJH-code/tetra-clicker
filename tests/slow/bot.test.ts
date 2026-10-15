import { describe, it, expect } from 'vitest';
import { Game } from '../../src/sim/game';
import { playOne } from '../../src/sim/bot/index';
import { singleBot } from '../../src/sim/bot/singleBot';
import { columnHeight, WIDTH } from '../../src/sim/board';

const PIECES = 10_000;
const SEEDS = [1, 2, 3, 4, 5];

describe('single bot', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: ${PIECES} pieces, only single clears, never tops out`, () => {
      const game = new Game(seed);
      let multi = 0;
      let topped = 0;
      let singles = 0;
      let maxHeight = 0;
      for (let i = 0; i < PIECES; i++) {
        const move = playOne(game, singleBot);
        expect(move).not.toBeNull();
        const r = move!.result;
        if (r.lines > 1) multi++;
        if (r.lines === 1) singles++;
        if (r.topped) topped++;
        for (let x = 0; x < WIDTH; x++) maxHeight = Math.max(maxHeight, columnHeight(game.grid, x));
      }
      expect(multi).toBe(0);
      expect(topped).toBe(0);
      // Long-run average is 0.4 lines per piece if the stack stays bounded.
      expect(singles / PIECES).toBeGreaterThan(0.38);
      expect(maxHeight).toBeLessThan(16);
    }, 120_000);
  }
});
