import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { playOne } from '../src/sim/bot/index';
import { ccBot } from '../src/sim/bot/ccBot';
import { STANDARD, evaluateBoard, reward } from '../src/sim/bot/cc/eval';
import { createGrid, deserializeGrid } from '../src/sim/board';

describe('Cold Clear port', () => {
  it('scores a hole worse than a flat board and a TSD above a single', () => {
    const flat = deserializeGrid('1111111100/1111111100');
    const holed = deserializeGrid('1111111110/1111111100'); // a hole under column 8
    expect(evaluateBoard(STANDARD, flat, false)).toBeGreaterThan(evaluateBoard(STANDARD, holed, false));
    const tsd = reward(STANDARD, { piece: 'T', lines: 2, spin: 'full', perfectClear: false, b2bExtended: false, comboIndex: 0, inputs: 3 });
    const single = reward(STANDARD, { piece: 'I', lines: 1, spin: 'none', perfectClear: false, b2bExtended: false, comboIndex: 0, inputs: 3 });
    expect(tsd).toBeGreaterThan(single);
    expect(evaluateBoard(STANDARD, createGrid(), false)).toBeLessThanOrEqual(0);
  });

  it('plays 200 pieces with stock weights: no top-out, real spins, same moves for the same seed', () => {
    const run = (seed: number) => {
      const g = new Game(seed);
      const bot = ccBot({ weights: STANDARD, width: 4, depth: 2 });
      const log: string[] = [];
      let topped = 0;
      let spins = 0;
      for (let i = 0; i < 200; i++) {
        const m = playOne(g, bot)!;
        expect(m).not.toBeNull();
        if (m.result.topped) topped++;
        if (m.result.spin === 'full' && m.result.lines > 0) spins++;
        log.push(`${m.to.x},${m.to.y},${m.to.rot}`);
      }
      return { topped, spins, log };
    };
    const a = run(3);
    expect(a.topped).toBe(0);
    expect(a.spins).toBeGreaterThan(0);
    expect(run(3).log).toEqual(a.log);
  }, 60_000);
});
