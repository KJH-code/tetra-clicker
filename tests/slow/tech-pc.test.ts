import { it, expect } from 'vitest';
import { checkTechBot, share } from './techRun';

it('PERFECT: a PC loop, one per ten pieces nearly every time', () => {
  checkTechBot('pc', (rs) => {
    expect(share(rs, (r) => r.perfectClear)).toBeGreaterThan(0.09);
  });
}, 3_600_000);
