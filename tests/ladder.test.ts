import { describe, it, expect } from 'vitest';
import { simulate, DEFAULT_PLAYER, DEFAULT_TARGET } from '../src/sim/simulate';
import { LADDER } from '../src/data/ladder';
import { BUILDINGS } from '../src/data/buildings';

describe('ladder numbers', () => {
  it('every building unlocks within 25% of its target time under the default player', () => {
    // RIVAL's target is about 260 days out.
    const r = simulate({ buildings: LADDER, player: DEFAULT_PLAYER, target: DEFAULT_TARGET, horizonSeconds: 300 * 86_400 });
    for (const b of LADDER) {
      const t = r.firstUnlock[b.id];
      expect(t, b.id).toBeDefined();
      expect(t! / r.target[b.id]!, b.id).toBeGreaterThan(0.75);
      expect(t! / r.target[b.id]!, b.id).toBeLessThan(1.25);
    }
  });
  it('the shop building matches its ladder entry', () => {
    const single = LADDER.find((b) => b.id === 'single')!;
    const shop = BUILDINGS.find((b) => b.id === 'single')!;
    expect(shop.basePrice).toBe(single.basePrice);
    expect(shop.priceGrowth).toBe(single.growth);
    expect(shop.pps).toBe(single.pps);
    expect(shop.effects[0]?.value).toBe(single.bonusPct);
  });
});
