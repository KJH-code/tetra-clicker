import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { playOne } from '../src/sim/bot/index';
import { botAttack } from '../src/sim/attack';
import { tspinBot, b2bBot, comboBot, allspinBot } from '../src/sim/bot/techBots';
import type { LockResult } from '../src/sim/game';

function run(make: () => ReturnType<typeof tspinBot>, n: number, seed = 1): LockResult[] {
  const g = new Game(seed);
  const bot = make();
  const out: LockResult[] = [];
  for (let i = 0; i < n; i++) {
    const m = playOne(g, bot);
    expect(m).not.toBeNull();
    out.push(m!.result);
  }
  return out;
}

describe('technique bots (short runs; long ones live in tests/slow)', () => {
  it('T-SPIN spins doubles and never a single or triple', () => {
    const rs = run(tspinBot, 150);
    expect(rs.filter((r) => r.topped)).toHaveLength(0);
    expect(rs.filter((r) => r.piece === 'T' && r.spin === 'full' && r.lines === 2).length).toBeGreaterThan(0);
    expect(rs.filter((r) => r.piece === 'T' && r.spin === 'full' && (r.lines === 1 || r.lines === 3))).toHaveLength(0);
  }, 60_000);

  it('B2B keeps chains going', () => {
    const rs = run(b2bBot, 150);
    expect(rs.filter((r) => r.topped)).toHaveLength(0);
    expect(rs.filter((r) => r.b2bExtended).length).toBeGreaterThan(3);
  }, 60_000);

  it('COMBO builds and cuts into combos', () => {
    const rs = run(comboBot, 300, 2);
    expect(rs.filter((r) => r.topped)).toHaveLength(0);
    expect(Math.max(...rs.map((r) => r.comboIndex))).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it('ALL-SPIN lands spins with pieces other than T', () => {
    const rs = run(allspinBot, 200, 2);
    expect(rs.filter((r) => r.topped)).toHaveLength(0);
    expect(rs.filter((r) => r.spin === 'full' && r.lines > 0).length).toBeGreaterThan(0);
  }, 60_000);
});

describe('bots are paid for their own technique only', () => {
  const r = (over: Partial<LockResult>): LockResult => ({
    piece: 'T', lines: 2, spin: 'full', perfectClear: false, comboIndex: 3, b2bExtended: true, topped: false, clearedRows: [], ...over,
  });
  it('a T-SPIN bot gets the T-spin value but no combo or B2B', () => {
    expect(botAttack(r({}), 'tspin')).toBe(8);
  });
  it('a B2B bot gets +20% on a plain double for its TSD', () => {
    expect(botAttack(r({}), 'b2b')).toBeCloseTo(5 * 1.2, 10);
  });
  it('a COMBO bot gets the combo on a plain value', () => {
    expect(botAttack(r({ piece: 'I', spin: 'none', lines: 1, b2bExtended: false }), 'combo')).toBeCloseTo(2 * 1.2, 10);
  });
  it('an ALL-SPIN bot gets all-spins ×1.5 and T-spins', () => {
    expect(botAttack(r({ piece: 'S', b2bExtended: false, comboIndex: 0 }), 'allspin')).toBe(7.5);
    expect(botAttack(r({ b2bExtended: false, comboIndex: 0 }), 'allspin')).toBe(8);
  });
  it('a bot without a technique gets none', () => {
    expect(botAttack(r({}))).toBe(5);
  });
});
