import { describe, expect, it } from 'vitest';
import { byPrice } from '../src/ui/upgradeChips';

describe('upgrade chips', () => {
  it('run cheapest first, ties in the data order', () => {
    const prices: Record<string, number> = { wrath_1: 5_000, ms_single_1: 1_100, manual_1: 2_000, ms_double_1: 2_000 };
    const order = byPrice(['wrath_1', 'ms_single_1', 'manual_1', 'ms_double_1'].map((id) => ({ id })), (id) => prices[id]!);
    expect(order.map((u) => u.id)).toEqual(['ms_single_1', 'manual_1', 'ms_double_1', 'wrath_1']);
  });
});
