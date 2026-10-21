import { describe, expect, it } from 'vitest';
import { Roller } from '../src/render/roll';

describe('rolling counter', () => {
  it('starts at its target, rolls up to a gain and drops at once', () => {
    const r = new Roller();
    expect(r.value(100, 0)).toBe(100);
    const mid = r.value(1100, 16);
    expect(mid).toBeGreaterThan(100);
    expect(mid).toBeLessThan(1100);
    let v = mid;
    for (let t = 32; t < 1000; t += 16) v = r.value(1100, t);
    expect(v).toBe(1100);
    expect(r.value(50, 1016)).toBe(50);
  });
});
