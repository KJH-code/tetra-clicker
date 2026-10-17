import { it, expect } from 'vitest';
import { checkTechBot, share } from './techRun';

it('OPENER: PC, TSD, PC on a loop', () => {
  checkTechBot('opener', (rs) => {
    expect(share(rs, (r) => r.perfectClear)).toBeGreaterThan(0.05);
    expect(share(rs, (r) => r.piece === 'T' && r.spin === 'full' && r.lines === 2)).toBeGreaterThan(0.025);
  });
}, 3_600_000);
