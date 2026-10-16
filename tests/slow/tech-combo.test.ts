import { it, expect } from 'vitest';
import { checkTechBot } from './techRun';

it('COMBO: builds, then cuts long combos', () => {
  checkTechBot('combo', (rs) => {
    expect(Math.max(...rs.map((r) => r.comboIndex))).toBeGreaterThanOrEqual(8);
    // Runs that reach a sixth clear.
    expect(rs.filter((r) => r.comboIndex === 5).length).toBeGreaterThan(100);
  });
}, 3_600_000);
