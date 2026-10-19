import { describe, expect, test } from 'vitest';
import { durationParts, nextGoal, type GoalBuilding } from '../src/ui/goal';

const b = (id: string, price: number, owned: number, unlocked = true): GoalBuilding => ({ id, name: id.toUpperCase(), price, owned, unlocked });

describe('next goal', () => {
  test('the first building not yet owned, and the time PER SECOND takes to reach it', () => {
    const g = nextGoal([b('single', 100, 3), b('double', 250, 0), b('triple', 900, 0, false)], 50, 10)!;
    expect(g.id).toBe('double');
    expect(g.name).toBe('DOUBLE');
    expect(g.seconds).toBe(20);
    expect(g.progress).toBeCloseTo(0.2);
  });

  test('a locked one stays unnamed', () => {
    expect(nextGoal([b('single', 100, 1), b('double', 250, 0, false)], 0, 1)!.name).toBe('???');
  });

  test('affordable now is 0 s; no income is no estimate', () => {
    expect(nextGoal([b('single', 100, 0)], 150, 0)!.seconds).toBe(0);
    expect(nextGoal([b('single', 100, 0)], 50, 0)!.seconds).toBeNull();
  });

  test('every kind owned: the cheapest next copy', () => {
    expect(nextGoal([b('single', 500, 9), b('double', 300, 2)], 0, 1)!.id).toBe('double');
    expect(nextGoal([], 0, 1)).toBeNull();
  });

  test('durations keep two units at most', () => {
    expect(durationParts(44.2)).toEqual({ key: '{n}s', vars: { n: 45 } });
    expect(durationParts(750)).toEqual({ key: '{m}m', vars: { m: 12 } });
    expect(durationParts(3 * 3600 + 20 * 60)).toEqual({ key: '{h}h {m}m', vars: { h: 3, m: 20 } });
    expect(durationParts(2 * 86400 + 5 * 3600 + 7)).toEqual({ key: '{d}d {h}h', vars: { d: 2, h: 5 } });
  });
});
