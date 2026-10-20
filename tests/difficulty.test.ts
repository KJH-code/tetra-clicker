import { describe, expect, it } from 'vitest';
import { LEVELS, gravityAt, firstInfiniteLevel, lockAt } from '../src/data/levels';
import { EVENTS } from '../src/data/events';
import { World } from '../src/sim/world';
import { Game } from '../src/sim/game';
import { evaluate } from '../src/sim/effects';

describe('normal runs climb gravity at half the pace', () => {
  it('20G at level 39 in normal, 20 in hardcore', () => {
    const p = LEVELS.gravityPace;
    expect(gravityAt(1, p)).toBe(0.5);
    expect(gravityAt(3, p)).toBeCloseTo(0.7, 9);
    expect(gravityAt(2, p)).toBeCloseTo(0.6, 9); // between table entries
    expect(Number.isFinite(gravityAt(38, p))).toBe(true);
    expect(gravityAt(39, p)).toBe(Infinity);
    expect(firstInfiniteLevel(p)).toBe(39);
    expect(firstInfiniteLevel(1)).toBe(20);
    expect(gravityAt(19, 1)).toBe(18);
    expect(gravityAt(20, 1)).toBe(Infinity);
  });

  it('the hardcore effect doubles the pace back to the full table', () => {
    const w = new World(1);
    const pace = () => evaluate(w.economy.effects, 'gravity_pace', [], w.economy, LEVELS.gravityPace);
    expect(pace()).toBe(0.5);
    w.economy.meta.hardcore = true;
    expect(pace()).toBe(1);
  });
});

describe('past 20G the lock delay shrinks', () => {
  it('500 ms and 15 resets until 20G, then 15 ms a level and a reset every two, to 200 ms and 8', () => {
    expect(lockAt(38, 0.5)).toEqual({ delayMs: 500, resets: 15 });
    expect(lockAt(39, 0.5)).toEqual({ delayMs: 500, resets: 15 });
    expect(lockAt(40, 0.5)).toEqual({ delayMs: 485, resets: 15 });
    expect(lockAt(41, 0.5)).toEqual({ delayMs: 470, resets: 14 });
    expect(lockAt(21, 1)).toEqual({ delayMs: 485, resets: 15 });
    expect(lockAt(200, 0.5)).toEqual({ delayMs: 200, resets: 8 });
  });

  it('the game locks at the delay it is given', () => {
    const g = new Game(1);
    g.lockDelayMs = 200;
    // 20G puts the piece on the floor at once; it then rests 200 ms.
    expect(g.tick(150, Infinity)).toBeNull();
    expect(g.tick(60, Infinity)).not.toBeNull();
  });
});

describe('normal rivals are slower', () => {
  it('half the climb and a 1 PPS cap; hardcore keeps 2', () => {
    expect(EVENTS.rival.pps(20, EVENTS.rival.pace)).toBe(1);
    expect(EVENTS.rival.pps(5, EVENTS.rival.pace)).toBeCloseTo(0.65, 9);
    expect(EVENTS.rival.pps(40, 1)).toBe(2);
    expect(EVENTS.rival.pps(10, 1)).toBeCloseTo(1.1, 9);
  });
});

describe('manual pay by level', () => {
  it('×level to level 10, then 0.25 more a level', async () => {
    const { levelPay } = await import('../src/data/levels');
    expect([1, 4, 10, 11, 20, 40].map(levelPay)).toEqual([1, 4, 10, 10.25, 12.5, 17.5]);
  });
});
