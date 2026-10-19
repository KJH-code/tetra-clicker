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

  test('a locked one is named too', () => {
    // Locked or not, the next building is named: it is the goal.
    expect(nextGoal([b('single', 100, 1), b('double', 250, 0, false)], 0, 1)!.name).toBe('DOUBLE');
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

describe('achievements near done', () => {
  test('counted ones only, furthest first, hidden and met left out', async () => {
    const { nearAchievements } = await import('../src/ui/goal');
    const defs = [
      { id: 'a', name: 'A', desc: '', when: [{ type: 'career' as const, stat: 'tsd', gte: 10 }] },
      { id: 'b', name: 'B', desc: '', when: [{ type: 'owned' as const, id: 'single', gte: 10 }] },
      { id: 'c', name: 'C', desc: '', when: [{ type: 'hardcore' as const }] },
      { id: 'd', name: 'D', desc: '', hidden: true, when: [{ type: 'career' as const, stat: 'tsd', gte: 1 }] },
      { id: 'e', name: 'E', desc: '', when: [{ type: 'career' as const, stat: 'pcs', gte: 1 }] },
    ];
    const ctx = { owned: () => 7, career: (s: string) => (s === 'tsd' ? 3 : 0) };
    const near = nearAchievements(defs, new Set(['e']), ctx, 2);
    expect(near.map((a) => a.id)).toEqual(['b', 'a']);
    expect(near[0]).toMatchObject({ value: 7, goal: 10 });
  });
});
