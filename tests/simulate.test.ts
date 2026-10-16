import { describe, it, expect } from 'vitest';
import { simulate, DEFAULT_PLAYER, DEFAULT_TARGET, type BuildingParams, type SimParams } from '../src/sim/simulate';
import { LADDER } from '../src/data/ladder';
import { World } from '../src/sim/world';

const single: BuildingParams = { id: 'single', name: 'SINGLE', basePrice: 30, growth: 1.15, pps: 1, linesPerPiece: 0.8, bonusPct: 10 };

const base = (over: Partial<SimParams> = {}): SimParams => ({
  buildings: [single], player: { ...DEFAULT_PLAYER }, horizonSeconds: 3600, target: { ...DEFAULT_TARGET }, ...over,
});

describe('economy simulator', () => {
  it('first purchase lands at price ÷ manual rate when only manual income exists', () => {
    const r = simulate(base({ player: { pps: 0.5, linesPerPiece: 0.9, focusMinutes: 60, dailyMinutes: 60 } }));
    expect(r.purchases[0]?.id).toBe('single');
    expect(r.purchases[0]?.t).toBeCloseTo(30 / (0.5 * 0.9), 6);
    expect(r.firstUnlock['single']).toBeCloseTo(30 / 0.45, 6);
  });

  it('prices and bot income match the game for the same owned count', () => {
    // Upgrades off: this compares the building arithmetic alone.
    const r = simulate(base({ horizonSeconds: 7 * 86_400, upgrades: false }));
    const third = r.purchases.find((p) => p.id === 'single' && p.n === 3)!;
    expect(third).toBeDefined();
    const w = new World(1);
    w.economy.balance = 1e9;
    w.buy('single'); w.buy('single');
    // The third copy costs what the game charges after two are owned.
    expect(third.price).toBeCloseTo(Number(w.economy.price('single')), 10);
    w.buy('single');
    // Game: 1 PPS × 0.8 × (1 + 0.1 × 2)
    expect(third.incomeAfter).toBeCloseTo(Number(w.incomePerSecond()), 10);
  });

  it('buys the shortest payback first, not the cheapest', () => {
    const cheapSlow: BuildingParams = { id: 'a', name: 'A', basePrice: 100, growth: 1.15, pps: 1, linesPerPiece: 0.1, bonusPct: 10 };
    const pricyFast: BuildingParams = { id: 'b', name: 'B', basePrice: 200, growth: 1.15, pps: 1, linesPerPiece: 1, bonusPct: 10 };
    const r = simulate(base({ buildings: [cheapSlow, pricyFast], player: { pps: 1, linesPerPiece: 1, focusMinutes: 600, dailyMinutes: 60 } }));
    expect(r.purchases[0]?.id).toBe('b');
  });

  it('unlocks the ladder in order', () => {
    const r = simulate(base({ buildings: LADDER, horizonSeconds: 365 * 86_400 }));
    const times = LADDER.map((b) => r.firstUnlock[b.id]).filter((t): t is number => t !== undefined);
    expect(times.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThan(times[i - 1]!);
    expect(Object.keys(r.target)).toHaveLength(LADDER.length);
    expect(r.target['double']).toBeCloseTo(DEFAULT_TARGET.firstSeconds * DEFAULT_TARGET.ratio, 10);
  });

  it('manual income drops to the daily share after the focus window', () => {
    const unaffordable: BuildingParams = { ...single, basePrice: 1e12 };
    const r = simulate(base({ buildings: [unaffordable], player: { pps: 1, linesPerPiece: 1, focusMinutes: 1, dailyMinutes: 144 }, horizonSeconds: 600 }));
    const before = r.series.filter((s) => s.t < 60);
    const after = r.series.filter((s) => s.t > 60);
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);
    for (const s of before) expect(s.income).toBeCloseTo(1, 10);
    for (const s of after) expect(s.income).toBeCloseTo(0.1, 10);
    expect(r.purchases).toHaveLength(0);
  });

  it('is deterministic and fast over a week', () => {
    const p = base({ buildings: LADDER, horizonSeconds: 7 * 86_400 });
    const t0 = Date.now();
    const a = simulate(p);
    // One run, with headroom: the full suite runs the bot tests alongside.
    expect(Date.now() - t0).toBeLessThan(3000);
    const b = simulate(p);
    expect(a).toEqual(b);
    expect(a.series.length).toBeLessThan(2000);
  });

  it('buys milestone and manual upgrades when they pay off sooner', () => {
    const r = simulate(base({ buildings: LADDER, horizonSeconds: 7 * 86_400 }));
    const ids = r.purchases.filter((p) => p.kind === 'upgrade').map((p) => p.id);
    expect(ids).toContain('ms_single_1');
    expect(ids.some((id) => id.startsWith('manual_'))).toBe(true);
    // Upgrades are only ever bought once.
    expect(new Set(ids).size).toBe(ids.length);
    const off = simulate(base({ buildings: LADDER, horizonSeconds: 7 * 86_400, upgrades: false }));
    expect(off.purchases.every((p) => p.kind !== 'upgrade')).toBe(true);
    expect(r.finalIncome).toBeGreaterThan(off.finalIncome);
  });
});
