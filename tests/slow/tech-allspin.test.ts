import { it, expect } from 'vitest';
import { checkTechBot, share } from './techRun';

it('ALL-SPIN: spins with every piece, not only T', () => {
  checkTechBot('allspin', (rs) => {
    expect(share(rs, (r) => r.spin === 'full' && r.lines > 0 && r.piece !== 'T')).toBeGreaterThan(0.09);
  });
}, 3_600_000);
