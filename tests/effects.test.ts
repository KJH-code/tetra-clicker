import { describe, it, expect } from 'vitest';
import { evaluate, multiplier, flag, type Effect, type EffectContext } from '../src/sim/effects';
import { Economy } from '../src/sim/economy';
import { format } from '../src/sim/num';

const ctx = (owned: Record<string, number>): EffectContext => ({ owned: (id) => owned[id] ?? 0 });

describe('effect evaluation order', () => {
  it('add_pct values are summed, then mul values multiplied', () => {
    const effects: Effect[] = [
      { target: 'income', op: 'add_pct', value: 10 },
      { target: 'income', op: 'add_pct', value: 20 },
      { target: 'income', op: 'mul', value: 2 },
      { target: 'income', op: 'mul', value: 1.5 },
    ];
    // (1 + 0.3) * 2 * 1.5 = 3.9, not (1.1 * 1.2) * 3
    expect(multiplier(effects, 'income', [], ctx({}))).toBeCloseTo(3.9, 10);
    expect(evaluate(effects, 'income', [], ctx({}), 10)).toBeCloseTo(39, 10);
  });
  it('filters match only when every tag is present', () => {
    const effects: Effect[] = [{ target: 'income', filter: ['board:auto', 'building:single'], op: 'add_pct', value: 50 }];
    expect(multiplier(effects, 'income', ['board:auto', 'building:single', 'clear:single'], ctx({}))).toBe(1.5);
    expect(multiplier(effects, 'income', ['board:auto'], ctx({}))).toBe(1);
    expect(multiplier(effects, 'price', ['board:auto', 'building:single'], ctx({}))).toBe(1);
  });
  it('stack scales by owned count with offset', () => {
    const effects: Effect[] = [{ target: 'income', op: 'add_pct', value: 10, stack: { type: 'owned', id: 'single', offset: -1 } }];
    expect(multiplier(effects, 'income', [], ctx({ single: 0 }))).toBe(1);
    expect(multiplier(effects, 'income', [], ctx({ single: 1 }))).toBe(1);
    expect(multiplier(effects, 'income', [], ctx({ single: 3 }))).toBeCloseTo(1.2, 10);
  });
  it('conditions gate effects', () => {
    const effects: Effect[] = [{ target: 'income', op: 'mul', value: 2, when: [{ type: 'owned', id: 'single', gte: 5 }] }];
    expect(multiplier(effects, 'income', [], ctx({ single: 4 }))).toBe(1);
    expect(multiplier(effects, 'income', [], ctx({ single: 5 }))).toBe(2);
  });
  it('flags turn on features', () => {
    const effects: Effect[] = [{ target: 'allow_mix', filter: ['building:single'], op: 'flag', value: 1 }];
    expect(flag(effects, 'allow_mix', ['building:single'], ctx({}))).toBe(true);
    expect(flag(effects, 'allow_mix', ['building:double'], ctx({}))).toBe(false);
  });
});

describe('economy', () => {
  it('price follows base × 1.15^n', () => {
    const e = new Economy();
    expect(e.price('single')).toBeCloseTo(15, 10);
    e.balance = 1000;
    e.buy('single');
    expect(e.price('single')).toBeCloseTo(15 * 1.15, 10);
    e.buy('single');
    expect(e.price('single')).toBeCloseTo(15 * 1.15 * 1.15, 10);
    expect(e.owned('single')).toBe(2);
  });
  it('refuses a purchase it cannot afford', () => {
    const e = new Economy();
    e.balance = 14.9;
    expect(e.buy('single')).toBe(false);
    expect(e.owned('single')).toBe(0);
    expect(e.balance).toBe(14.9);
  });
  it('single building income: 1 + 0.1 × (n − 1)', () => {
    const e = new Economy();
    const tags = ['board:auto', 'building:single', 'clear:single'];
    expect(e.incomeMultiplier(tags)).toBe(1);
    e.setOwned('single', 1);
    expect(e.incomeMultiplier(tags)).toBe(1);
    e.setOwned('single', 4);
    expect(e.incomeMultiplier(tags)).toBeCloseTo(1.3, 10);
    // Manual play is untouched by the building bonus.
    expect(e.incomeMultiplier(['board:manual', 'clear:single'])).toBe(1);
    expect(e.earn(1, tags)).toBeCloseTo(1.3, 10);
    expect(e.balance).toBeCloseTo(1.3, 10);
  });
});

describe('number formatting', () => {
  it('formats per the idle convention', () => {
    expect(format(0)).toBe('0');
    expect(format(12.5)).toBe('12.5');
    expect(format(999.94)).toBe('999.9');
    expect(format(1234)).toBe('1.23K');
    expect(format(12345)).toBe('12.3K');
    expect(format(123456)).toBe('123K');
    expect(format(1.5e6)).toBe('1.50M');
    expect(format(2e9)).toBe('2.00B');
    expect(format(3e12)).toBe('3.00T');
    expect(format(4e15)).toBe('4.00Qa');
    expect(format(5e18)).toBe('5.00Qi');
    expect(format(1e40)).toBe('1.00e40');
  });
});
