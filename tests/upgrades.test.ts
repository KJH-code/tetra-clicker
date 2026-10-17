import { describe, it, expect } from 'vitest';
import { UPGRADES, milestonesFor, upgradeById } from '../src/data/upgrades';
import { BUILDINGS } from '../src/data/buildings';
import { Economy } from '../src/sim/economy';
import { conditionMet, flagCount } from '../src/sim/effects';
import { recordManual, emptyStats } from '../src/sim/stats';
import type { LockResult } from '../src/sim/game';

const lock = (over: Partial<LockResult>): LockResult => ({
  piece: 'I', lines: 0, spin: 'none', perfectClear: false, comboIndex: -1, b2bExtended: false, topped: false, clearedRows: [], ...over,
});

describe('upgrade data', () => {
  it('generates five milestones for every building', () => {
    const ms = UPGRADES.filter((u) => u.group === 'milestone');
    expect(ms).toHaveLength(BUILDINGS.length * 5);
    expect(new Set(UPGRADES.map((u) => u.id)).size).toBe(UPGRADES.length);
  });

  it('a new building gets its milestones from the template', () => {
    const ms = milestonesFor({ id: 'tspin', name: 'T-SPIN', basePrice: 3000 });
    expect(ms.map((u) => u.id)).toEqual(['ms_tspin_1', 'ms_tspin_5', 'ms_tspin_25', 'ms_tspin_50', 'ms_tspin_100']);
    expect(ms.map((u) => u.price)).toEqual([30_000, 150_000, 1_500_000, 150_000_000, 15_000_000_000]);
    expect(ms[0]!.effects[0]).toEqual({ target: 'income', filter: ['building:tspin'], op: 'mul', value: 2 });
  });
});

describe('upgrade unlocks and purchase', () => {
  it('milestone opens at the owned count and needs the previous step', () => {
    const e = new Economy();
    e.balance = 1e12;
    expect(e.isUpgradeUnlocked('ms_single_1')).toBe(false);
    e.setOwned('single', 5);
    expect(e.isUpgradeUnlocked('ms_single_1')).toBe(true);
    expect(e.isUpgradeUnlocked('ms_single_5')).toBe(false); // chain: step 1 not bought
    expect(e.buyUpgrade('ms_single_1')).toBe(true);
    expect(e.isUpgradeUnlocked('ms_single_1')).toBe(false); // bought
    expect(e.isUpgradeUnlocked('ms_single_5')).toBe(true);
  });

  it('stat conditions read the manual stats', () => {
    const e = new Economy();
    expect(conditionMet({ type: 'stat', stat: 'manualLines', gte: 200 }, e)).toBe(false);
    e.stats.manualLines = 200;
    expect(conditionMet({ type: 'stat', stat: 'manualLines', gte: 200 }, e)).toBe(true);
    expect(e.isUpgradeUnlocked('manual_200')).toBe(true);
  });

  it('refuses an upgrade it cannot afford and charges the price', () => {
    const e = new Economy();
    e.setOwned('single', 1);
    const price = upgradeById('ms_single_1')!.price;
    e.balance = price - 1;
    expect(e.buyUpgrade('ms_single_1')).toBe(false);
    e.balance = price;
    expect(e.buyUpgrade('ms_single_1')).toBe(true);
    expect(Number(e.balance)).toBe(0);
  });
});

describe('upgrade effects', () => {
  it('milestones double only their building, and stack', () => {
    const e = new Economy();
    e.setOwned('single', 5);
    e.setOwned('double', 1);
    const single = ['board:auto', 'building:single', 'clear:single'];
    const double = ['board:auto', 'building:double', 'clear:double'];
    const base = e.incomeMultiplier(single);
    e.upgrades.add('ms_single_1');
    expect(e.incomeMultiplier(single)).toBeCloseTo(base * 2, 10);
    e.upgrades.add('ms_single_5');
    expect(e.incomeMultiplier(single)).toBeCloseTo(base * 4, 10);
    expect(e.incomeMultiplier(double)).toBe(1);
    expect(e.incomeMultiplier(['board:manual', 'clear:single'])).toBe(1);
  });

  it('manual ×2 applies to the manual board only', () => {
    const e = new Economy();
    e.upgrades.add('manual_200');
    expect(e.incomeMultiplier(['board:manual', 'clear:single'])).toBe(2);
    expect(e.incomeMultiplier(['board:auto', 'building:single', 'clear:single'])).toBe(1);
  });

  it('technique multipliers follow their tag', () => {
    const e = new Economy();
    e.upgrades.add('spin_1');
    e.upgrades.add('spin_2');
    expect(e.incomeMultiplier(['board:manual', 'tech:spin'])).toBeCloseTo(3, 10);
    expect(e.incomeMultiplier(['board:manual', 'tech:b2b'])).toBe(1);
  });

  it('rule flags count their steps', () => {
    const e = new Economy();
    expect(flagCount(e.effects, 'rule:combo_grace', e)).toBe(0);
    e.upgrades.add('grace_1');
    expect(flagCount(e.effects, 'rule:combo_grace', e)).toBe(1);
    e.upgrades.add('grace_2');
    expect(flagCount(e.effects, 'rule:combo_grace', e)).toBe(2);
    expect(flagCount(e.effects, 'rule:hold2', e)).toBe(0);
    expect(upgradeById('hold2')?.rule).toBe(true);
  });
});

describe('manual stats', () => {
  it('counts pieces, Lines and techniques', () => {
    const s = emptyStats();
    recordManual(s, lock({}), 0);
    recordManual(s, lock({ piece: 'T', spin: 'full', lines: 2, comboIndex: 0 }), 4);
    recordManual(s, lock({ lines: 4, comboIndex: 5, b2bExtended: true }), 8.4);
    recordManual(s, lock({ lines: 1, perfectClear: true, comboIndex: 6 }), 10);
    recordManual(s, lock({ piece: 'T', spin: 'mini', lines: 1, comboIndex: 0 }), 1);
    expect(s).toEqual({ manualPieces: 5, manualLines: 23.4, spins: 1, combo5: 1, b2bs: 1, pcs: 1, riskLines: 0, rounds: 0, checkpoints: 0, deaths: 0, maxLevel: 0, goldens: 0,
      tss: 0, tsd: 1, tst: 0, combo10: 0, b2b5: 0, tetrises: 1, maxLifeRows: 0, maxLifeSeconds: 0 });
  });
});
