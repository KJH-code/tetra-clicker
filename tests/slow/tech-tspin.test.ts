import { it, expect } from 'vitest';
import { checkTechBot, share } from './techRun';

it('T-SPIN: a TSD from nearly every T, never a single or triple', () => {
  checkTechBot('tspin', (rs) => {
    // One T in seven pieces caps this at 14.3 per 100.
    expect(share(rs, (r) => r.piece === 'T' && r.spin === 'full' && r.lines === 2)).toBeGreaterThan(0.12);
    expect(rs.filter((r) => r.piece === 'T' && r.spin === 'full' && (r.lines === 1 || r.lines === 3))).toHaveLength(0);
  });
}, 3_600_000);
