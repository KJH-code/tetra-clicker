import { describe, it, expect } from 'vitest';
import { World } from '../../src/sim/world';
import { BUILDINGS } from '../../src/data/buildings';

// Long runs of the real bots checked against the hidden-tab formula. Kept out
// of the fast suite that gates deploys; CI runs them as a separate job.
describe('catch-up formula vs the real bot', () => {
  it('10,000 bot pieces earn within 1% of seconds × PPS × 0.8 × multiplier', () => {
    const w = new World(3);
    w.awardAchievements = false; // the formula is checked without their +1% steps
    w.economy.balance = 1e9;
    w.buy('single');
    w.buy('single');
    w.buy('single'); // multiplier 1.2
    // At the top bot level from the start, so the level (×2) holds through
    // the run instead of climbing with its singles.
    w.botXp['single'] = 1e9;
    w.economy.botLevels['single'] = 20;
    w.economy.balance = 0;
    w.advance(0);
    const pieces = 10_000;
    for (let i = 1; i <= pieces; i++) w.advance(i * 1000); // one piece per second at PPS 1
    const simulated = Number(w.economy.balance);
    const formula = pieces * 1 * 0.8 * 1.2 * 2; // 0.4 rows a piece, two Lines a single, level ×2
    expect(Math.abs(simulated - formula) / formula).toBeLessThan(0.01);
  }, 120_000);
});

describe('catch-up formula per building', () => {
  for (const id of ['double', 'triple', 'tetris']) {
    it(`${id}: 10,000 bot pieces earn within 1% of the formula`, () => {
      const w = new World(11);
      w.economy.balance = 1e9;
      for (const b of BUILDINGS) { w.buy(b.id); if (b.id === id) break; }
      // Only the building under test keeps its board: the others are dropped so
      // their income does not blur the comparison.
      w.autoBoards = w.autoBoards.filter((b) => b.buildingId === id);
      // Top level from the start: the formula reads the level as it stands.
      w.botXp[id] = 1e9;
      w.economy.botLevels[id] = 20;
      w.economy.balance = 0;
      w.advance(0);
      const pieces = 10_000;
      for (let i = 1; i <= pieces; i++) w.advance(i * 1000);
      const expected = pieces * w.incomePerSecond();
      const events = w.drainEvents().filter((e) => e.type === 'botMove');
      const def = BUILDINGS.find((b) => b.id === id)!;
      for (const e of events) {
        if (e.type !== 'botMove') continue;
        expect(e.move.result.lines).toBeLessThanOrEqual(def.clearSize);
        expect(e.move.result.topped).toBe(false);
      }
      // The data file's measured constant must match the bot it describes.
      expect(Math.abs(Number(w.economy.balance) - expected) / expected).toBeLessThan(0.01);
    }, 300_000);
  }
});
