import { it, expect } from 'vitest';
import { checkTechBot } from './techRun';

it('4-WIDE: combos run long in the walled well', () => {
  checkTechBot('fourwide', (rs) => {
    expect(Math.max(...rs.map((r) => r.comboIndex))).toBeGreaterThan(50);
    // Nearly every piece clears a row.
    expect(rs.filter((r) => r.lines > 0).length / rs.length).toBeGreaterThan(0.8);
  });
}, 3_600_000);
