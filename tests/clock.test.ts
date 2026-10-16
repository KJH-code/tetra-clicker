import { describe, it, expect } from 'vitest';
import { classifyGap } from '../src/sim/clock';
import { World } from '../src/sim/world';

describe('gap classification', () => {
  it('short gaps are simulated, long ones use the formula, very long ones are sleep', () => {
    expect(classifyGap(16)).toBe('sim');
    expect(classifyGap(2000)).toBe('sim');
    expect(classifyGap(2001)).toBe('formula');
    expect(classifyGap(5_000)).toBe('formula');
    expect(classifyGap(60_000)).toBe('formula');
    expect(classifyGap(119_000)).toBe('formula');
    expect(classifyGap(120_000)).toBe('formula');
    expect(classifyGap(121_000)).toBe('sleep');
    expect(classifyGap(3_600_000)).toBe('sleep');
  });
});

describe('world time with a fake clock', () => {
  function worldWithBoard(): World {
    const w = new World(1);
    w.economy.balance = 1000;
    w.buy('single');
    w.economy.balance = 0;
    w.advance(0);
    return w;
  }

  it.each([5, 60, 119])('a %ds gap is paid with the formula', (seconds) => {
    const w = worldWithBoard();
    w.advance(seconds * 1000);
    // PPS 1 × 0.8 Lines per piece × multiplier 1 (one copy owned), paid in whole Lines
    expect(w.economy.balance).toBe(Math.floor(seconds * 0.8 + 1e-9));
  });

  it.each([121, 3600])('a %ds gap is treated as sleep and pays nothing', (seconds) => {
    const w = worldWithBoard();
    w.advance(seconds * 1000);
    expect(w.economy.balance).toBe(0);
    expect(w.drainEvents().some((e) => e.type === 'slept')).toBe(true);
  });

  it('short gaps run the bot for real', () => {
    const w = worldWithBoard();
    for (let t = 16; t <= 30_000; t += 16) w.advance(t);
    const moves = w.drainEvents().filter((e) => e.type === 'botMove');
    // 30 seconds at 1 PPS
    expect(moves.length).toBeGreaterThanOrEqual(29);
    expect(moves.length).toBeLessThanOrEqual(31);
    expect(w.economy.balance).toBeGreaterThan(0);
  });

  it('income per second reflects owned copies', () => {
    const w = worldWithBoard();
    expect(w.incomePerSecond()).toBeCloseTo(0.8, 10);
    w.economy.balance = 1e6;
    w.buy('single');
    w.buy('single');
    expect(w.autoBoards).toHaveLength(1);
    expect(w.incomePerSecond()).toBeCloseTo(0.8 * 1.2, 10);
  });

  it('bots earn flat singles: no combo, b2b, spin or PC bonus', () => {
    const w = worldWithBoard();
    for (let t = 16; t <= 600_000; t += 16) w.advance(t);
    const moves = w.drainEvents().filter((e) => e.type === 'botMove');
    for (const m of moves) {
      if (m.type !== 'botMove') continue;
      expect(m.move.result.lines).toBeLessThanOrEqual(1);
      expect(Number(m.earned)).toBe(m.move.result.lines * 2);
    }
  });
});
