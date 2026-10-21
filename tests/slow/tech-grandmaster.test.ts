import { it, expect } from 'vitest';
import { checkTechBot, share } from './techRun';

it('GRANDMASTER: tetrises at 20G, never topping out', () => {
  checkTechBot('grandmaster', (rs) => {
    expect(share(rs, (r) => r.lines === 4)).toBeGreaterThan(0.02);
  });
}, 3_600_000);
