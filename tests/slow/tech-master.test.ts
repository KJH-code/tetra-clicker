import { it, expect } from 'vitest';
import { checkTechBot, share } from './techRun';

it('MASTER: spins, combos, chains and tetrises, all in one run', () => {
  checkTechBot('master', (rs) => {
    expect(share(rs, (r) => r.spin === 'full' && r.lines > 0)).toBeGreaterThan(0.05);
    expect(share(rs, (r) => r.comboIndex > 0)).toBeGreaterThan(0.02);
    expect(share(rs, (r) => r.b2bExtended)).toBeGreaterThan(0.05);
    expect(share(rs, (r) => r.lines === 4)).toBeGreaterThan(0.01);
  });
}, 3_600_000);
