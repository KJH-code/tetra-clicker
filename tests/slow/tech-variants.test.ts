import { it, expect } from 'vitest';
import { Game, type LockResult } from '../../src/sim/game';
import { playOne, POLICIES } from '../../src/sim/bot/index';

// The bots a play synergy switches to. Their Lines per piece is not held to
// the data file: the synergy pays a fixed ×1.25 instead (src/data/synergies.ts).
function runSkill(skill: string): LockResult[] {
  const out: LockResult[] = [];
  for (const seed of [11, 12, 13]) {
    const g = new Game(seed);
    for (let i = 0; i < 3000; i++) {
      const m = playOne(g, POLICIES[skill]!);
      expect(m).not.toBeNull();
      out.push(m!.result);
    }
  }
  expect(out.filter((r) => r.topped)).toHaveLength(0);
  return out;
}

it('T-SPIN + ALL-SPIN: TSDs still, and singles and triples now too', () => {
  const rs = runSkill('tspin_tst');
  const t = rs.filter((r) => r.piece === 'T' && r.spin === 'full');
  expect(t.filter((r) => r.lines === 2).length / rs.length).toBeGreaterThan(0.1);
  expect(t.filter((r) => r.lines === 1 || r.lines === 3).length).toBeGreaterThan(30);
}, 3_600_000);

it('COMBO + B2B: back to back still, with combos on top', () => {
  const rs = runSkill('b2b_combo');
  expect(rs.filter((r) => r.b2bExtended).length / rs.length).toBeGreaterThan(0.06);
  expect(rs.filter((r) => r.comboIndex === 3).length).toBeGreaterThan(40);
}, 3_600_000);

it('4-WIDE + OPENER: PCs still, a combo after each instead of the TSD', () => {
  const rs = runSkill('opener_combo');
  expect(rs.filter((r) => r.perfectClear).length / rs.length).toBeGreaterThan(0.04);
  expect(rs.filter((r) => r.comboIndex >= 2 && !r.perfectClear).length).toBeGreaterThan(30);
}, 3_600_000);
