import { it, expect } from 'vitest';
import { checkTechBot, share } from './techRun';

it('DOWNSTACK: digs its own garbage and keeps up with it', () => {
  checkTechBot('downstack', (rs) => {
    // A garbage row comes every fourth piece; it clears about as many.
    const rows = rs.reduce((n, r) => n + (r.garbageCleared ? r.garbageCleared.clean + r.garbageCleared.cheese : 0), 0);
    expect(rows / rs.length).toBeGreaterThan(0.23);
    expect(share(rs, (r) => (r.garbageCleared?.cheese ?? 0) > 0)).toBeGreaterThan(0.05);
  });
}, 3_600_000);
