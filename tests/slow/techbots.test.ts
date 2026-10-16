import { describe, it, expect } from 'vitest';
import { Game, type LockResult } from '../../src/sim/game';
import { playOne } from '../../src/sim/bot/index';
import { POLICIES } from '../../src/sim/bot/index';
import { botAttack } from '../../src/sim/attack';
import { BUILDINGS } from '../../src/data/buildings';

// Long runs of the technique bots: they never top out, they do their
// technique, and what they earn per piece is the measured value the
// hidden-tab formula uses (the data file was measured on these seeds).
const SEEDS = [11, 12, 13];
const PIECES = 3000;

function runAll(id: string): { results: LockResult[]; paid: number } {
  const def = BUILDINGS.find((b) => b.id === id)!;
  const results: LockResult[] = [];
  let paid = 0;
  for (const seed of SEEDS) {
    const g = new Game(seed);
    for (let i = 0; i < PIECES; i++) {
      const m = playOne(g, POLICIES[def.skill]!)!;
      expect(m).not.toBeNull();
      results.push(m.result);
      paid += botAttack(m.result, def.tech);
    }
  }
  return { results, paid };
}

describe('technique bots over 9,000 pieces', () => {
  const cases: [string, (rs: LockResult[]) => void][] = [
    ['tspin', (rs) => {
      const tsd = rs.filter((r) => r.piece === 'T' && r.spin === 'full' && r.lines === 2).length;
      expect(tsd / rs.length).toBeGreaterThan(0.025);
      expect(rs.filter((r) => r.piece === 'T' && r.spin === 'full' && r.lines !== 2 && r.lines > 0)).toHaveLength(0);
    }],
    ['allspin', (rs) => {
      expect(rs.filter((r) => r.spin === 'full' && r.lines > 0 && r.piece !== 'T').length).toBeGreaterThan(20);
    }],
    ['combo', (rs) => {
      expect(Math.max(...rs.map((r) => r.comboIndex))).toBeGreaterThanOrEqual(6);
    }],
    ['b2b', (rs) => {
      expect(rs.filter((r) => r.b2bExtended).length / rs.length).toBeGreaterThan(0.025);
    }],
    ['pc', (rs) => {
      // A PC loop: one per ten pieces, nearly every time.
      expect(rs.filter((r) => r.perfectClear).length / rs.length).toBeGreaterThan(0.09);
    }],
  ];
  for (const [id, check] of cases) {
    it(`${id}: never tops out, does its technique, earns its measured Lines per piece`, () => {
      const { results, paid } = runAll(id);
      expect(results.filter((r) => r.topped)).toHaveLength(0);
      check(results);
      const def = BUILDINGS.find((b) => b.id === id)!;
      expect(Math.abs(paid / results.length - def.linesPerPiece) / def.linesPerPiece).toBeLessThan(0.01);
    }, 1_800_000);
  }
});
