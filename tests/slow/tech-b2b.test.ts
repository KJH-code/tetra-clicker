import { it, expect } from 'vitest';
import { checkTechBot, share } from './techRun';

it('B2B: tetrises and TSDs back to back', () => {
  checkTechBot('b2b', (rs) => {
    expect(share(rs, (r) => r.b2bExtended)).toBeGreaterThan(0.12);
  });
}, 3_600_000);
